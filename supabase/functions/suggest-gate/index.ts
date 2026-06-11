import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SuggestGatePayload = {
  district?: string;
  lat?: number;
  lng?: number;
  road_name?: string;
  nearest_station_name?: string | null;
  nearest_station_code?: string | null;
  note?: string | null;
  device_id?: string;
  turnstile_token?: string | null;
};

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

type NearbyPoint = {
  id: string;
  lat: number;
  lng: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DISTRICTS = new Set([
  "Alappuzha",
  "Ernakulam",
  "Idukki",
  "Kannur",
  "Kasaragod",
  "Kollam",
  "Kottayam",
  "Kozhikode",
  "Malappuram",
  "Palakkad",
  "Pathanamthitta",
  "Thrissur",
  "Thiruvananthapuram",
  "Wayanad",
]);

const SUGGESTION_COOLDOWN_SECONDS = 600;
const DUPLICATE_GATE_DISTANCE_KM = 0.15;
const DUPLICATE_SUGGESTION_DISTANCE_KM = 0.1;

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

  let payload: SuggestGatePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const district = payload.district;
  const lat = payload.lat;
  const lng = payload.lng;
  const roadName = cleanText(payload.road_name ?? "", 100);
  const nearestStationName =
    cleanText(payload.nearest_station_name ?? "", 80) || null;
  const nearestStationCode =
    cleanStationCode(payload.nearest_station_code ?? "") || null;
  const note = cleanText(payload.note ?? "", 180) || null;
  const deviceId = payload.device_id;

  if (
    !district ||
    !DISTRICTS.has(district) ||
    !isKeralaCoordinate(lat, lng) ||
    !roadName ||
    roadName.length < 3 ||
    (nearestStationName !== null && nearestStationName.length < 2) ||
    (nearestStationCode !== null && !isStationCode(nearestStationCode)) ||
    !deviceId ||
    !isUuid(deviceId)
  ) {
    return jsonResponse({ error: "invalid_suggestion" }, 400);
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
  const suggesterHash = await getReporterHash({
    request,
    fallbackSalt: serviceRoleKey,
    deviceId,
    sourceIp,
  });
  const cooldownCutoff = new Date(
    Date.now() - SUGGESTION_COOLDOWN_SECONDS * 1000,
  ).toISOString();

  const { data: recentSuggestion, error: recentError } = await supabase
    .from("gate_suggestions")
    .select("id")
    .eq("suggested_by_hash", suggesterHash)
    .gte("created_at", cooldownCutoff)
    .limit(1)
    .maybeSingle();

  if (recentError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (recentSuggestion) {
    return jsonResponse(
      {
        error: "rate_limited",
        retry_after_seconds: SUGGESTION_COOLDOWN_SECONDS,
      },
      429,
    );
  }

  const bounds = coordinateBounds(lat!, lng!, 0.003);

  const { data: nearbyGates, error: gatesError } = await supabase
    .from("gates")
    .select("id, lat, lng")
    .eq("district", district)
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng);

  if (gatesError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (
    hasNearbyPoint(
      nearbyGates ?? [],
      lat!,
      lng!,
      DUPLICATE_GATE_DISTANCE_KM,
    )
  ) {
    return jsonResponse({ error: "gate_already_exists" }, 409);
  }

  const { data: nearbySuggestions, error: suggestionsError } = await supabase
    .from("gate_suggestions")
    .select("id, lat, lng")
    .eq("district", district)
    .in("status", ["pending", "community_confirmed"])
    .gte("lat", bounds.minLat)
    .lte("lat", bounds.maxLat)
    .gte("lng", bounds.minLng)
    .lte("lng", bounds.maxLng);

  if (suggestionsError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (
    hasNearbyPoint(
      nearbySuggestions ?? [],
      lat!,
      lng!,
      DUPLICATE_SUGGESTION_DISTANCE_KM,
    )
  ) {
    return jsonResponse({ error: "suggestion_already_exists" }, 409);
  }

  const { data: suggestion, error: insertError } = await supabase
    .from("gate_suggestions")
    .insert({
      district,
      lat,
      lng,
      road_name: roadName,
      nearest_station_name: nearestStationName,
      nearest_station_code: nearestStationCode,
      note,
      suggested_by_hash: suggesterHash,
    })
    .select(
      "id, district, lat, lng, road_name, nearest_station_name, nearest_station_code, note, status, confirm_count, reject_count, nearby_confirm_count, created_at, updated_at",
    )
    .single();

  if (insertError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  return jsonResponse({ suggestion }, 200);
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

function cleanText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanStationCode(value: string) {
  return value.replace(/\s+/g, "").trim().toUpperCase().slice(0, 12);
}

function isStationCode(value: string) {
  return /^[A-Z0-9]{1,12}$/.test(value);
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

function coordinateBounds(lat: number, lng: number, offset: number) {
  return {
    minLat: lat - offset,
    maxLat: lat + offset,
    minLng: lng - offset,
    maxLng: lng + offset,
  };
}

function hasNearbyPoint(
  points: NearbyPoint[],
  lat: number,
  lng: number,
  maxDistanceKm: number,
) {
  return points.some((point) => {
    return distanceInKm(lat, lng, point.lat, point.lng) <= maxDistanceKm;
  });
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
