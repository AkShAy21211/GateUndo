"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInMinutes } from "date-fns";
import posthog from "posthog-js";
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Heart,
  Info,
  List,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  Signal,
  TrainFront,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type mapboxgl from "mapbox-gl";
import { createClient } from "@/lib/supabase/client";

const DISTRICTS = [
  "All",
  "Kannur",
  "Alappuzha",
  "Ernakulam",
  "Kasaragod",
  "Kollam",
  "Kottayam",
  "Kozhikode",
  "Malappuram",
  "Palakkad",
  "Pathanamthitta",
  "Thrissur",
  "Thiruvananthapuram"
];
const LAUNCH_DISTRICT = "Kannur";
const LAUNCH_SCOPE_LABEL = "Kannur Beta";
type ReportStatus = "open" | "closed";

type GateStatus = ReportStatus | "unknown";

type SignalSource = "none" | "nearby" | "remote" | "mixed";

type SuggestionStatus = "pending" | "community_confirmed";

type SuggestionVote = "confirm" | "reject";

type GateStatusRow = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  road_name: string | null;
  nearest_station_name: string | null;
  nearest_station_code: string | null;
  is_active: boolean;
  inactive_reason: string | null;
  inactive_at: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verification_note: string | null;
  status: GateStatus;
  report_count: number;
  recent_report_count: number;
  recent_nearby_report_count: number;
  recent_open_count: number;
  recent_closed_count: number;
  recent_open_score: number;
  recent_closed_score: number;
  recent_nearby_open_score: number;
  recent_nearby_closed_score: number;
  last_reported_at: string | null;
  signal_source?: SignalSource;
  is_status_unstable?: boolean;
  recent_status_flip_count?: number;
  status_expires_at?: string | null;
};

type GateView = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  roadName: string;
  nearestStationName: string | null;
  nearestStationCode: string | null;
  isActive: boolean;
  inactiveReason: string | null;
  inactiveAt: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  verificationNote: string | null;
  status: GateStatus;
  reportCount: number;
  recentReportCount: number;
  recentNearbyReportCount: number;
  recentOpenCount: number;
  recentClosedCount: number;
  recentOpenScore: number;
  recentClosedScore: number;
  recentNearbyOpenScore: number;
  recentNearbyClosedScore: number;
  lastReportedAt: string | null;
  signalSource: SignalSource;
  isStatusUnstable: boolean;
  recentStatusFlipCount: number;
  statusExpiresAt: string | null;
};

type GateSuggestionRow = {
  id: string;
  district: string;
  lat: number;
  lng: number;
  road_name: string;
  nearest_station_name: string | null;
  nearest_station_code: string | null;
  note: string | null;
  status: SuggestionStatus;
  confirm_count: number;
  reject_count: number;
  nearby_confirm_count: number;
  created_at: string;
  updated_at: string;
};

type GateSuggestionView = {
  id: string;
  district: string;
  lat: number;
  lng: number;
  roadName: string;
  nearestStationName: string | null;
  nearestStationCode: string | null;
  note: string | null;
  status: SuggestionStatus;
  confirmCount: number;
  rejectCount: number;
  nearbyConfirmCount: number;
  createdAt: string;
  updatedAt: string;
};

type UserLocation = {
  lat: number;
  lng: number;
};

type SuggestionDraft = {
  lat: number;
  lng: number;
};

type ViewMode = "list" | "map";

type StatusView = {
  dot: string;
  badge: string;
  label: string;
  Icon: LucideIcon;
};

type TrustView = {
  label: string;
  detail: string;
  className: string;
  Icon: LucideIcon;
};

type VerificationView = {
  label: string;
  detail: string;
  className: string;
  Icon: LucideIcon;
};

type HeaderStatus = {
  label: string;
  detail: string;
  className: string;
  dotClassName: string;
  Icon: LucideIcon;
};

type ReportInvokeError = {
  message: string;
  context?: {
    status?: number;
  };
};

type ReportFunctionData = {
  report?: {
    status: ReportStatus;
    reported_at: string | null;
    is_nearby?: boolean;
    distance_meters?: number | null;
  };
};

type GateSuggestionFunctionData = {
  suggestion?: GateSuggestionRow;
};

type GateCachePayload = {
  version: number;
  cachedAt: string;
  gates: GateView[];
};

type SuggestionCachePayload = {
  version: number;
  cachedAt: string;
  suggestions: GateSuggestionView[];
};

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "auto" | "dark" | "light";
      size?: "normal" | "compact" | "flexible";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const supabase = createClient();
const KERALA_CENTER: [number, number] = [76.2711, 10.8505];
const STALE_AFTER_MS = 75000;
const SUPABASE_TIMEOUT_MS = 5000;
const REPORT_NEARBY_DISTANCE_KM = 0.2;
const REPORT_MAX_DISTANCE_KM = 1;
const NEARBY_SUGGESTION_DISTANCE_KM = 5;
const LIST_SUGGESTION_LIMIT = 3;
const DEVICE_ID_KEY = "railundo_device_id";
const SUGGESTION_VOTES_KEY = "railundo_suggestion_votes";
const GATE_CACHE_KEY = "railundo_gate_cache";
const SUGGESTION_CACHE_KEY = "railundo_suggestion_cache";
const BETA_BANNER_DISMISSED_UNTIL_KEY = "gateundo_beta_banner_dismissed_until";
const BETA_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_CACHE_VERSION = 4;
const TRAIN_CHECK_URL = "https://enquiry.indianrail.gov.in/";
const TURNSTILE_SCRIPT_ID = "railundo-turnstile-script";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const TURNSTILE_HELP_TEXT =
  "Security check unavailable. Check your connection or try again.";
const isTurnstileEnabled = Boolean(
  TURNSTILE_SITE_KEY && TURNSTILE_SITE_KEY !== "your_turnstile_site_key",
);

function formatLastReported(reportedAt: string | null) {
  if (!reportedAt) {
    return "no reports yet";
  }

  const diffMinutes = Math.max(
    0,
    differenceInMinutes(new Date(), new Date(reportedAt)),
  );

  if (diffMinutes < 1) {
    return "last just now";
  }

  return `last ${diffMinutes} min ago`;
}

function formatUpdatedAt(updatedAt: Date | null, currentTime: number) {
  if (!updatedAt) {
    return "not updated yet";
  }

  const diffMinutes = Math.max(
    0,
    Math.floor((currentTime - updatedAt.getTime()) / 60000),
  );

  if (diffMinutes < 1) {
    return "updated just now";
  }

  return `updated ${diffMinutes} min ago`;
}

async function withTimeout<T>(
  request: PromiseLike<T>,
  timeoutMessage = "Request timed out",
) {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      request,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error(timeoutMessage)),
          SUPABASE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

function getDeviceId() {
  const existingId = window.localStorage.getItem(DEVICE_ID_KEY);

  if (existingId) {
    return existingId;
  }

  const nextId =
    "randomUUID" in window.crypto
      ? window.crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (value) =>
          (
            Number(value) ^
            (window.crypto.getRandomValues(new Uint8Array(1))[0] &
              (15 >> (Number(value) / 4)))
          ).toString(16),
        );

  window.localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

function getStoredSuggestionVotes() {
  try {
    const storedVotes = window.localStorage.getItem(SUGGESTION_VOTES_KEY);

    if (!storedVotes) {
      return {};
    }

    const parsedVotes = JSON.parse(storedVotes) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsedVotes).filter((entry): entry is [string, SuggestionVote] => {
        return entry[1] === "confirm" || entry[1] === "reject";
      }),
    );
  } catch {
    return {};
  }
}

function storeSuggestionVote(suggestionId: string, vote: SuggestionVote) {
  try {
    const nextVotes = {
      ...getStoredSuggestionVotes(),
      [suggestionId]: vote,
    };

    window.localStorage.setItem(
      SUGGESTION_VOTES_KEY,
      JSON.stringify(nextVotes),
    );

    return nextVotes;
  } catch {
    return {
      [suggestionId]: vote,
    };
  }
}

function readGateCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedValue = window.localStorage.getItem(GATE_CACHE_KEY);

    if (!cachedValue) {
      return null;
    }

    const parsedCache = JSON.parse(cachedValue) as Partial<GateCachePayload>;

    if (
      parsedCache.version !== DATA_CACHE_VERSION ||
      typeof parsedCache.cachedAt !== "string" ||
      Number.isNaN(new Date(parsedCache.cachedAt).getTime()) ||
      !Array.isArray(parsedCache.gates)
    ) {
      return null;
    }

    return {
      version: DATA_CACHE_VERSION,
      cachedAt: parsedCache.cachedAt,
      gates: parsedCache.gates,
    };
  } catch {
    return null;
  }
}

function writeGateCache(gates: GateView[], cachedAt: Date) {
  try {
    window.localStorage.setItem(
      GATE_CACHE_KEY,
      JSON.stringify({
        version: DATA_CACHE_VERSION,
        cachedAt: cachedAt.toISOString(),
        gates,
      } satisfies GateCachePayload),
    );
  } catch {}
}

function readSuggestionCache() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedValue = window.localStorage.getItem(SUGGESTION_CACHE_KEY);

    if (!cachedValue) {
      return null;
    }

    const parsedCache = JSON.parse(
      cachedValue,
    ) as Partial<SuggestionCachePayload>;

    if (
      parsedCache.version !== DATA_CACHE_VERSION ||
      typeof parsedCache.cachedAt !== "string" ||
      Number.isNaN(new Date(parsedCache.cachedAt).getTime()) ||
      !Array.isArray(parsedCache.suggestions)
    ) {
      return null;
    }

    return {
      version: DATA_CACHE_VERSION,
      cachedAt: parsedCache.cachedAt,
      suggestions: parsedCache.suggestions,
    };
  } catch {
    return null;
  }
}

function writeSuggestionCache(
  suggestions: GateSuggestionView[],
  cachedAt: Date,
) {
  try {
    window.localStorage.setItem(
      SUGGESTION_CACHE_KEY,
      JSON.stringify({
        version: DATA_CACHE_VERSION,
        cachedAt: cachedAt.toISOString(),
        suggestions,
      } satisfies SuggestionCachePayload),
    );
  } catch {}
}

function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);

  if (existingScript) {
    if (existingScript.dataset.turnstileStatus === "loaded") {
      return Promise.resolve();
    }

    if (existingScript.dataset.turnstileStatus === "failed") {
      existingScript.remove();
    } else {
      return new Promise<void>((resolve, reject) => {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", () => reject(), { once: true });
      });
    }
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.turnstileStatus = "loaded";
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        script.dataset.turnstileStatus = "failed";
        reject();
      },
      { once: true },
    );
    document.head.appendChild(script);
  });
}

function TurnstileCheck({
  onTokenChange,
}: {
  onTokenChange: (token: string | null) => void;
}) {
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isTurnstileEnabled || !turnstileRef.current) {
      return;
    }

    let isMounted = true;

    loadTurnstileScript()
      .then(() => {
        if (!isMounted || !window.turnstile || !turnstileRef.current) {
          return;
        }

        if (turnstileWidgetIdRef.current) {
          window.turnstile.remove(turnstileWidgetIdRef.current);
          turnstileWidgetIdRef.current = null;
        }

        turnstileWidgetIdRef.current = window.turnstile.render(
          turnstileRef.current,
          {
            sitekey: TURNSTILE_SITE_KEY!,
            theme: "dark",
            size: "flexible",
            callback: (token) => {
              onTokenChange(token);
              setTurnstileError(false);
            },
            "expired-callback": () => onTokenChange(null),
            "error-callback": () => {
              onTokenChange(null);
              setTurnstileError(true);
            },
          },
        );
      })
      .catch(() => {
        onTokenChange(null);
        setTurnstileError(true);
      });

    return () => {
      isMounted = false;

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [onTokenChange, retryCount]);

  const retryTurnstile = () => {
    onTokenChange(null);
    setTurnstileError(false);
    setRetryCount((currentRetryCount) => currentRetryCount + 1);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-2">
      <div ref={turnstileRef} />
      {turnstileError ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] font-semibold leading-[1.5] text-[var(--danger)]">
            {TURNSTILE_HELP_TEXT}
          </p>
          <button
            type="button"
            onClick={retryTurnstile}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)]"
          >
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

function requestBrowserLocation() {
  return new Promise<UserLocation>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation unavailable"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      },
    );
  });
}

function requestReportLocation(existingLocation: UserLocation | null) {
  if (existingLocation) {
    return Promise.resolve(existingLocation);
  }

  return new Promise<UserLocation | null>((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }

    const timeoutId = window.setTimeout(() => resolve(null), 2500);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        window.clearTimeout(timeoutId);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 2200,
        maximumAge: 60000,
      },
    );
  });
}

function normalizeGate(gate: GateStatusRow): GateView {
  return {
    id: gate.id,
    name: gate.name,
    district: gate.district,
    lat: gate.lat,
    lng: gate.lng,
    roadName: gate.road_name ?? "Road name unavailable",
    nearestStationName: gate.nearest_station_name,
    nearestStationCode: gate.nearest_station_code,
    isActive: gate.is_active,
    inactiveReason: gate.inactive_reason,
    inactiveAt: gate.inactive_at,
    isVerified: gate.is_verified,
    verifiedAt: gate.verified_at,
    verificationNote: gate.verification_note,
    status: gate.status,
    reportCount: gate.report_count,
    recentReportCount: gate.recent_report_count,
    recentNearbyReportCount: gate.recent_nearby_report_count,
    recentOpenCount: gate.recent_open_count,
    recentClosedCount: gate.recent_closed_count,
    recentOpenScore: gate.recent_open_score,
    recentClosedScore: gate.recent_closed_score,
    recentNearbyOpenScore: gate.recent_nearby_open_score,
    recentNearbyClosedScore: gate.recent_nearby_closed_score,
    lastReportedAt: gate.last_reported_at,
    signalSource: gate.signal_source ?? "none",
    isStatusUnstable: gate.is_status_unstable ?? false,
    recentStatusFlipCount: gate.recent_status_flip_count ?? 0,
    statusExpiresAt: gate.status_expires_at ?? null,
  };
}

function normalizeSuggestion(
  suggestion: GateSuggestionRow,
): GateSuggestionView {
  return {
    id: suggestion.id,
    district: suggestion.district,
    lat: suggestion.lat,
    lng: suggestion.lng,
    roadName: suggestion.road_name,
    nearestStationName: suggestion.nearest_station_name ?? null,
    nearestStationCode: suggestion.nearest_station_code ?? null,
    note: suggestion.note,
    status: suggestion.status,
    confirmCount: suggestion.confirm_count,
    rejectCount: suggestion.reject_count,
    nearbyConfirmCount: suggestion.nearby_confirm_count,
    createdAt: suggestion.created_at,
    updatedAt: suggestion.updated_at,
  };
}

function getWeightedStatus(openScore: number, closedScore: number): GateStatus {
  if (openScore > closedScore) {
    return "open";
  }

  if (closedScore > openScore) {
    return "closed";
  }

  return "unknown";
}

function getGateDistance(gate: GateView, userLocation: UserLocation | null) {
  if (!userLocation || !isValidCoordinate(gate)) {
    return null;
  }

  return distanceInKm(userLocation.lat, userLocation.lng, gate.lat, gate.lng);
}

function getSuggestionDistance(
  suggestion: GateSuggestionView,
  userLocation: UserLocation | null,
) {
  if (!userLocation || !isValidCoordinate(suggestion)) {
    return null;
  }

  return distanceInKm(
    userLocation.lat,
    userLocation.lng,
    suggestion.lat,
    suggestion.lng,
  );
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return "";
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km away`;
  }

  return `${Math.round(distanceKm)} km away`;
}

function captureGateUndoEvent(
  eventName: string,
  properties: Record<string, string | number | boolean | null>,
) {
  try {
    if (typeof window === "undefined") {
      return;
    }

    if (!(posthog as { __loaded?: boolean }).__loaded) {
      return;
    }

    posthog.capture(eventName, properties);
  } catch {}
}

function getDistanceBucket(distanceKm: number | null) {
  if (distanceKm === null) {
    return "unknown";
  }

  if (distanceKm <= 0.2) {
    return "under_200m";
  }

  if (distanceKm <= 0.5) {
    return "under_500m";
  }

  if (distanceKm <= 1) {
    return "under_1km";
  }

  return "over_1km";
}

function getGateReportSummary(gate: GateView) {
  if (!gate.isActive) {
    return gate.inactiveReason ?? "Inactive gate record";
  }

  if (gate.recentReportCount === 0) {
    return "No fresh community report yet";
  }

  return `${gate.recentReportCount} recent reports - ${formatLastReported(
    gate.lastReportedAt,
  )}`;
}

function getStationLabel(gate: GateView) {
  if (!gate.nearestStationName || !gate.nearestStationCode) {
    return "";
  }

  return `${gate.nearestStationName} (${gate.nearestStationCode})`;
}

function getTrainActivityHint(gate: GateView) {
  const stationLabel = getStationLabel(gate);

  if (!stationLabel) {
    return "";
  }

  return `Train activity near ${stationLabel} may affect this gate`;
}

function getSuggestedStationLabel(suggestion: GateSuggestionView) {
  if (suggestion.nearestStationName && suggestion.nearestStationCode) {
    return `${suggestion.nearestStationName} (${suggestion.nearestStationCode})`;
  }

  return suggestion.nearestStationName || suggestion.nearestStationCode || "";
}

function getSuggestedStationHint(suggestion: GateSuggestionView) {
  const stationLabel = getSuggestedStationLabel(suggestion);

  if (!stationLabel) {
    return "";
  }

  return `Suggested nearby station: ${stationLabel}`;
}

function statusStyles(status: GateStatus): StatusView {
  if (status === "open") {
    return {
      dot: "bg-[var(--status-open)]",
      badge: "bg-[var(--status-open-bg)] text-[var(--status-open)]",
      label: "LAST REPORT OPEN",
      Icon: Circle,
    };
  }

  if (status === "closed") {
    return {
      dot: "bg-[var(--status-closed)]",
      badge: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
      label: "LAST REPORT CLOSED",
      Icon: Circle,
    };
  }

  return {
    dot: "bg-[var(--status-unknown)]",
    badge: "bg-[var(--status-unknown-bg)] text-[var(--status-unknown)]",
    label: "NO RECENT REPORT",
    Icon: CircleDashed,
  };
}

function gateStatusStyles(gate: GateView): StatusView {
  if (!gate.isActive) {
    return {
      dot: "bg-[var(--danger)]",
      badge: "bg-[rgba(249,115,22,0.12)] text-[var(--danger)]",
      label: "INACTIVE",
      Icon: CircleX,
    };
  }

  return statusStyles(gate.status);
}

function getTrustSummary(gate: GateView): TrustView {
  if (!gate.isActive) {
    return {
      label: "Not a live gate",
      detail: gate.inactiveReason ?? "inactive listing",
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  const {
    recentReportCount,
    recentNearbyReportCount,
    recentOpenCount,
    recentClosedCount,
    recentOpenScore,
    recentClosedScore,
    recentNearbyOpenScore,
    recentNearbyClosedScore,
  } = gate;
  const activeOpenScore =
    recentNearbyReportCount > 0 ? recentNearbyOpenScore : recentOpenScore;
  const activeClosedScore =
    recentNearbyReportCount > 0 ? recentNearbyClosedScore : recentClosedScore;

  if (recentReportCount === 0) {
    return {
      label: "No fresh report",
      detail: "update if nearby",
      className: "text-[var(--text-muted)]",
      Icon: Info,
    };
  }

  if (gate.isStatusUnstable) {
    return {
      label: "Changing fast",
      detail: "verify visually",
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  if (
    recentOpenCount === recentClosedCount &&
    activeOpenScore === activeClosedScore
  ) {
    return {
      label: "Mixed reports",
      detail: `${recentOpenCount} open / ${recentClosedCount} closed`,
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  const minorityCount = Math.min(recentOpenCount, recentClosedCount);

  if (recentNearbyReportCount > 0 && activeOpenScore !== activeClosedScore) {
    return {
      label: "Nearby fresh signal",
      detail: `${recentNearbyReportCount} nearby reports`,
      className: "text-[var(--status-open)]",
      Icon: ShieldCheck,
    };
  }

  if (minorityCount > 0 && activeOpenScore !== activeClosedScore) {
    return {
      label: "Recency weighted",
      detail: "fresh reports lead",
      className: "text-[var(--accent)]",
      Icon: ShieldCheck,
    };
  }

  if (minorityCount > 0) {
    return {
      label: "Split reports",
      detail: `${recentOpenCount} open / ${recentClosedCount} closed`,
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  if (recentReportCount < 3) {
    return {
      label: "Low confidence",
      detail:
        recentNearbyReportCount > 0
          ? `${recentNearbyReportCount} nearby reports`
          : `${recentReportCount} recent reports`,
      className: "text-[var(--accent)]",
      Icon: Info,
    };
  }

  if (recentNearbyReportCount > 0) {
    return {
      label: "Nearby signal",
      detail: `${recentNearbyReportCount} nearby reports`,
      className: "text-[var(--status-open)]",
      Icon: ShieldCheck,
    };
  }

  if (gate.signalSource === "mixed") {
    return {
      label: "Mixed signal",
      detail: "wait for another report",
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  return {
    label: "Remote signal",
    detail: "no nearby reports",
    className: "text-[var(--accent)]",
    Icon: Info,
  };
}

function getVerificationSummary(gate: GateView): VerificationView {
  if (!gate.isActive) {
    return {
      label: "Inactive record",
      detail: "kept for local context",
      className: "text-[var(--danger)]",
      Icon: Info,
    };
  }

  if (gate.isVerified) {
    return {
      label: "Verified coordinate",
      detail: "checked location",
      className: "text-[var(--status-open)]",
      Icon: ShieldCheck,
    };
  }

  return {
    label: "Provisional coordinate",
    detail: "verify before relying",
    className: "text-[var(--danger)]",
    Icon: TriangleAlert,
  };
}

function getHeaderStatus({
  isOnline,
  isShowingCachedData,
  lastUpdatedAt,
  currentTime,
}: {
  isOnline: boolean;
  isShowingCachedData: boolean;
  lastUpdatedAt: Date | null;
  currentTime: number;
}): HeaderStatus {
  if (!isOnline) {
    return {
      label: "OFFLINE",
      detail: "showing saved data",
      className: "text-[var(--status-closed)]",
      dotClassName: "bg-[var(--status-closed)]",
      Icon: WifiOff,
    };
  }

  if (isShowingCachedData && lastUpdatedAt) {
    return {
      label: "SAVED",
      detail: formatUpdatedAt(lastUpdatedAt, currentTime),
      className: "text-[var(--accent)]",
      dotClassName: "bg-[var(--accent)]",
      Icon: Info,
    };
  }

  if (!lastUpdatedAt) {
    return {
      label: "UPDATING",
      detail: "checking gates",
      className: "text-[var(--text-secondary)]",
      dotClassName: "bg-[var(--status-unknown)]",
      Icon: RefreshCw,
    };
  }

  if (currentTime - lastUpdatedAt.getTime() > STALE_AFTER_MS) {
    return {
      label: "STALE",
      detail: formatUpdatedAt(lastUpdatedAt, currentTime),
      className: "text-[var(--danger)]",
      dotClassName: "bg-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  return {
    label: "UPDATED",
    detail: formatUpdatedAt(lastUpdatedAt, currentTime),
    className: "text-[var(--status-open)]",
    dotClassName: "bg-[var(--status-open)]",
    Icon: ShieldCheck,
  };
}

function isRateLimitError(error: ReportInvokeError) {
  return (
    error.context?.status === 429 ||
    error.message.includes("429") ||
    error.message.toLowerCase().includes("rate")
  );
}

function isBotCheckError(error: ReportInvokeError) {
  return (
    error.context?.status === 403 ||
    error.message.includes("403") ||
    error.message.toLowerCase().includes("bot") ||
    error.message.toLowerCase().includes("security")
  );
}

function isDuplicateSuggestionError(error: ReportInvokeError) {
  return error.context?.status === 409 || error.message.includes("409");
}

function isLocationTooFarError(error: ReportInvokeError) {
  return error.context?.status === 422 || error.message.includes("422");
}

function isInactiveGateError(error: ReportInvokeError) {
  return (
    error.context?.status === 409 ||
    error.message.includes("409") ||
    error.message.toLowerCase().includes("inactive")
  );
}

function suggestionStatusLabel(status: SuggestionStatus) {
  return status === "community_confirmed" ? "COMMUNITY CONFIRMED" : "PENDING";
}

function suggestionStatusDetail(suggestion: GateSuggestionView) {
  if (suggestion.status === "community_confirmed") {
    return "ready for review";
  }

  return `${suggestion.confirmCount} confirm / ${suggestion.rejectCount} reject`;
}

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDistrict, setSelectedDistrict] = useState(LAUNCH_DISTRICT);
  const [gates, setGates] = useState<GateView[]>([]);
  const [suggestions, setSuggestions] = useState<GateSuggestionView[]>([]);
  const [selectedGate, setSelectedGate] = useState<GateView | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<GateSuggestionView | null>(null);
  const [suggestionDraft, setSuggestionDraft] =
    useState<SuggestionDraft | null>(null);
  const [suggestionVotes, setSuggestionVotes] = useState<
    Record<string, SuggestionVote>
  >({});
  const [sheetOffset, setSheetOffset] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(true);
  const [isShowingCachedData, setIsShowingCachedData] = useState(false);
  const [showBetaBanner, setShowBetaBanner] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [isVotingSuggestion, setIsVotingSuggestion] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const isSubmittingReportRef = useRef(false);
  const isSubmittingSuggestionRef = useRef(false);
  const isVotingSuggestionRef = useRef(false);
  const emptyDistrictEventsRef = useRef<Set<string>>(new Set());
  const headerStatus = getHeaderStatus({
    isOnline,
    isShowingCachedData,
    lastUpdatedAt,
    currentTime,
  });
  const HeaderStatusIcon = headerStatus.Icon;

  const fetchGates = useCallback(async () => {
    setErrorMessage("");

    const restoreCachedGates = () => {
      const cachedGates = readGateCache();

      if (!cachedGates) {
        return false;
      }

      setGates(cachedGates.gates);
      setLastUpdatedAt(new Date(cachedGates.cachedAt));
      setCurrentTime(Date.now());
      setIsShowingCachedData(true);
      setIsLoading(false);
      return true;
    };

    let result:
      | {
          data: unknown[] | null;
          error: { message: string } | null;
        }
      | undefined;

    try {
      result = await withTimeout(
        supabase
          .from("gate_statuses")
          .select(
            [
              "id",
              "name",
              "district",
              "lat",
              "lng",
              "road_name",
              "nearest_station_name",
              "nearest_station_code",
              "is_active",
              "inactive_reason",
              "inactive_at",
              "is_verified",
              "verified_at",
              "verification_note",
              "status",
              "report_count",
              "recent_report_count",
              "recent_nearby_report_count",
              "recent_open_count",
              "recent_closed_count",
              "recent_open_score",
              "recent_closed_score",
              "recent_nearby_open_score",
              "recent_nearby_closed_score",
              "last_reported_at",
              "signal_source",
              "is_status_unstable",
              "recent_status_flip_count",
              "status_expires_at",
            ].join(", "),
          )
          .order("district", { ascending: true })
          .order("name", { ascending: true }),
      );
    } catch {
      if (restoreCachedGates()) {
        return false;
      }

      setErrorMessage("Something went wrong. Try again.");
      setIsLoading(false);
      return false;
    }

    const { data, error } = result;

    if (error) {
      if (restoreCachedGates()) {
        return false;
      }

      setErrorMessage("Something went wrong. Try again.");
      setIsLoading(false);
      return false;
    }

    const updatedAt = new Date();
    const nextGates = ((data ?? []) as unknown as GateStatusRow[]).map(
      normalizeGate,
    );

    setGates(nextGates);
    writeGateCache(nextGates, updatedAt);
    setLastUpdatedAt(updatedAt);
    setCurrentTime(Date.now());
    setIsShowingCachedData(false);
    setIsLoading(false);
    return true;
  }, []);

  const fetchGateSuggestions = useCallback(async () => {
    const restoreCachedSuggestions = () => {
      const cachedSuggestions = readSuggestionCache();

      if (!cachedSuggestions) {
        return false;
      }

      setSuggestions(cachedSuggestions.suggestions);
      return true;
    };

    let result:
      | {
          data: unknown[] | null;
          error: { message: string } | null;
        }
      | undefined;

    try {
      result = await withTimeout(
        supabase
          .from("gate_suggestions")
          .select(
            [
              "id",
              "district",
              "lat",
              "lng",
              "road_name",
              "nearest_station_name",
              "nearest_station_code",
              "note",
              "status",
              "confirm_count",
              "reject_count",
              "nearby_confirm_count",
              "created_at",
              "updated_at",
            ].join(", "),
          )
          .in("status", ["pending", "community_confirmed"])
          .order("updated_at", { ascending: false }),
      );
    } catch {
      restoreCachedSuggestions();
      return false;
    }

    const { data, error } = result;

    if (error) {
      restoreCachedSuggestions();
      return false;
    }

    const nextSuggestions = ((data ?? []) as unknown as GateSuggestionRow[]).map(
      normalizeSuggestion,
    );

    setSuggestions(nextSuggestions);
    writeSuggestionCache(nextSuggestions, new Date());
    return true;
  }, []);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);

    const cachedGates = readGateCache();
    const cachedSuggestions = readSuggestionCache();

    if (cachedGates) {
      setGates(cachedGates.gates);
      setLastUpdatedAt(new Date(cachedGates.cachedAt));
      setCurrentTime(Date.now());
      setIsShowingCachedData(true);
      setIsLoading(false);
    }

    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions.suggestions);
    }

    fetchGates();
    fetchGateSuggestions();
    const intervalId = window.setInterval(() => {
      fetchGates();
      fetchGateSuggestions();
    }, 30000);
    const clockIntervalId = window.setInterval(
      () => setCurrentTime(Date.now()),
      15000,
    );
    const reportEventsChannel = supabase
      .channel("report-events")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "report_events",
        },
        () => {
          fetchGates();
        },
      )
      .subscribe();
    const suggestionEventsChannel = supabase
      .channel("gate-suggestion-events")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gate_suggestions",
        },
        () => {
          fetchGateSuggestions();
        },
      )
      .subscribe();
    const handleOnline = () => {
      setIsOnline(true);
      fetchGates();
      fetchGateSuggestions();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(clockIntervalId);
      supabase.removeChannel(reportEventsChannel);
      supabase.removeChannel(suggestionEventsChannel);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchGateSuggestions, fetchGates]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToastMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  useEffect(() => {
    setSuggestionVotes(getStoredSuggestionVotes());
  }, []);

  useEffect(() => {
    try {
      const dismissedUntil = Number(
        window.localStorage.getItem(BETA_BANNER_DISMISSED_UNTIL_KEY) ?? "0",
      );

      setShowBetaBanner(!dismissedUntil || Date.now() > dismissedUntil);
    } catch {
      setShowBetaBanner(true);
    }
  }, []);

  const dismissBetaBanner = useCallback(() => {
    setShowBetaBanner(false);

    try {
      window.localStorage.setItem(
        BETA_BANNER_DISMISSED_UNTIL_KEY,
        String(Date.now() + BETA_BANNER_SNOOZE_MS),
      );
    } catch {}
  }, []);

  const districtStats = useMemo(() => {
    const stats = new Map<
      string,
      { activeGateCount: number; suggestionCount: number }
    >();

    for (const district of DISTRICTS) {
      stats.set(district, {
        activeGateCount: 0,
        suggestionCount: 0,
      });
    }

    for (const gate of gates) {
      if (!gate.isActive) {
        continue;
      }

      const districtStat = stats.get(gate.district) ?? {
        activeGateCount: 0,
        suggestionCount: 0,
      };
      districtStat.activeGateCount += 1;
      stats.set(gate.district, districtStat);
    }

    for (const suggestion of suggestions) {
      const districtStat = stats.get(suggestion.district) ?? {
        activeGateCount: 0,
        suggestionCount: 0,
      };
      districtStat.suggestionCount += 1;
      stats.set(suggestion.district, districtStat);
    }

    return stats;
  }, [gates, suggestions]);

  const filteredGates = useMemo(() => {
    const nextGates =
      selectedDistrict === "All"
        ? gates
        : gates.filter((gate) => gate.district === selectedDistrict);

    if (!userLocation) {
      return [...nextGates].sort((firstGate, secondGate) => {
        if (firstGate.isVerified !== secondGate.isVerified) {
          return Number(secondGate.isVerified) - Number(firstGate.isVerified);
        }

        if (firstGate.recentReportCount !== secondGate.recentReportCount) {
          return secondGate.recentReportCount - firstGate.recentReportCount;
        }

        if (firstGate.reportCount !== secondGate.reportCount) {
          return secondGate.reportCount - firstGate.reportCount;
        }

        return firstGate.name.localeCompare(secondGate.name);
      });
    }

    return [...nextGates].sort((firstGate, secondGate) => {
      const firstDistance = getGateDistance(firstGate, userLocation);
      const secondDistance = getGateDistance(secondGate, userLocation);

      if (firstDistance === null && secondDistance === null) {
        return firstGate.name.localeCompare(secondGate.name);
      }

      if (firstDistance === null) {
        return 1;
      }

      if (secondDistance === null) {
        return -1;
      }

      return firstDistance - secondDistance;
    });
  }, [gates, selectedDistrict, userLocation]);

  const filteredSuggestions = useMemo(() => {
    const nextSuggestions =
      selectedDistrict === "All"
        ? suggestions
        : suggestions.filter(
            (suggestion) => suggestion.district === selectedDistrict,
          );

    if (!userLocation) {
      return nextSuggestions;
    }

    return [...nextSuggestions].sort((firstSuggestion, secondSuggestion) => {
      const firstDistance = getSuggestionDistance(
        firstSuggestion,
        userLocation,
      );
      const secondDistance = getSuggestionDistance(
        secondSuggestion,
        userLocation,
      );

      if (firstDistance === null && secondDistance === null) {
        return firstSuggestion.roadName.localeCompare(secondSuggestion.roadName);
      }

      if (firstDistance === null) {
        return 1;
      }

      if (secondDistance === null) {
        return -1;
      }

      return firstDistance - secondDistance;
    });
  }, [selectedDistrict, suggestions, userLocation]);

  const listSuggestions = useMemo(() => {
    const sortedSuggestions = [...filteredSuggestions].sort(
      (firstSuggestion, secondSuggestion) => {
        const firstDistance = getSuggestionDistance(
          firstSuggestion,
          userLocation,
        );
        const secondDistance = getSuggestionDistance(
          secondSuggestion,
          userLocation,
        );
        const firstIsNearby =
          firstDistance !== null &&
          firstDistance <= NEARBY_SUGGESTION_DISTANCE_KM;
        const secondIsNearby =
          secondDistance !== null &&
          secondDistance <= NEARBY_SUGGESTION_DISTANCE_KM;

        if (firstIsNearby !== secondIsNearby) {
          return Number(secondIsNearby) - Number(firstIsNearby);
        }

        if (firstSuggestion.status !== secondSuggestion.status) {
          return firstSuggestion.status === "community_confirmed" ? -1 : 1;
        }

        if (firstDistance !== null && secondDistance !== null) {
          return firstDistance - secondDistance;
        }

        return (
          new Date(secondSuggestion.updatedAt).getTime() -
          new Date(firstSuggestion.updatedAt).getTime()
        );
      },
    );

    return sortedSuggestions.slice(0, LIST_SUGGESTION_LIMIT);
  }, [filteredSuggestions, userLocation]);

  const filteredGateTrustStats = useMemo(() => {
    return filteredGates.reduce(
      (stats, gate) => {
        if (gate.isVerified) {
          stats.verified += 1;
        }

        if (gate.recentReportCount === 0) {
          stats.noRecentSignal += 1;
        }

        if (gate.isStatusUnstable) {
          stats.unstable += 1;
        }

        return stats;
      },
      {
        verified: 0,
        noRecentSignal: 0,
        unstable: 0,
      },
    );
  }, [filteredGates]);

  useEffect(() => {
    if (isLoading || errorMessage || filteredGates.length > 0) {
      return;
    }

    const eventKey = selectedDistrict;

    if (emptyDistrictEventsRef.current.has(eventKey)) {
      return;
    }

    emptyDistrictEventsRef.current.add(eventKey);
    captureGateUndoEvent("district_empty_viewed", {
      district: selectedDistrict,
      is_launch_district: selectedDistrict === LAUNCH_DISTRICT,
      suggestion_count: filteredSuggestions.length,
    });
  }, [errorMessage, filteredGates.length, filteredSuggestions.length, isLoading, selectedDistrict]);

  const closeSheet = useCallback(() => {
    setSheetOffset(0);
    setSelectedGate(null);
    setSelectedSuggestion(null);
    setSuggestionDraft(null);
  }, []);

  const openSheet = useCallback((gate: GateView) => {
    if (!gate.isActive) {
      setToastMessage("This gate is marked inactive and is not accepting reports.");
      return;
    }

    setSheetOffset(0);
    setSelectedGate(gate);
  }, []);

  const openSuggestionReview = useCallback((suggestion: GateSuggestionView) => {
    setSheetOffset(0);
    setSelectedSuggestion(suggestion);
  }, []);

  const openSuggestionDraft = useCallback(
    (draft: SuggestionDraft) => {
      if (selectedDistrict === "All") {
        setToastMessage("Select a district first.");
        return;
      }

      setSheetOffset(0);
      setSuggestionDraft(draft);
    },
    [selectedDistrict],
  );

  const refreshGates = useCallback(async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      await Promise.all([fetchGates(), fetchGateSuggestions()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchGateSuggestions, fetchGates, isRefreshing]);

  const useNearestGates = useCallback(async () => {
    if (isLocating) {
      return null;
    }

    setIsLocating(true);

    try {
      const nextLocation = await requestBrowserLocation();
      setUserLocation(nextLocation);
      setSelectedDistrict("All");
      setToastMessage("Showing nearest gates.");
      return nextLocation;
    } catch {
      setToastMessage("Location unavailable. Try again.");
      return null;
    } finally {
      setIsLocating(false);
    }
  }, [isLocating]);

  const submitReport = useCallback(
    async (status: ReportStatus, turnstileToken: string | null) => {
      if (!selectedGate || isSubmittingReportRef.current) {
        return;
      }

      const reportedAt = new Date().toISOString();
      const gateId = selectedGate.id;
      const previousGate = selectedGate;
      isSubmittingReportRef.current = true;
      setIsSubmittingReport(true);
      const reportLocation = await requestReportLocation(userLocation);

      if (reportLocation && !userLocation) {
        setUserLocation(reportLocation);
      }

      const reportDistanceKm = reportLocation
        ? distanceInKm(
            reportLocation.lat,
            reportLocation.lng,
            selectedGate.lat,
            selectedGate.lng,
          )
        : null;

      if (
        reportDistanceKm !== null &&
        reportDistanceKm > REPORT_MAX_DISTANCE_KM
      ) {
        closeSheet();
        setToastMessage("Too far from this gate. Report only when nearby.");
        isSubmittingReportRef.current = false;
        setIsSubmittingReport(false);
        return;
      }

      setGates((currentGates) =>
        currentGates.map((gate) => {
          if (gate.id !== gateId) {
            return gate;
          }

          const recentOpenCount =
            gate.recentOpenCount + (status === "open" ? 1 : 0);
          const recentClosedCount =
            gate.recentClosedCount + (status === "closed" ? 1 : 0);
          const distanceKm = reportLocation
            ? distanceInKm(
                reportLocation.lat,
                reportLocation.lng,
                gate.lat,
                gate.lng,
              )
            : null;
          const isNearbyReport =
            distanceKm !== null && distanceKm <= REPORT_NEARBY_DISTANCE_KM;
          const recentNearbyReportCount =
            gate.recentNearbyReportCount + (isNearbyReport ? 1 : 0);
          const recentOpenScore =
            gate.recentOpenScore + (status === "open" ? 4 : 0);
          const recentClosedScore =
            gate.recentClosedScore + (status === "closed" ? 4 : 0);
          const recentNearbyOpenScore =
            gate.recentNearbyOpenScore +
            (isNearbyReport && status === "open" ? 4 : 0);
          const recentNearbyClosedScore =
            gate.recentNearbyClosedScore +
            (isNearbyReport && status === "closed" ? 4 : 0);
          const nextStatus =
            recentNearbyReportCount > 0
              ? getWeightedStatus(
                  recentNearbyOpenScore,
                  recentNearbyClosedScore,
                )
              : getWeightedStatus(recentOpenScore, recentClosedScore);
          const recentStatusFlipCount =
            gate.status !== nextStatus && nextStatus !== "unknown"
              ? gate.recentStatusFlipCount + 1
              : gate.recentStatusFlipCount;
          const isStatusUnstable =
            recentOpenCount > 0 &&
            recentClosedCount > 0 &&
            (recentStatusFlipCount >= 2 ||
              Math.abs(recentOpenScore - recentClosedScore) <= 2);

          return {
            ...gate,
            status: nextStatus,
            signalSource:
              recentNearbyReportCount > 0
                ? "nearby"
                : recentOpenScore === recentClosedScore
                  ? "mixed"
                  : "remote",
            isStatusUnstable,
            recentStatusFlipCount,
            reportCount: gate.reportCount + 1,
            recentReportCount: gate.recentReportCount + 1,
            recentNearbyReportCount,
            recentOpenCount,
            recentClosedCount,
            recentOpenScore,
            recentClosedScore,
            recentNearbyOpenScore,
            recentNearbyClosedScore,
            lastReportedAt: reportedAt,
            statusExpiresAt: new Date(
              new Date(reportedAt).getTime() + 7 * 60 * 1000,
            ).toISOString(),
          };
        }),
      );
      closeSheet();
      setToastMessage("Thanks for reporting!");

      let error: ReportInvokeError | null = null;
      let acceptedReportAt: string | null = null;

      try {
        const result = await withTimeout(
          supabase.functions.invoke("report-gate", {
            body: {
              gate_id: gateId,
              status,
              device_id: getDeviceId(),
              user_lat: reportLocation?.lat ?? null,
              user_lng: reportLocation?.lng ?? null,
              turnstile_token: turnstileToken,
            },
          }),
        );

        error = result.error
          ? {
              message: result.error.message,
              context: result.error.context as { status?: number } | undefined,
            }
          : null;
        acceptedReportAt =
          ((result.data as ReportFunctionData | null)?.report?.reported_at) ??
          null;
      } catch (reportError) {
        error =
          reportError instanceof Error
            ? { message: reportError.message }
            : { message: "Report failed" };
      }

      if (error) {
        const refreshed = await fetchGates();

        if (!refreshed) {
          setGates((currentGates) =>
            currentGates.map((gate) =>
              gate.id === gateId ? previousGate : gate,
            ),
          );
        }

        setToastMessage(
          isRateLimitError(error)
            ? "Please wait before reporting again."
            : isBotCheckError(error)
              ? "Security check failed. Retry the check and submit again."
            : isLocationTooFarError(error)
              ? "Too far from this gate. Use nearby reports only."
            : isInactiveGateError(error)
              ? "This gate is marked inactive and is not accepting reports."
              : "Report not recorded. Try again.",
        );
      } else if (acceptedReportAt) {
        setGates((currentGates) =>
          {
            const nextGates = currentGates.map((gate) =>
              gate.id === gateId
                ? {
                    ...gate,
                    lastReportedAt: acceptedReportAt,
                  }
                : gate,
            );

            writeGateCache(nextGates, new Date());
            return nextGates;
          },
        );
        captureGateUndoEvent("gate_report_submitted", {
          gate_id: gateId,
          district: selectedGate.district,
          status,
          distance_bucket: getDistanceBucket(reportDistanceKm),
          is_nearby:
            reportDistanceKm !== null &&
            reportDistanceKm <= REPORT_NEARBY_DISTANCE_KM,
        });
      }

      isSubmittingReportRef.current = false;
      setIsSubmittingReport(false);
    },
    [closeSheet, fetchGates, selectedGate, userLocation],
  );

  const submitGateSuggestion = useCallback(
    async ({
      roadName,
      nearestStationName,
      nearestStationCode,
      note,
      turnstileToken,
    }: {
      roadName: string;
      nearestStationName: string;
      nearestStationCode: string;
      note: string;
      turnstileToken: string | null;
    }) => {
      if (
        !suggestionDraft ||
        selectedDistrict === "All" ||
        isSubmittingSuggestionRef.current
      ) {
        return;
      }

      isSubmittingSuggestionRef.current = true;
      setIsSubmittingSuggestion(true);

      let error: ReportInvokeError | null = null;
      let acceptedSuggestion: GateSuggestionRow | null = null;

      try {
        const result = await withTimeout(
          supabase.functions.invoke("suggest-gate", {
            body: {
              district: selectedDistrict,
              lat: suggestionDraft.lat,
              lng: suggestionDraft.lng,
              road_name: roadName,
              nearest_station_name: nearestStationName || null,
              nearest_station_code: nearestStationCode || null,
              note,
              device_id: getDeviceId(),
              turnstile_token: turnstileToken,
            },
          }),
        );

        error = result.error
          ? {
              message: result.error.message,
              context: result.error.context as { status?: number } | undefined,
            }
          : null;
        acceptedSuggestion =
          ((result.data as GateSuggestionFunctionData | null)?.suggestion) ??
          null;
      } catch (suggestionError) {
        error =
          suggestionError instanceof Error
            ? { message: suggestionError.message }
            : { message: "Suggestion failed" };
      }

      if (error || !acceptedSuggestion) {
        setToastMessage(
          isRateLimitError(error ?? { message: "" })
            ? "Please wait before suggesting again."
            : isBotCheckError(error ?? { message: "" })
              ? "Security check failed. Retry the check and submit again."
            : isDuplicateSuggestionError(error ?? { message: "" })
              ? "A gate or suggestion is already near here."
              : "Suggestion not recorded. Try again.",
        );
        isSubmittingSuggestionRef.current = false;
        setIsSubmittingSuggestion(false);
        return;
      }

      const nextSuggestion = normalizeSuggestion(acceptedSuggestion);
      setSuggestions((currentSuggestions) => {
        const nextSuggestions = [
          nextSuggestion,
          ...currentSuggestions.filter(
            (suggestion) => suggestion.id !== nextSuggestion.id,
          ),
        ];

        writeSuggestionCache(nextSuggestions, new Date());
        return nextSuggestions;
      });
      closeSheet();
      setToastMessage("Gate suggestion added for review.");
      captureGateUndoEvent("gate_suggestion_submitted", {
        district: selectedDistrict,
        has_station_hint: Boolean(nearestStationName || nearestStationCode),
        has_note: Boolean(note.trim()),
      });
      isSubmittingSuggestionRef.current = false;
      setIsSubmittingSuggestion(false);
    },
    [closeSheet, selectedDistrict, suggestionDraft],
  );

  const voteGateSuggestion = useCallback(
    async (vote: SuggestionVote, turnstileToken: string | null) => {
      if (!selectedSuggestion || isVotingSuggestionRef.current) {
        return;
      }

      isVotingSuggestionRef.current = true;
      setIsVotingSuggestion(true);

      let error: ReportInvokeError | null = null;
      let acceptedSuggestion: GateSuggestionRow | null = null;

      try {
        const result = await withTimeout(
          supabase.functions.invoke("vote-gate-suggestion", {
            body: {
              suggestion_id: selectedSuggestion.id,
              vote,
              device_id: getDeviceId(),
              user_lat: userLocation?.lat ?? null,
              user_lng: userLocation?.lng ?? null,
              turnstile_token: turnstileToken,
            },
          }),
        );

        error = result.error
          ? {
              message: result.error.message,
              context: result.error.context as { status?: number } | undefined,
            }
          : null;
        acceptedSuggestion =
          ((result.data as GateSuggestionFunctionData | null)?.suggestion) ??
          null;
      } catch (voteError) {
        error =
          voteError instanceof Error
            ? { message: voteError.message }
            : { message: "Vote failed" };
      }

      if (error || !acceptedSuggestion) {
        setToastMessage(
          isRateLimitError(error ?? { message: "" })
            ? "Please wait before voting again."
            : isBotCheckError(error ?? { message: "" })
              ? "Security check failed. Retry the check and vote again."
            : "Vote not recorded. Try again.",
        );
        isVotingSuggestionRef.current = false;
        setIsVotingSuggestion(false);
        return;
      }

      const nextSuggestion = normalizeSuggestion(acceptedSuggestion);
      setSuggestions((currentSuggestions) => {
        const nextSuggestions = currentSuggestions.map((suggestion) =>
          suggestion.id === nextSuggestion.id ? nextSuggestion : suggestion,
        );

        writeSuggestionCache(nextSuggestions, new Date());
        return nextSuggestions;
      });
      setSuggestionVotes(storeSuggestionVote(nextSuggestion.id, vote));
      setSelectedSuggestion(nextSuggestion);
      setToastMessage(
        vote === "confirm"
          ? "You confirmed this gate."
          : "You marked this as wrong.",
      );
      captureGateUndoEvent("gate_suggestion_vote_submitted", {
        suggestion_id: nextSuggestion.id,
        district: nextSuggestion.district,
        vote,
        distance_bucket: getDistanceBucket(
          getSuggestionDistance(nextSuggestion, userLocation),
        ),
        resulting_status: nextSuggestion.status,
      });
      isVotingSuggestionRef.current = false;
      setIsVotingSuggestion(false);
    },
    [selectedSuggestion, userLocation],
  );

  const handleSheetPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      dragStartY.current = event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleSheetPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (dragStartY.current === null) {
        return;
      }

      setSheetOffset(Math.max(0, event.clientY - dragStartY.current));
    },
    [],
  );

  const handleSheetPointerUp = useCallback(() => {
    if (sheetOffset > 80) {
      closeSheet();
    } else {
      setSheetOffset(0);
    }

    dragStartY.current = null;
  }, [closeSheet, sheetOffset]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] pb-[calc(24px+env(safe-area-inset-bottom))] text-[var(--text-primary)]">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-base)]">
        <div className="mx-auto flex min-h-[72px] w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
              <TrainFront
                aria-hidden="true"
                className="h-6 w-6 text-[var(--accent)]"
                strokeWidth={2.4}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[20px] font-bold leading-[1.2] text-[var(--text-primary)]">
                GateUndo
                <span className="ml-2 inline-flex align-middle rounded-full border border-[var(--accent)]/50 bg-[var(--accent-dim)] px-2 py-0.5 text-[11px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
                  Kannur Beta
                </span>
              </div>
              <p className="truncate text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                Community railway gate reports · Kerala expansion later
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div
              className="flex min-h-11 items-center gap-2"
              aria-label={`${headerStatus.label}: ${headerStatus.detail}`}
            >
              <HeaderStatusIcon
                aria-hidden="true"
                className={`h-4 w-4 ${headerStatus.className}`}
                strokeWidth={2.4}
              />
              <span
                className={`h-2 w-2 rounded-full ${headerStatus.dotClassName}`}
              />
              <span
                className={`text-[13px] font-bold leading-[1.2] ${headerStatus.className}`}
              >
                {headerStatus.label}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full pt-4 sm:pt-6">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 flex w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={[
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-[15px] font-semibold leading-[1.2] transition-colors",
                viewMode === "list"
                  ? "bg-[var(--accent)] text-[#0A0A0A]"
                  : "text-[var(--text-secondary)]",
              ].join(" ")}
              aria-pressed={viewMode === "list"}
            >
              <List aria-hidden="true" className="h-4 w-4" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={[
                "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg text-[15px] font-semibold leading-[1.2] transition-colors",
                viewMode === "map"
                  ? "bg-[var(--accent)] text-[#0A0A0A]"
                  : "text-[var(--text-secondary)]",
              ].join(" ")}
              aria-pressed={viewMode === "map"}
            >
              <MapIcon aria-hidden="true" className="h-4 w-4" />
              Map
            </button>
          </div>

          <section
            aria-label="District filters"
            className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex gap-2 sm:flex-wrap">
              {DISTRICTS.map((district) => {
                const isActive = selectedDistrict === district;
                const stats = districtStats.get(district);
                const activeGateCount = stats?.activeGateCount ?? 0;
                const suggestionCount = stats?.suggestionCount ?? 0;
                const isLaunchDistrict = district === LAUNCH_DISTRICT;
                const isAllDistrict = district === "All";
                const hasCoverage =
                  isAllDistrict ||
                  isLaunchDistrict ||
                  activeGateCount > 0 ||
                  suggestionCount > 0;

                return (
                  <button
                    key={district}
                    type="button"
                    onClick={() => setSelectedDistrict(district)}
                    className={[
                      "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold leading-[1.5] transition-colors",
                      isActive
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
                      hasCoverage ? "" : "opacity-60",
                    ].join(" ")}
                    aria-pressed={isActive}
                  >
                    <span>{district}</span>
                    {isLaunchDistrict ? (
                      <span className="rounded-full bg-[var(--accent-dim)] px-1.5 py-0.5 text-[11px] font-bold uppercase leading-[1.2] text-[var(--accent)]">
                        Beta
                      </span>
                    ) : !hasCoverage ? (
                      <span className="rounded-full bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] font-bold uppercase leading-[1.2] text-[var(--text-muted)]">
                        Soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {isShowingCachedData && lastUpdatedAt ? (
            <div className="mb-4 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
              <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Showing saved data - {formatUpdatedAt(lastUpdatedAt, currentTime)}
              </span>
            </div>
          ) : null}

          {showBetaBanner ? (
            <div className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-[1.5] text-[var(--text-primary)]">
                    GateUndo is starting from Kannur
                  </p>
                  <p className="mt-1 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                    Other districts stay visible for expansion, but live
                    coverage is limited until local gates are verified. Always
                    obey physical railway signals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissBetaBanner}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
                  aria-label="Dismiss beta notice for 7 days"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={dismissBetaBanner}
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-3 text-[13px] font-semibold leading-[1.5] text-[#0A0A0A]"
              >
                Got it
              </button>
            </div>
          ) : null}
        </div>

        {viewMode === "list" ? (
          <section
            aria-label="Railway gates"
            className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8"
          >
            <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--text-muted)]">
                {selectedDistrict === LAUNCH_DISTRICT
                  ? `${LAUNCH_SCOPE_LABEL} railway gates`
                  : selectedDistrict === "All"
                    ? "Kannur beta and community expansion"
                    : `${selectedDistrict} expansion`}
              </p>
              <h1 className="mt-1 text-[20px] font-bold leading-[1.2]">
                Gate undo?
              </h1>
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 sm:justify-end">
              <button
                type="button"
                onClick={useNearestGates}
                disabled={isLocating}
                className={[
                  "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold leading-[1.5] transition-colors disabled:opacity-60",
                  userLocation
                    ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]",
                ].join(" ")}
              >
                {isLocating ? (
                  <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                )}
                {isLocating ? "Finding" : "Near me"}
              </button>
              <span className="text-[13px] font-normal leading-[1.5] text-[var(--text-muted)]">
                {filteredGates.length} gates
              </span>
            </div>
            </div>

            {!isLoading && !errorMessage && filteredGates.length > 0 ? (
              <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
                {filteredGateTrustStats.unstable > 0 ? (
                  <span className="flex items-center gap-2 text-[var(--danger)]">
                    <TriangleAlert
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0"
                    />
                    {filteredGateTrustStats.unstable} gates changing fast - verify visually
                  </span>
                ) : filteredGateTrustStats.noRecentSignal ===
                  filteredGates.length ? (
                  <span className="flex items-center gap-2 text-[var(--accent)]">
                    <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
                    No fresh community reports here - update if nearby
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShieldCheck
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 text-[var(--status-open)]"
                    />
                    {filteredGateTrustStats.verified} verified gates{" \u00b7 "}
                    {filteredGateTrustStats.noRecentSignal} without recent signal
                  </span>
                )}
              </div>
            ) : null}

            {isLoading ? <GateSkeletonList /> : null}

            {!isLoading && errorMessage ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-[14px] leading-[1.5] text-[var(--text-secondary)]">
                {errorMessage}
              </div>
            ) : null}

            {!isLoading && !errorMessage && filteredGates.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-center">
                <Signal
                  aria-hidden="true"
                  className="mb-4 h-16 w-16 text-[var(--text-muted)]"
                  strokeWidth={1.8}
                />
                <h2 className="text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]">
                  {selectedDistrict === "All"
                    ? "No gates found"
                    : selectedDistrict === LAUNCH_DISTRICT
                      ? "No Kannur gates loaded"
                      : `No verified gates in ${selectedDistrict} yet`}
                </h2>
                <p className="mt-2 text-[14px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                  {selectedDistrict === "All"
                    ? `GateUndo is starting from ${LAUNCH_DISTRICT}. Try ${LAUNCH_DISTRICT} first during beta.`
                    : selectedDistrict === LAUNCH_DISTRICT
                      ? "Something went wrong loading the beta gate list. Try refresh."
                      : `GateUndo is starting from ${LAUNCH_DISTRICT}. Suggest a missing gate to help expand.`}
                </p>
              </div>
            ) : null}

            {!isLoading && !errorMessage && listSuggestions.length > 0 ? (
              <section
                aria-label="Pending gate suggestions"
                className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
                      Help verify new gates
                    </p>
                    <h2 className="mt-1 text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]">
                      {userLocation
                        ? "Pending near you"
                        : selectedDistrict === "All"
                          ? "Pending suggestions"
                          : `Pending in ${selectedDistrict}`}
                    </h2>
                    <p className="mt-1 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                      Pending suggestions are not live gates yet.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[13px] font-semibold leading-[1.2] text-[var(--text-secondary)]">
                    {filteredSuggestions.length} pending
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {listSuggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      distanceKm={getSuggestionDistance(suggestion, userLocation)}
                      onOpen={openSuggestionReview}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {!isLoading && !errorMessage && filteredGates.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGates.map((gate) => (
                  <GateCard
                    key={gate.id}
                    gate={gate}
                    distanceKm={getGateDistance(gate, userLocation)}
                    onOpen={openSheet}
                  />
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <section aria-label="Railway gates map" className="w-full">
            <MapView
              gates={filteredGates}
              suggestions={filteredSuggestions}
              isLoading={isLoading}
              errorMessage={errorMessage}
              selectedDistrict={selectedDistrict}
              onOpenGate={openSheet}
              onSuggestGate={openSuggestionDraft}
              onOpenSuggestion={openSuggestionReview}
              userLocation={userLocation}
              isLocating={isLocating}
              onUseLocation={useNearestGates}
            />
          </section>
        )}
      </main>

      <footer className="mx-auto mt-6 flex min-h-11 w-full max-w-6xl flex-wrap items-center justify-center gap-2 px-4 pb-2 text-center text-[13px] font-semibold leading-[1.5] text-[var(--text-muted)] sm:px-6 lg:px-8">
        <span>© 2026 GateUndo</span>
        <span aria-hidden="true">·</span>
        <a
          href="/privacy"
          className="min-h-11 rounded-xl px-2 py-3 text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--accent)] hover:underline"
        >
          Privacy
        </a>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          Made with
          <Heart
            aria-label="love"
            className="h-3.5 w-3.5 fill-[var(--status-closed)] text-[var(--status-closed)]"
            strokeWidth={2.4}
          />
          in Kerala
        </span>
      </footer>

      {viewMode === "list" ? (
        <button
          type="button"
          onClick={refreshGates}
          className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent)] text-[#0A0A0A] shadow-2xl active:scale-95 disabled:opacity-70"
          disabled={isRefreshing}
          aria-label="Refresh gate status"
          aria-busy={isRefreshing}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`}
            strokeWidth={2.6}
          />
        </button>
      ) : null}

      {selectedGate ? (
        <ReportSheet
          gate={selectedGate}
          offset={sheetOffset}
          onBackdropClick={closeSheet}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onReport={submitReport}
          isSubmitting={isSubmittingReport}
        />
      ) : null}

      {suggestionDraft && selectedDistrict !== "All" ? (
        <SuggestGateSheet
          district={selectedDistrict}
          draft={suggestionDraft}
          offset={sheetOffset}
          onBackdropClick={closeSheet}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onSubmit={submitGateSuggestion}
          isSubmitting={isSubmittingSuggestion}
        />
      ) : null}

      {selectedSuggestion ? (
        <SuggestionReviewSheet
          suggestion={selectedSuggestion}
          distanceKm={getSuggestionDistance(selectedSuggestion, userLocation)}
          currentVote={suggestionVotes[selectedSuggestion.id] ?? null}
          offset={sheetOffset}
          onBackdropClick={closeSheet}
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onVote={voteGateSuggestion}
          isSubmitting={isVotingSuggestion}
        />
      ) : null}

      {toastMessage ? (
        <div className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-[390px] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-center text-[14px] font-semibold leading-[1.5] text-[var(--text-primary)] shadow-2xl">
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}

function GateCard({
  gate,
  distanceKm,
  onOpen,
}: {
  gate: GateView;
  distanceKm: number | null;
  onOpen: (gate: GateView) => void;
}) {
  const status = gateStatusStyles(gate);
  const StatusIcon = status.Icon;
  const trust = getTrustSummary(gate);
  const TrustIcon = trust.Icon;
  const verification = getVerificationSummary(gate);
  const VerificationIcon = verification.Icon;
  const distanceLabel = formatDistance(distanceKm);
  const trainActivityHint = getTrainActivityHint(gate);

  return (
    <button
      type="button"
      onClick={() => onOpen(gate)}
      className={[
        "group min-h-[72px] w-full rounded-xl border px-4 py-[14px] text-left transition duration-150 ease-out active:scale-[0.985]",
        gate.isActive
          ? "border-[var(--border)] bg-[var(--bg-surface)] active:bg-[var(--bg-elevated)]"
          : "border-[var(--danger)]/40 bg-[rgba(249,115,22,0.08)]",
      ].join(" ")}
      aria-label={
        gate.isActive
          ? `Report status for ${gate.name}`
          : `${gate.name} is marked inactive`
      }
    >
      <div className="flex gap-3">
        <span
          className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]">
                {gate.name}
              </h2>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                <Route aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{gate.roadName}</span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {gate.district}
                  {distanceLabel ? ` · ${distanceLabel}` : ""}
                </span>
              </div>
              {trainActivityHint ? (
                <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
                  <TrainFront
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="truncate">{trainActivityHint}</span>
                </div>
              ) : null}
            </div>
            <span
              className={`inline-flex max-w-[132px] shrink-0 items-center gap-1 rounded-full px-[10px] py-1 text-[12px] font-bold leading-[1.2] sm:max-w-none sm:text-[13px] ${status.badge}`}
              aria-label={`Status ${status.label}`}
            >
              <StatusIcon
                aria-hidden="true"
                className="h-3 w-3 fill-current"
                strokeWidth={2.4}
              />
              <span className="truncate">{status.label}</span>
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-[var(--text-muted)]">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>{getGateReportSummary(gate)}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--text-muted)]">
            <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>
              Last community report{" \u00b7 "}always obey physical signals
            </span>
          </p>
          <p
            className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] ${trust.className}`}
          >
            <TrustIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {trust.label}{" \u00b7 "}{trust.detail}
            </span>
          </p>
          <p
            className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] ${verification.className}`}
          >
            <VerificationIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {verification.label}{" \u00b7 "}{verification.detail}
            </span>
          </p>
        </div>
      </div>
    </button>
  );
}

function SuggestionCard({
  suggestion,
  distanceKm,
  onOpen,
}: {
  suggestion: GateSuggestionView;
  distanceKm: number | null;
  onOpen: (suggestion: GateSuggestionView) => void;
}) {
  const distanceLabel = formatDistance(distanceKm);
  const stationHint = getSuggestedStationHint(suggestion);

  return (
    <button
      type="button"
      onClick={() => onOpen(suggestion)}
      className="group min-h-[88px] w-full rounded-xl border border-[var(--accent)]/60 bg-[var(--accent-dim)] px-4 py-[14px] text-left transition duration-150 ease-out active:scale-[0.985] active:bg-[rgba(250,204,21,0.22)]"
      aria-label={`Review suggested gate ${suggestion.roadName}`}
    >
      <div className="flex items-start gap-3">
        <MapPin
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
                {suggestionStatusLabel(suggestion.status)}
              </p>
              <h3 className="mt-1 truncate text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]">
                {suggestion.roadName}
              </h3>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-[13px] font-semibold leading-[1.2] text-[var(--text-secondary)]">
              Review
            </span>
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
            <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {suggestion.district}
              {distanceLabel ? ` Â· ${distanceLabel}` : ""}
            </span>
          </p>
          {stationHint ? (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
              <TrainFront aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{stationHint}</span>
            </p>
          ) : null}
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
            <CircleCheck
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[var(--status-open)]"
            />
            <span className="truncate">
              {suggestion.confirmCount} confirm / {suggestion.rejectCount} wrong
              {" \u00b7 "}{suggestion.nearbyConfirmCount} nearby
            </span>
          </p>
        </div>
      </div>
    </button>
  );
}

function ReportSheet({
  gate,
  offset,
  onBackdropClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onReport,
  isSubmitting,
}: {
  gate: GateView;
  offset: number;
  onBackdropClick: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onReport: (status: ReportStatus, turnstileToken: string | null) => void;
  isSubmitting: boolean;
}) {
  const trust = getTrustSummary(gate);
  const TrustIcon = trust.Icon;
  const verification = getVerificationSummary(gate);
  const VerificationIcon = verification.Icon;
  const trainActivityHint = getTrainActivityHint(gate);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const canReport =
    !isSubmitting && (!isTurnstileEnabled || Boolean(turnstileToken));

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Close report sheet"
        disabled={isSubmitting}
        onClick={onBackdropClick}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 sm:px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-sheet-title"
          aria-busy={isSubmitting}
          className="sheet-open w-full max-w-[460px] touch-none rounded-t-[20px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          style={{
            transform: `translateY(${offset}px)`,
            transition: offset === 0 ? "transform 0.2s ease-out" : "none",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border-strong)]" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--text-muted)]">
                Report status
              </p>
              <h2
                id="report-sheet-title"
                className="mt-1 truncate text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]"
              >
                {gate.name}
              </h2>
              <p className="mt-1 truncate text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                {gate.roadName}{" \u00b7 "}{gate.district}
              </p>
              <p
                className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] ${trust.className}`}
              >
                <TrustIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {trust.label}{" \u00b7 "}{trust.detail}
                </span>
              </p>
              <p
                className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] ${verification.className}`}
              >
                <VerificationIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {verification.label}{" \u00b7 "}{verification.detail}
                </span>
              </p>
              {trainActivityHint ? (
                <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
                  <TrainFront
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span>{trainActivityHint}</span>
                </p>
              ) : null}
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--text-muted)]">
                <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Last community report only. Always obey physical signals.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onBackdropClick}
              disabled={isSubmitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
              aria-label="Close report sheet"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {isTurnstileEnabled ? (
            <div className="mb-3">
              <TurnstileCheck onTokenChange={setTurnstileToken} />
            </div>
          ) : null}

          {trainActivityHint ? (
            <a
              href={TRAIN_CHECK_URL}
              target="_blank"
              rel="noreferrer"
              className="mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-[14px] font-semibold leading-[1.2] text-[var(--accent)] active:scale-[0.985]"
            >
              <TrainFront aria-hidden="true" className="h-4 w-4" />
              Check trains near {gate.nearestStationCode}
            </a>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onReport("open", turnstileToken)}
              disabled={!canReport}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[var(--status-open)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A] active:scale-[0.985] disabled:opacity-60"
            >
              {isSubmitting ? (
                <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" strokeWidth={2.6} />
              ) : (
                <CircleCheck aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              )}
              {isSubmitting ? "Recording" : "Report Open"}
            </button>
            <button
              type="button"
              onClick={() => onReport("closed", turnstileToken)}
              disabled={!canReport}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[var(--status-closed)] px-4 text-[15px] font-semibold leading-[1.2] text-white active:scale-[0.985] disabled:opacity-60"
            >
              {isSubmitting ? (
                <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" strokeWidth={2.6} />
              ) : (
                <CircleX aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              )}
              {isSubmitting ? "Recording" : "Report Closed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuggestGateSheet({
  district,
  draft,
  offset,
  onBackdropClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSubmit,
  isSubmitting,
}: {
  district: string;
  draft: SuggestionDraft;
  offset: number;
  onBackdropClick: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onSubmit: (payload: {
    roadName: string;
    nearestStationName: string;
    nearestStationCode: string;
    note: string;
    turnstileToken: string | null;
  }) => void;
  isSubmitting: boolean;
}) {
  const [roadName, setRoadName] = useState("");
  const [nearestStationName, setNearestStationName] = useState("");
  const [nearestStationCode, setNearestStationCode] = useState("");
  const [note, setNote] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const canSubmit =
    !isSubmitting &&
    roadName.trim().length >= 3 &&
    (!isTurnstileEnabled || Boolean(turnstileToken));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    onSubmit({
      roadName: roadName.trim(),
      nearestStationName: nearestStationName.trim(),
      nearestStationCode: nearestStationCode.trim().toUpperCase(),
      note: note.trim(),
      turnstileToken,
    });
  };

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Close gate suggestion sheet"
        disabled={isSubmitting}
        onClick={onBackdropClick}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 sm:px-4">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggest-sheet-title"
          aria-busy={isSubmitting}
          className="sheet-open w-full max-w-[460px] touch-none rounded-t-[20px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          style={{
            transform: `translateY(${offset}px)`,
            transition: offset === 0 ? "transform 0.2s ease-out" : "none",
          }}
          onSubmit={handleSubmit}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border-strong)]" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--text-muted)]">
                Suggest gate
              </p>
              <h2
                id="suggest-sheet-title"
                className="mt-1 text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]"
              >
                {district}
              </h2>
              <p className="mt-1 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackdropClick}
              disabled={isSubmitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
              aria-label="Close gate suggestion sheet"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <label className="block text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
            Road or place name
            <input
              value={roadName}
              onChange={(event) => setRoadName(event.target.value)}
              disabled={isSubmitting}
              maxLength={100}
              placeholder="Eg. Railway Station Road"
              className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[15px] font-normal leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </label>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <label className="block text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
              Nearby station
              <input
                value={nearestStationName}
                onChange={(event) => setNearestStationName(event.target.value)}
                disabled={isSubmitting}
                maxLength={80}
                placeholder="Optional"
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[15px] font-normal leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </label>

            <label className="block text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
              Code
              <input
                value={nearestStationCode}
                onChange={(event) =>
                  setNearestStationCode(
                    event.target.value
                      .replace(/[^a-z0-9]/gi, "")
                      .toUpperCase(),
                  )
                }
                disabled={isSubmitting}
                maxLength={12}
                placeholder="Eg. TLY"
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[15px] font-normal uppercase leading-[1.5] text-[var(--text-primary)] placeholder:normal-case placeholder:text-[var(--text-muted)]"
              />
            </label>
          </div>

          <label className="mt-3 block text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
            Note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={isSubmitting}
              maxLength={180}
              rows={3}
              placeholder="Optional nearby landmark"
              className="mt-2 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-3 text-[15px] font-normal leading-[1.5] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </label>

          {isTurnstileEnabled ? (
            <div className="mt-3">
              <TurnstileCheck onTokenChange={setTurnstileToken} />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A] active:scale-[0.985] disabled:opacity-60"
          >
            {isSubmitting ? (
              <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" strokeWidth={2.6} />
            ) : (
              <MapPin aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
            )}
            {isSubmitting ? "Adding..." : "Add pending suggestion"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SuggestionReviewSheet({
  suggestion,
  distanceKm,
  currentVote,
  offset,
  onBackdropClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onVote,
  isSubmitting,
}: {
  suggestion: GateSuggestionView;
  distanceKm: number | null;
  currentVote: SuggestionVote | null;
  offset: number;
  onBackdropClick: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onVote: (vote: SuggestionVote, turnstileToken: string | null) => void;
  isSubmitting: boolean;
}) {
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [pendingVote, setPendingVote] = useState<SuggestionVote | null>(null);
  const stationHint = getSuggestedStationHint(suggestion);
  const canVote = !isSubmitting && (!isTurnstileEnabled || Boolean(turnstileToken));
  const displayedVote = pendingVote ?? currentVote;
  const voteStatusText =
    displayedVote === "confirm"
      ? "You confirmed this gate."
      : displayedVote === "reject"
        ? "You marked this as wrong."
        : "Your vote is not recorded yet.";

  useEffect(() => {
    if (!isSubmitting) {
      setPendingVote(null);
    }
  }, [isSubmitting]);

  const handleVote = (vote: SuggestionVote) => {
    if (!canVote) {
      return;
    }

    setPendingVote(vote);
    onVote(vote, turnstileToken);
  };

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Close suggestion review sheet"
        disabled={isSubmitting}
        onClick={onBackdropClick}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 sm:px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-sheet-title"
          aria-busy={isSubmitting}
          className="sheet-open w-full max-w-[460px] touch-none rounded-t-[20px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          style={{
            transform: `translateY(${offset}px)`,
            transition: offset === 0 ? "transform 0.2s ease-out" : "none",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border-strong)]" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
                {suggestionStatusLabel(suggestion.status)}
              </p>
              <h2
                id="review-sheet-title"
                className="mt-1 truncate text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]"
              >
                {suggestion.roadName}
              </h2>
              <p className="mt-1 truncate text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                {suggestion.district}
                {formatDistance(distanceKm)
                  ? ` · ${formatDistance(distanceKm)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackdropClick}
              disabled={isSubmitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
              aria-label="Close suggestion review sheet"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <p className="text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
              {suggestionStatusDetail(suggestion)}
            </p>
            <p className="mt-1 text-[13px] font-normal leading-[1.5] text-[var(--text-muted)]">
              {suggestion.nearbyConfirmCount} nearby confirmations
            </p>
            {stationHint ? (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
                <TrainFront
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span>{stationHint}</span>
              </p>
            ) : null}
            <p
              className={[
                "mt-2 flex items-center gap-1.5 text-[13px] font-semibold leading-[1.5]",
                displayedVote === "confirm"
                  ? "text-[var(--status-open)]"
                  : displayedVote === "reject"
                    ? "text-[var(--status-closed)]"
                    : "text-[var(--text-muted)]",
              ].join(" ")}
            >
              {displayedVote === "confirm" ? (
                <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
              ) : displayedVote === "reject" ? (
                <CircleX aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Info aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              <span>{voteStatusText}</span>
            </p>
            {suggestion.note ? (
              <p className="mt-2 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                {suggestion.note}
              </p>
            ) : null}
          </div>

          {isTurnstileEnabled ? (
            <div className="mt-3">
              <TurnstileCheck onTokenChange={setTurnstileToken} />
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleVote("confirm")}
              disabled={!canVote || displayedVote === "confirm"}
              className={[
                "flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold leading-[1.2] active:scale-[0.985] disabled:opacity-60",
                displayedVote === "confirm"
                  ? "border border-[var(--status-open)] bg-[var(--status-open-bg)] text-[var(--status-open)]"
                  : "bg-[var(--status-open)] text-[#0A0A0A]",
              ].join(" ")}
            >
              {pendingVote === "confirm" ? (
                <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" strokeWidth={2.6} />
              ) : (
                <CircleCheck aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              )}
              {pendingVote === "confirm"
                ? "Confirming"
                : displayedVote === "confirm"
                  ? "Confirmed"
                  : displayedVote === "reject"
                    ? "Change to Confirm"
                    : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => handleVote("reject")}
              disabled={!canVote || displayedVote === "reject"}
              className={[
                "flex min-h-[56px] items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold leading-[1.2] active:scale-[0.985] disabled:opacity-60",
                displayedVote === "reject"
                  ? "border border-[var(--status-closed)] bg-[var(--status-closed-bg)] text-[var(--status-closed)]"
                  : "bg-[var(--status-closed)] text-white",
              ].join(" ")}
            >
              {pendingVote === "reject" ? (
                <RefreshCw aria-hidden="true" className="h-5 w-5 animate-spin" strokeWidth={2.6} />
              ) : (
                <CircleX aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              )}
              {pendingVote === "reject"
                ? "Sending"
                : displayedVote === "reject"
                  ? "Marked Wrong"
                  : displayedVote === "confirm"
                    ? "Change to Wrong"
                    : "Wrong"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapView({
  gates,
  suggestions,
  isLoading,
  errorMessage,
  selectedDistrict,
  onOpenGate,
  onSuggestGate,
  onOpenSuggestion,
  userLocation,
  isLocating,
  onUseLocation,
}: {
  gates: GateView[];
  suggestions: GateSuggestionView[];
  isLoading: boolean;
  errorMessage: string;
  selectedDistrict: string;
  onOpenGate: (gate: GateView) => void;
  onSuggestGate: (draft: SuggestionDraft) => void;
  onOpenSuggestion: (suggestion: GateSuggestionView) => void;
  userLocation: UserLocation | null;
  isLocating: boolean;
  onUseLocation: () => Promise<UserLocation | null>;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const draftMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const latestOnOpenGateRef = useRef(onOpenGate);
  const latestOnOpenSuggestionRef = useRef(onOpenSuggestion);
  const didInitialFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isPlacingSuggestion, setIsPlacingSuggestion] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    latestOnOpenGateRef.current = onOpenGate;
  }, [onOpenGate]);

  useEffect(() => {
    latestOnOpenSuggestionRef.current = onOpenSuggestion;
  }, [onOpenSuggestion]);

  useEffect(() => {
    let isMounted = true;

    async function loadMap() {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      if (!token || token === "your_mapbox_token") {
        setMapError("Map token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN.");
        return;
      }

      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      const mapboxModule = (await import("mapbox-gl")).default;
      mapboxModule.accessToken = token;
      mapboxRef.current = mapboxModule;

      if (!isMounted || !mapContainerRef.current) {
        return;
      }

      const map = new mapboxModule.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: KERALA_CENTER,
        zoom: 7,
        attributionControl: false,
      });

      map.addControl(
        new mapboxModule.AttributionControl({
          compact: true,
        }),
        "bottom-left",
      );

      map.addControl(
        new mapboxModule.NavigationControl({
          showCompass: false,
          visualizePitch: false,
        }),
        "bottom-right",
      );

      map.on("load", () => {
        applyRailUndoMapTheme(map);
        window.requestAnimationFrame(() => map.resize());

        if (isMounted) {
          setIsMapReady(true);
        }
      });

      map.on("style.load", () => {
        applyRailUndoMapTheme(map);
      });

      mapRef.current = map;
    }

    loadMap().catch(() => {
      if (isMounted) {
        setMapError("Something went wrong. Try again.");
      }
    });

    return () => {
      isMounted = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      draftMarkerRef.current?.remove();
      draftMarkerRef.current = null;
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      didInitialFitRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (!isMapReady || !map || !mapboxModule) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    const gateMarkers = gates
      .filter((gate) => isValidCoordinate(gate))
      .map((gate) => {
        const trust = getTrustSummary(gate);
        const verification = getVerificationSummary(gate);
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = [
          "gate-map-marker",
          gate.isActive
            ? `gate-map-marker-${gate.status}`
            : "gate-map-marker-inactive",
          gate.isVerified ? "gate-map-marker-verified" : "gate-map-marker-unverified",
        ].join(" ");
        markerElement.innerHTML =
          '<span class="gate-map-marker-pin"><span class="gate-map-marker-icon" aria-hidden="true"></span></span>';
        markerElement.setAttribute(
          "aria-label",
          gate.isActive ? `${gate.name} ${gate.status}` : `${gate.name} inactive`,
        );

        const popupElement = document.createElement("button");
        popupElement.type = "button";
        popupElement.className = "gate-map-popup";
        const distanceLabel = formatDistance(getGateDistance(gate, userLocation));
        const trainActivityHint = getTrainActivityHint(gate);
        popupElement.innerHTML = `
          <strong>${escapeHtml(gate.name)}</strong>
          <span>${gateStatusStyles(gate).label} · ${escapeHtml(gate.isActive ? formatLastReported(gate.lastReportedAt) : gate.inactiveReason ?? "not accepting reports")}</span>
          ${distanceLabel ? `<span>${escapeHtml(distanceLabel)}</span>` : ""}
          <span>${escapeHtml(trust.label)} · ${escapeHtml(trust.detail)}</span>
          <span>${escapeHtml(verification.label)} · ${escapeHtml(verification.detail)}</span>
          <span>Last community report · always obey physical signals</span>
          ${trainActivityHint ? `<span>${escapeHtml(trainActivityHint)}</span>` : ""}
          <em>${gate.isActive ? "Report gate status" : "Inactive gate record"}</em>
        `;
        popupElement.addEventListener("click", () => {
          latestOnOpenGateRef.current(gate);
        });

        const popup = new mapboxModule.Popup({
          closeButton: false,
          closeOnClick: true,
          offset: 18,
        }).setDOMContent(popupElement);

        return new mapboxModule.Marker({
          element: markerElement,
          anchor: "bottom",
        })
          .setLngLat([gate.lng, gate.lat])
          .setPopup(popup)
          .addTo(map);
      });
    const suggestionMarkers = suggestions
      .filter((suggestion) => isValidCoordinate(suggestion))
      .map((suggestion) => {
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = [
          "gate-suggestion-marker",
          suggestion.status === "community_confirmed"
            ? "gate-suggestion-marker-confirmed"
            : "gate-suggestion-marker-pending",
        ].join(" ");
        markerElement.innerHTML =
          '<span class="gate-suggestion-marker-pin"><span class="gate-suggestion-marker-icon" aria-hidden="true"></span></span>';
        markerElement.setAttribute(
          "aria-label",
          `${suggestion.roadName} ${suggestionStatusLabel(suggestion.status)}`,
        );

        const popupElement = document.createElement("button");
        popupElement.type = "button";
        popupElement.className = "gate-map-popup gate-suggestion-popup";
        const distanceLabel = formatDistance(
          getSuggestionDistance(suggestion, userLocation),
        );
        const stationHint = getSuggestedStationHint(suggestion);
        popupElement.innerHTML = `
          <strong>${escapeHtml(suggestion.roadName)}</strong>
          <span>${escapeHtml(suggestionStatusLabel(suggestion.status))}</span>
          ${distanceLabel ? `<span>${escapeHtml(distanceLabel)}</span>` : ""}
          <span>${escapeHtml(suggestionStatusDetail(suggestion))}</span>
          ${stationHint ? `<span>${escapeHtml(stationHint)}</span>` : ""}
          <em>Review suggestion</em>
        `;
        popupElement.addEventListener("click", () => {
          latestOnOpenSuggestionRef.current(suggestion);
        });

        const popup = new mapboxModule.Popup({
          closeButton: false,
          closeOnClick: true,
          offset: 18,
        }).setDOMContent(popupElement);

        return new mapboxModule.Marker({
          element: markerElement,
          anchor: "bottom",
        })
          .setLngLat([suggestion.lng, suggestion.lat])
          .setPopup(popup)
          .addTo(map);
      });

    markersRef.current = [...gateMarkers, ...suggestionMarkers];

    if (!didInitialFitRef.current && !isLoading) {
      didInitialFitRef.current = true;
      fitMapToVisiblePoints(map, mapboxModule, gates, suggestions);
    } else if (gates.some(isValidCoordinate) || suggestions.some(isValidCoordinate)) {
      fitMapToVisiblePoints(map, mapboxModule, gates, suggestions);
    }
  }, [gates, isLoading, isMapReady, suggestions, userLocation]);

  useEffect(() => {
    const map = mapRef.current;

    if (!isMapReady || !map) {
      return;
    }

    const firstFrameId = window.requestAnimationFrame(() => {
      map.resize();
      window.requestAnimationFrame(() => map.resize());
    });

    return () => window.cancelAnimationFrame(firstFrameId);
  }, [isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (!isMapReady || !map || !mapboxModule || !userLocation) {
      return;
    }

    focusMapAroundUser(map, mapboxModule, gates, userLocation, userMarkerRef);
  }, [gates, isMapReady, userLocation]);

  const useCurrentLocation = useCallback(async () => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (!isMapReady || !map || !mapboxModule || isLocating) {
      return;
    }

    const nextLocation = await onUseLocation();

    if (nextLocation) {
      focusMapAroundUser(map, mapboxModule, gates, nextLocation, userMarkerRef);
    }
  }, [gates, isLocating, isMapReady, onUseLocation]);

  const startPlacingSuggestion = useCallback(() => {
    const map = mapRef.current;
    const mapboxModule = mapboxRef.current;

    if (
      !isMapReady ||
      !map ||
      !mapboxModule ||
      selectedDistrict === "All" ||
      isPlacingSuggestion
    ) {
      return;
    }

    const center = map.getCenter();
    const markerElement = document.createElement("div");
    markerElement.className = "gate-suggestion-draft-marker";
    markerElement.innerHTML =
      '<span class="gate-suggestion-marker-pin"><span class="gate-suggestion-marker-icon" aria-hidden="true"></span></span>';

    draftMarkerRef.current?.remove();
    draftMarkerRef.current = new mapboxModule.Marker({
      element: markerElement,
      draggable: true,
      anchor: "bottom",
    })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    setIsPlacingSuggestion(true);
  }, [isMapReady, isPlacingSuggestion, selectedDistrict]);

  const cancelPlacingSuggestion = useCallback(() => {
    draftMarkerRef.current?.remove();
    draftMarkerRef.current = null;
    setIsPlacingSuggestion(false);
  }, []);

  const useDraftSuggestionLocation = useCallback(() => {
    const lngLat = draftMarkerRef.current?.getLngLat();

    if (!lngLat) {
      return;
    }

    onSuggestGate({
      lat: lngLat.lat,
      lng: lngLat.lng,
    });
    cancelPlacingSuggestion();
  }, [cancelPlacingSuggestion, onSuggestGate]);

  return (
    <div className="relative h-[calc(100dvh-248px)] min-h-[360px] w-full overflow-hidden border-y border-[var(--border)] bg-[var(--bg-surface)] sm:h-[calc(100dvh-220px)]">
      <div ref={mapContainerRef} className="h-full w-full" />

      {isLoading ? (
        <div className="absolute inset-x-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
          Loading gates...
        </div>
      ) : null}

      {errorMessage || mapError ? (
        <div className="absolute inset-x-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
          {errorMessage || mapError}
        </div>
      ) : null}

      {!isLoading && !errorMessage && !mapError && gates.length === 0 ? (
        <div className="absolute inset-x-4 top-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
          {suggestions.length > 0
            ? `${suggestions.length} pending suggestions`
            : selectedDistrict === LAUNCH_DISTRICT
              ? "No Kannur gates loaded. Try refresh."
              : `No verified gates in ${selectedDistrict} yet`}
        </div>
      ) : null}

      <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-2">
        {isPlacingSuggestion ? (
          <div className="rounded-xl border border-[var(--accent)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] font-semibold leading-[1.5] text-[var(--accent)] shadow-2xl">
            Drag the yellow marker
          </div>
        ) : (
          <div />
        )}
        <button
          type="button"
          onClick={startPlacingSuggestion}
          disabled={
            !isMapReady ||
            isLoading ||
            selectedDistrict === "All" ||
            isPlacingSuggestion
          }
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)] shadow-2xl disabled:opacity-60"
        >
          {!isMapReady || isLoading ? (
            <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin text-[var(--accent)]" />
          ) : (
            <MapPin aria-hidden="true" className="h-4 w-4 text-[var(--accent)]" />
          )}
          {!isMapReady || isLoading
            ? "Map loading"
            : selectedDistrict === "All"
              ? "Select district"
              : isPlacingSuggestion
                ? "Placing"
                : "Suggest gate"}
        </button>
      </div>

      {isPlacingSuggestion ? (
        <div className="absolute inset-x-4 bottom-20 z-10 grid grid-cols-2 gap-2 sm:right-auto sm:w-[320px]">
          <button
            type="button"
            onClick={cancelPlacingSuggestion}
            disabled={!isPlacingSuggestion}
            className="flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)] shadow-2xl"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={useDraftSuggestionLocation}
            disabled={!isPlacingSuggestion}
            className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-3 text-[13px] font-semibold leading-[1.5] text-[#0A0A0A] shadow-2xl"
          >
            Use location
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={!isMapReady || isLocating}
        aria-busy={isLocating}
        className="absolute bottom-4 left-4 z-10 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)] shadow-2xl disabled:opacity-60"
      >
        {isLocating ? (
          <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin text-[#2563EB]" />
        ) : (
          <MapPin aria-hidden="true" className="h-4 w-4 text-[#2563EB]" />
        )}
        {isLocating ? "Locating" : "Use my location"}
      </button>
    </div>
  );
}

function focusMapAroundUser(
  map: mapboxgl.Map,
  mapboxModule: typeof mapboxgl,
  gates: GateView[],
  userLocation: UserLocation,
  userMarkerRef: React.MutableRefObject<mapboxgl.Marker | null>,
) {
  const userElement = document.createElement("div");
  userElement.className = "gate-user-marker";
  userMarkerRef.current?.remove();
  userMarkerRef.current = new mapboxModule.Marker({ element: userElement })
    .setLngLat([userLocation.lng, userLocation.lat])
    .addTo(map);

  const nearbyGates = gates.filter((gate) => {
    return (
      isValidCoordinate(gate) &&
      distanceInKm(userLocation.lat, userLocation.lng, gate.lat, gate.lng) <= 20
    );
  });

  if (nearbyGates.length > 0) {
    fitMapToCoordinates(map, mapboxModule, [
      [userLocation.lng, userLocation.lat],
      ...nearbyGates.map((gate) => [gate.lng, gate.lat] as [number, number]),
    ]);
    return;
  }

  map.easeTo({
    center: [userLocation.lng, userLocation.lat],
    zoom: 11,
    duration: 600,
  });
}

function fitMapToVisiblePoints(
  map: mapboxgl.Map,
  mapboxModule: typeof mapboxgl,
  gates: GateView[],
  suggestions: GateSuggestionView[],
) {
  const gateCoordinates = gates
    .filter(isValidCoordinate)
    .map((gate) => [gate.lng, gate.lat] as [number, number]);
  const suggestionCoordinates = suggestions
    .filter(isValidCoordinate)
    .map((suggestion) => [suggestion.lng, suggestion.lat] as [number, number]);

  fitMapToCoordinates(map, mapboxModule, [
    ...gateCoordinates,
    ...suggestionCoordinates,
  ]);
}

function fitMapToCoordinates(
  map: mapboxgl.Map,
  mapboxModule: typeof mapboxgl,
  coordinates: [number, number][],
) {
  if (coordinates.length === 0) {
    map.easeTo({ center: KERALA_CENTER, zoom: 7, duration: 600 });
    return;
  }

  const bounds = coordinates.reduce(
    (nextBounds, coordinate) => nextBounds.extend(coordinate),
    new mapboxModule.LngLatBounds(coordinates[0], coordinates[0]),
  );

  map.fitBounds(bounds, {
    padding: 48,
    maxZoom: 13,
    duration: 600,
  });
}

function isValidCoordinate(point: { lat: number; lng: number }) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function applyRailUndoMapTheme(map: mapboxgl.Map) {
  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    const layerId = layer.id;
    const layerType = layer.type;

    try {
      if (layerType === "background") {
        map.setPaintProperty(layerId, "background-color", "#0A0A0A");
      }

      if (layerType === "fill" && /water/i.test(layerId)) {
        map.setPaintProperty(layerId, "fill-color", "#083D36");
      }

      if (layerType === "fill" && /(landuse|park|national-park)/i.test(layerId)) {
        map.setPaintProperty(layerId, "fill-color", "#0E2A24");
        map.setPaintProperty(layerId, "fill-opacity", 0.65);
      }

      if (layerType === "line" && /road/i.test(layerId)) {
        map.setPaintProperty(layerId, "line-color", "#2A3A35");
        map.setPaintProperty(layerId, "line-opacity", 0.85);
      }

      if (layerType === "symbol" && /label/i.test(layerId)) {
        map.setPaintProperty(layerId, "text-color", "#D4D4D4");
        map.setPaintProperty(layerId, "text-halo-color", "#0A0A0A");
        map.setPaintProperty(layerId, "text-halo-width", 1);
      }

      if (layerType === "symbol" && /poi/i.test(layerId)) {
        map.setLayoutProperty(layerId, "visibility", "none");
      }
    } catch {
      // Some Mapbox styles do not expose every paint property on every layer.
    }
  });
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

function GateSkeletonList() {
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading gates"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="skeleton-shimmer min-h-[116px] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-[14px]"
        >
          <div className="h-4 w-2/3 rounded bg-[var(--bg-input)]" />
          <div className="mt-3 h-3 w-1/2 rounded bg-[var(--bg-input)]" />
          <div className="mt-3 h-3 w-1/3 rounded bg-[var(--bg-input)]" />
        </div>
      ))}
    </div>
  );
}
