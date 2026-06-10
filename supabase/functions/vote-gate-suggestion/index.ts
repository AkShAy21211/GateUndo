import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SuggestionVote = "confirm" | "reject";

type VotePayload = {
  suggestion_id?: string;
  vote?: SuggestionVote;
  device_id?: string;
  user_lat?: number | null;
  user_lng?: number | null;
  turnstile_token?: string | null;
};

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

type GateSuggestion = {
  id: string;
  lat: number;
  lng: number;
  status: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VOTE_COOLDOWN_WINDOW_SECONDS = 600;
const MAX_VOTES_PER_WINDOW = 12;
const NEARBY_CONFIRM_DISTANCE_KM = 0.5;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "server_not_configured" }, 500);
  }

  let payload: VotePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const suggestionId = payload.suggestion_id;
  const vote = payload.vote;
  const deviceId = payload.device_id;

  if (
    !suggestionId ||
    !isUuid(suggestionId) ||
    !isVote(vote) ||
    !deviceId ||
    !isUuid(deviceId)
  ) {
    return jsonResponse({ error: "invalid_vote" }, 400);
  }

  const sourceIp = getSourceIp(request);
  const turnstileSecretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

  if (turnstileSecretKey) {
    const isHuman = await verifyTurnstileToken({
      secretKey: turnstileSecretKey,
      token: payload.turnstile_token,
      remoteIp: sourceIp,
    });

    if (!isHuman) {
      return jsonResponse({ error: "bot_check_failed" }, 403);
    }
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const voterHash = await getReporterHash({
    request,
    fallbackSalt: serviceRoleKey,
    deviceId,
    sourceIp,
  });
  const cooldownCutoff = new Date(
    Date.now() - VOTE_COOLDOWN_WINDOW_SECONDS * 1000,
  ).toISOString();

  const { count, error: voteCountError } = await supabase
    .from("gate_suggestion_votes")
    .select("id", { count: "exact", head: true })
    .eq("voter_hash", voterHash)
    .gte("created_at", cooldownCutoff);

  if (voteCountError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if ((count ?? 0) >= MAX_VOTES_PER_WINDOW) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  const { data: suggestion, error: suggestionError } = await supabase
    .from("gate_suggestions")
    .select("id, lat, lng, status")
    .eq("id", suggestionId)
    .maybeSingle<GateSuggestion>();

  if (suggestionError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (
    !suggestion ||
    !["pending", "community_confirmed"].includes(suggestion.status)
  ) {
    return jsonResponse({ error: "suggestion_not_found" }, 404);
  }

  const isNearby =
    vote === "confirm" &&
    isKeralaCoordinate(payload.user_lat, payload.user_lng) &&
    distanceInKm(
      payload.user_lat!,
      payload.user_lng!,
      suggestion.lat,
      suggestion.lng,
    ) <= NEARBY_CONFIRM_DISTANCE_KM;

  const { error: upsertError } = await supabase
    .from("gate_suggestion_votes")
    .upsert(
      {
        suggestion_id: suggestionId,
        vote,
        voter_hash: voterHash,
        is_nearby: isNearby,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: "suggestion_id,voter_hash",
      },
    );

  if (upsertError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  const { data: updatedSuggestion, error: updatedError } = await supabase
    .from("gate_suggestions")
    .select(
      "id, district, lat, lng, road_name, note, status, confirm_count, reject_count, nearby_confirm_count, created_at, updated_at",
    )
    .eq("id", suggestionId)
    .single();

  if (updatedError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  return jsonResponse({ suggestion: updatedSuggestion }, 200);
});

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isVote(value: unknown): value is SuggestionVote {
  return value === "confirm" || value === "reject";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isKeralaCoordinate(lat: unknown, lng: unknown) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 8.0 &&
    lat <= 13.0 &&
    lng >= 74.5 &&
    lng <= 78.0
  );
}

function getSourceIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function getReporterHash({
  request,
  fallbackSalt,
  deviceId,
  sourceIp,
}: {
  request: Request;
  fallbackSalt: string;
  deviceId: string;
  sourceIp: string;
}) {
  const userAgent = request.headers.get("user-agent") || "unknown";
  const salt = Deno.env.get("REPORT_HASH_SALT") || fallbackSalt;
  const input = `${sourceIp}:${userAgent}:${deviceId}:${salt}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyTurnstileToken({
  secretKey,
  token,
  remoteIp,
}: {
  secretKey: string;
  token?: string | null;
  remoteIp: string;
}) {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          secret: secretKey,
          response: token,
          remoteip: remoteIp,
        }),
      },
    );
    const result = (await response.json()) as TurnstileResponse;

    return response.ok && result.success;
  } catch {
    return false;
  }
}

function distanceInKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
