"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { differenceInMinutes } from "date-fns";
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Info,
  List,
  Map,
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
];
type ReportStatus = "open" | "closed";

type GateStatus = ReportStatus | "unknown";

type GateStatusRow = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  road_name: string | null;
  status: GateStatus;
  report_count: number;
  recent_report_count: number;
  recent_open_count: number;
  recent_closed_count: number;
  last_reported_at: string | null;
};

type GateView = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  roadName: string;
  status: GateStatus;
  reportCount: number;
  recentReportCount: number;
  recentOpenCount: number;
  recentClosedCount: number;
  lastReportedAt: string | null;
};

type UserLocation = {
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
  };
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
const DEVICE_ID_KEY = "railundo_device_id";
const TURNSTILE_SCRIPT_ID = "railundo-turnstile-script";
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
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

function loadTurnstileScript() {
  if (window.turnstile) {
    return Promise.resolve();
  }

  const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID);

  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(), { once: true });
    document.head.appendChild(script);
  });
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

function normalizeGate(gate: GateStatusRow): GateView {
  return {
    id: gate.id,
    name: gate.name,
    district: gate.district,
    lat: gate.lat,
    lng: gate.lng,
    roadName: gate.road_name ?? "Road name unavailable",
    status: gate.status,
    reportCount: gate.report_count,
    recentReportCount: gate.recent_report_count,
    recentOpenCount: gate.recent_open_count,
    recentClosedCount: gate.recent_closed_count,
    lastReportedAt: gate.last_reported_at,
  };
}

function getConsensusStatus(openCount: number, closedCount: number): GateStatus {
  if (openCount > closedCount) {
    return "open";
  }

  if (closedCount > openCount) {
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

function statusStyles(status: GateStatus): StatusView {
  if (status === "open") {
    return {
      dot: "bg-[var(--status-open)]",
      badge: "bg-[var(--status-open-bg)] text-[var(--status-open)]",
      label: "OPEN",
      Icon: Circle,
    };
  }

  if (status === "closed") {
    return {
      dot: "bg-[var(--status-closed)]",
      badge: "bg-[var(--status-closed-bg)] text-[var(--status-closed)]",
      label: "CLOSED",
      Icon: Circle,
    };
  }

  return {
    dot: "bg-[var(--status-unknown)]",
    badge: "bg-[var(--status-unknown-bg)] text-[var(--status-unknown)]",
    label: "UNKNOWN",
    Icon: CircleDashed,
  };
}

function getTrustSummary(gate: GateView): TrustView {
  const { recentReportCount, recentOpenCount, recentClosedCount } = gate;

  if (recentReportCount === 0) {
    return {
      label: "No recent reports",
      detail: "be careful",
      className: "text-[var(--text-muted)]",
      Icon: Info,
    };
  }

  if (recentOpenCount === recentClosedCount) {
    return {
      label: "Mixed reports",
      detail: `${recentOpenCount} open / ${recentClosedCount} closed`,
      className: "text-[var(--danger)]",
      Icon: TriangleAlert,
    };
  }

  const minorityCount = Math.min(recentOpenCount, recentClosedCount);

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
      detail: `${recentReportCount} recent reports`,
      className: "text-[var(--accent)]",
      Icon: Info,
    };
  }

  return {
    label: "Good signal",
    detail: `${recentReportCount} recent reports`,
    className: "text-[var(--status-open)]",
    Icon: ShieldCheck,
  };
}

function getHeaderStatus({
  isOnline,
  lastUpdatedAt,
  currentTime,
}: {
  isOnline: boolean;
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

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDistrict, setSelectedDistrict] = useState("All");
  const [gates, setGates] = useState<GateView[]>([]);
  const [selectedGate, setSelectedGate] = useState<GateView | null>(null);
  const [sheetOffset, setSheetOffset] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isOnline, setIsOnline] = useState(true);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const dragStartY = useRef<number | null>(null);
  const isSubmittingReportRef = useRef(false);
  const headerStatus = getHeaderStatus({
    isOnline,
    lastUpdatedAt,
    currentTime,
  });
  const HeaderStatusIcon = headerStatus.Icon;

  const fetchGates = useCallback(async () => {
    setErrorMessage("");

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
              "status",
              "report_count",
              "recent_report_count",
              "recent_open_count",
              "recent_closed_count",
              "last_reported_at",
            ].join(", "),
          )
          .order("district", { ascending: true })
          .order("name", { ascending: true }),
      );
    } catch {
      setErrorMessage("Something went wrong. Try again.");
      setIsLoading(false);
      return false;
    }

    const { data, error } = result;

    if (error) {
      setErrorMessage("Something went wrong. Try again.");
      setIsLoading(false);
      return false;
    }

    setGates(((data ?? []) as unknown as GateStatusRow[]).map(normalizeGate));
    setLastUpdatedAt(new Date());
    setCurrentTime(Date.now());
    setIsLoading(false);
    return true;
  }, []);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);
    fetchGates();
    const intervalId = window.setInterval(fetchGates, 30000);
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
    const handleOnline = () => {
      setIsOnline(true);
      fetchGates();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.clearInterval(intervalId);
      window.clearInterval(clockIntervalId);
      supabase.removeChannel(reportEventsChannel);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchGates]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToastMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const filteredGates = useMemo(() => {
    const nextGates =
      selectedDistrict === "All"
        ? gates
        : gates.filter((gate) => gate.district === selectedDistrict);

    if (!userLocation) {
      return nextGates;
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

  const closeSheet = useCallback(() => {
    setSheetOffset(0);
    setSelectedGate(null);
  }, []);

  const openSheet = useCallback((gate: GateView) => {
    setSheetOffset(0);
    setSelectedGate(gate);
  }, []);

  const refreshGates = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchGates();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchGates]);

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

      setGates((currentGates) =>
        currentGates.map((gate) => {
          if (gate.id !== gateId) {
            return gate;
          }

          const recentOpenCount =
            gate.recentOpenCount + (status === "open" ? 1 : 0);
          const recentClosedCount =
            gate.recentClosedCount + (status === "closed" ? 1 : 0);

          return {
            ...gate,
            status: getConsensusStatus(recentOpenCount, recentClosedCount),
            reportCount: gate.reportCount + 1,
            recentReportCount: gate.recentReportCount + 1,
            recentOpenCount,
            recentClosedCount,
            lastReportedAt: reportedAt,
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
            : "Report not recorded. Try again.",
        );
      } else if (acceptedReportAt) {
        setGates((currentGates) =>
          currentGates.map((gate) =>
            gate.id === gateId
              ? {
                  ...gate,
                  lastReportedAt: acceptedReportAt,
                }
              : gate,
          ),
        );
      }

      isSubmittingReportRef.current = false;
      setIsSubmittingReport(false);
    },
    [closeSheet, fetchGates, selectedGate],
  );

  const handleSheetPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      dragStartY.current = event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handleSheetPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
                RailUndo
              </div>
              <p className="truncate text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                Kerala Railway Gate Status - Crowdsourced Updates
              </p>
            </div>
          </div>
          <div
            className="flex min-h-11 shrink-0 items-center gap-2"
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
              <Map aria-hidden="true" className="h-4 w-4" />
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

                return (
                  <button
                    key={district}
                    type="button"
                    onClick={() => setSelectedDistrict(district)}
                    className={[
                      "min-h-11 shrink-0 rounded-full border px-4 text-[13px] font-semibold leading-[1.5] transition-colors",
                      isActive
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
                    ].join(" ")}
                    aria-pressed={isActive}
                  >
                    {district}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {viewMode === "list" ? (
          <section
            aria-label="Railway gates"
            className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8"
          >
            <div className="mb-3 flex flex-col gap-1 sm:mb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--text-muted)]">
                Kerala railway gates
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
                <MapPin aria-hidden="true" className="h-4 w-4" />
                {isLocating ? "Locating" : "Near me"}
              </button>
              <span className="text-[13px] font-normal leading-[1.5] text-[var(--text-muted)]">
                {filteredGates.length} gates
              </span>
            </div>
            </div>

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
                    : `No gates in ${selectedDistrict}`}
                </h2>
                <p className="mt-2 text-[14px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                  {selectedDistrict === "All"
                    ? "No reports yet. Be the first!"
                    : "Try a different district"}
                </p>
              </div>
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
              isLoading={isLoading}
              errorMessage={errorMessage}
              onOpenGate={openSheet}
              userLocation={userLocation}
              isLocating={isLocating}
              onUseLocation={useNearestGates}
            />
          </section>
        )}
      </main>

      {viewMode === "list" ? (
        <button
          type="button"
          onClick={refreshGates}
          className="fixed bottom-[calc(20px+env(safe-area-inset-bottom))] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--accent)] text-[#0A0A0A] shadow-2xl active:scale-95 disabled:opacity-70"
          disabled={isRefreshing}
          aria-label="Refresh gate status"
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
  const status = statusStyles(gate.status);
  const StatusIcon = status.Icon;
  const trust = getTrustSummary(gate);
  const TrustIcon = trust.Icon;
  const distanceLabel = formatDistance(distanceKm);

  return (
    <button
      type="button"
      onClick={() => onOpen(gate)}
      className="group min-h-[72px] w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-[14px] text-left transition duration-150 ease-out active:scale-[0.985] active:bg-[var(--bg-elevated)]"
      aria-label={`Report status for ${gate.name}`}
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
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-[10px] py-1 text-[13px] font-bold leading-[1.2] ${status.badge}`}
              aria-label={`Status ${status.label}`}
            >
              <StatusIcon
                aria-hidden="true"
                className="h-3 w-3 fill-current"
                strokeWidth={2.4}
              />
              {status.label}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-normal leading-[1.5] text-[var(--text-muted)]">
            <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
            <span>
              {gate.recentReportCount} recent reports{" \u00b7 "}
              {formatLastReported(gate.lastReportedAt)}
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
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onReport: (status: ReportStatus, turnstileToken: string | null) => void;
  isSubmitting: boolean;
}) {
  const trust = getTrustSummary(gate);
  const TrustIcon = trust.Icon;
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);

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

        turnstileWidgetIdRef.current = window.turnstile.render(
          turnstileRef.current,
          {
            sitekey: TURNSTILE_SITE_KEY!,
            theme: "dark",
            size: "flexible",
            callback: (token) => {
              setTurnstileToken(token);
              setTurnstileError(false);
            },
            "expired-callback": () => setTurnstileToken(null),
            "error-callback": () => {
              setTurnstileToken(null);
              setTurnstileError(true);
            },
          },
        );
      })
      .catch(() => setTurnstileError(true));

    return () => {
      isMounted = false;

      if (turnstileWidgetIdRef.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
    };
  }, []);

  const canReport =
    !isSubmitting && (!isTurnstileEnabled || Boolean(turnstileToken));

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        aria-label="Close report sheet"
        onClick={onBackdropClick}
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-3 sm:px-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-sheet-title"
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
            </div>
            <button
              type="button"
              onClick={onBackdropClick}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
              aria-label="Close report sheet"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>

          {isTurnstileEnabled ? (
            <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-2">
              <div ref={turnstileRef} />
              {turnstileError ? (
                <p className="mt-2 text-[13px] font-semibold leading-[1.5] text-[var(--danger)]">
                  Security check failed. Try again.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onReport("open", turnstileToken)}
              disabled={!canReport}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[var(--status-open)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A] active:scale-[0.985] disabled:opacity-60"
            >
              <CircleCheck aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              OPEN
            </button>
            <button
              type="button"
              onClick={() => onReport("closed", turnstileToken)}
              disabled={!canReport}
              className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-[var(--status-closed)] px-4 text-[15px] font-semibold leading-[1.2] text-white active:scale-[0.985] disabled:opacity-60"
            >
              <CircleX aria-hidden="true" className="h-5 w-5" strokeWidth={2.6} />
              CLOSED
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MapView({
  gates,
  isLoading,
  errorMessage,
  onOpenGate,
  userLocation,
  isLocating,
  onUseLocation,
}: {
  gates: GateView[];
  isLoading: boolean;
  errorMessage: string;
  onOpenGate: (gate: GateView) => void;
  userLocation: UserLocation | null;
  isLocating: boolean;
  onUseLocation: () => Promise<UserLocation | null>;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxRef = useRef<typeof mapboxgl | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const latestOnOpenGateRef = useRef(onOpenGate);
  const didInitialFitRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    latestOnOpenGateRef.current = onOpenGate;
  }, [onOpenGate]);

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
    markersRef.current = gates
      .filter((gate) => isValidCoordinate(gate))
      .map((gate) => {
        const trust = getTrustSummary(gate);
        const markerElement = document.createElement("button");
        markerElement.type = "button";
        markerElement.className = `gate-map-marker gate-map-marker-${gate.status}`;
        markerElement.innerHTML =
          '<span class="gate-map-marker-icon" aria-hidden="true"></span>';
        markerElement.setAttribute("aria-label", `${gate.name} ${gate.status}`);

        const popupElement = document.createElement("button");
        popupElement.type = "button";
        popupElement.className = "gate-map-popup";
        const distanceLabel = formatDistance(getGateDistance(gate, userLocation));
        popupElement.innerHTML = `
          <strong>${escapeHtml(gate.name)}</strong>
          <span>${statusStyles(gate.status).label} · ${escapeHtml(formatLastReported(gate.lastReportedAt))}</span>
          ${distanceLabel ? `<span>${escapeHtml(distanceLabel)}</span>` : ""}
          <span>${escapeHtml(trust.label)} · ${escapeHtml(trust.detail)}</span>
          <em>Report Status</em>
        `;
        popupElement.addEventListener("click", () => {
          latestOnOpenGateRef.current(gate);
        });

        const popup = new mapboxModule.Popup({
          closeButton: false,
          closeOnClick: true,
          offset: 18,
        }).setDOMContent(popupElement);

        return new mapboxModule.Marker({ element: markerElement })
          .setLngLat([gate.lng, gate.lat])
          .setPopup(popup)
          .addTo(map);
      });

    if (!didInitialFitRef.current && !isLoading) {
      didInitialFitRef.current = true;
      fitMapToGates(map, mapboxModule, gates);
    } else if (gates.some(isValidCoordinate)) {
      fitMapToGates(map, mapboxModule, gates);
    }
  }, [gates, isLoading, isMapReady, userLocation]);

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
          No gates found for this district
        </div>
      ) : null}

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={!isMapReady || isLocating}
        className="absolute bottom-4 left-4 z-10 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)] shadow-2xl disabled:opacity-60"
      >
        <MapPin aria-hidden="true" className="h-4 w-4 text-[#2563EB]" />
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

function fitMapToGates(
  map: mapboxgl.Map,
  mapboxModule: typeof mapboxgl,
  gates: GateView[],
) {
  const coordinates = gates
    .filter(isValidCoordinate)
    .map((gate) => [gate.lng, gate.lat] as [number, number]);

  if (coordinates.length === 0) {
    map.easeTo({ center: KERALA_CENTER, zoom: 7, duration: 600 });
    return;
  }

  fitMapToCoordinates(map, mapboxModule, coordinates);
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

function isValidCoordinate(gate: GateView) {
  return Number.isFinite(gate.lat) && Number.isFinite(gate.lng);
}

function statusColor(status: GateStatus) {
  if (status === "open") {
    return "#22C55E";
  }

  if (status === "closed") {
    return "#EF4444";
  }

  return "#6B7280";
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
