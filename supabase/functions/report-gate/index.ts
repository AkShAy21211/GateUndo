import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReportStatus = "open" | "closed";

type ReportPayload = {
  gate_id?: string;
  status?: ReportStatus;
  device_id?: string;
  user_lat?: number | null;
  user_lng?: number | null;
  turnstile_token?: string | null;
};

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPORT_COOLDOWN_SECONDS = 120;
const NEARBY_REPORT_DISTANCE_KM = 0.2;

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

  let payload: ReportPayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const gateId = payload.gate_id;
  const status = payload.status;
  const deviceId = payload.device_id;

  if (
    !gateId ||
    !isUuid(gateId) ||
    !isReportStatus(status) ||
    !deviceId ||
    !isUuid(deviceId)
  ) {
    return jsonResponse({ error: "invalid_report" }, 400);
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

  const reporterHash = await getReporterHash({
    request,
    fallbackSalt: serviceRoleKey,
    deviceId,
    sourceIp,
  });
  const cooldownCutoff = new Date(
    Date.now() - REPORT_COOLDOWN_SECONDS * 1000,
  ).toISOString();

  const { data: gate, error: gateError } = await supabase
    .from("gates")
    .select("id, lat, lng")
    .eq("id", gateId)
    .maybeSingle<{ id: string; lat: number; lng: number }>();

  if (gateError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (!gate) {
    return jsonResponse({ error: "gate_not_found" }, 404);
  }

  const { data: recentReport, error: recentError } = await supabase
    .from("reports")
    .select("id")
    .eq("gate_id", gateId)
    .eq("reporter_hash", reporterHash)
    .gte("reported_at", cooldownCutoff)
    .limit(1)
    .maybeSingle();

  if (recentError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  if (recentReport) {
    return jsonResponse(
      {
        error: "rate_limited",
        retry_after_seconds: REPORT_COOLDOWN_SECONDS,
      },
      429,
    );
  }

  const reportDistanceKm = isKeralaCoordinate(
    payload.user_lat,
    payload.user_lng,
  )
    ? distanceInKm(payload.user_lat!, payload.user_lng!, gate.lat, gate.lng)
    : null;
  const isNearby =
    reportDistanceKm !== null && reportDistanceKm <= NEARBY_REPORT_DISTANCE_KM;

  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({
      gate_id: gateId,
      status,
      reporter_hash: reporterHash,
      user_lat: reportDistanceKm === null ? null : payload.user_lat,
      user_lng: reportDistanceKm === null ? null : payload.user_lng,
      distance_meters:
        reportDistanceKm === null ? null : Math.round(reportDistanceKm * 1000),
      is_nearby: isNearby,
    })
    .select("id, status, reported_at, is_nearby, distance_meters")
    .single();

  if (insertError) {
    return jsonResponse({ error: "server_error" }, 500);
  }

  runAfterResponse(cleanupOldReports(supabase));

  return jsonResponse({ report }, 200);
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

function isReportStatus(value: unknown): value is ReportStatus {
  return value === "open" || value === "closed";
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

async function cleanupOldReports(
  supabase: ReturnType<typeof createClient>,
) {
  await supabase.rpc("cleanup_old_reports");
}

function runAfterResponse(task: Promise<unknown>) {
  const safeTask = task.catch(() => undefined);
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: {
      waitUntil?: (promise: Promise<unknown>) => void;
    };
  };

  if (typeof runtime.EdgeRuntime?.waitUntil === "function") {
    runtime.EdgeRuntime.waitUntil(safeTask);
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
