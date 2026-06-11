import {
  approveSuggestionAction,
  loginAdminAction,
  logoutAdminAction,
  rejectSuggestionAction,
} from "./actions";
import { isAdminAuthenticated, isAdminConfigured } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AdminSearchParams = {
  error?: string;
  success?: string;
};

type AdminSuggestion = {
  id: string;
  district: string;
  lat: number;
  lng: number;
  road_name: string;
  nearest_station_name: string | null;
  nearest_station_code: string | null;
  note: string | null;
  status: "pending" | "community_confirmed";
  confirm_count: number;
  reject_count: number;
  nearby_confirm_count: number;
  created_at: string;
  updated_at: string;
};

function getMessage(searchParams: AdminSearchParams) {
  if (searchParams.error === "config") {
    return "Admin is not configured. Add ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY.";
  }

  if (searchParams.error === "login") {
    return "Wrong password. Try again.";
  }

  if (searchParams.error === "session") {
    return "Admin session expired. Sign in again.";
  }

  if (searchParams.error === "approve") {
    return "Could not approve this suggestion. Refresh and try again.";
  }

  if (searchParams.error === "reject") {
    return "Could not reject this suggestion. Refresh and try again.";
  }

  if (searchParams.success === "approved") {
    return "Suggestion promoted to live gate.";
  }

  if (searchParams.success === "rejected") {
    return "Suggestion rejected.";
  }

  return "";
}

async function getSuggestions() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
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
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error("Could not load suggestions");
  }

  return ((data ?? []) as unknown as AdminSuggestion[]).sort((first, second) => {
    if (first.status !== second.status) {
      return first.status === "community_confirmed" ? -1 : 1;
    }

    if (first.nearby_confirm_count !== second.nearby_confirm_count) {
      return second.nearby_confirm_count - first.nearby_confirm_count;
    }

    if (first.confirm_count !== second.confirm_count) {
      return second.confirm_count - first.confirm_count;
    }

    return (
      new Date(second.updated_at).getTime() -
      new Date(first.updated_at).getTime()
    );
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function stationLabel(suggestion: AdminSuggestion) {
  if (suggestion.nearest_station_name && suggestion.nearest_station_code) {
    return `${suggestion.nearest_station_name} (${suggestion.nearest_station_code})`;
  }

  return suggestion.nearest_station_name || suggestion.nearest_station_code || "";
}

function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </main>
  );
}

function LoginView({
  message,
  isConfigured,
}: {
  message: string;
  isConfigured: boolean;
}) {
  return (
    <AdminShell>
      <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
          GateUndo Admin
        </p>
        <h1 className="mt-2 text-[20px] font-bold leading-[1.2] text-[var(--text-primary)]">
          Suggestion review
        </h1>
        <p className="mt-2 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
          Review community suggested gates and promote only verified locations.
        </p>

        {message ? (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] font-semibold leading-[1.5] text-[var(--danger)]">
            {message}
          </div>
        ) : null}

        {isConfigured ? (
          <form action={loginAdminAction} className="mt-4">
            <label className="block text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
              Admin password
              <input
                name="password"
                type="password"
                required
                className="mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[15px] leading-[1.5] text-[var(--text-primary)]"
              />
            </label>
            <button
              type="submit"
              className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A]"
            >
              Sign in
            </button>
          </form>
        ) : (
          <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            Configure `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and
            `SUPABASE_SERVICE_ROLE_KEY` in your environment.
          </p>
        )}
      </div>
    </AdminShell>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AdminSuggestion }) {
  const station = stationLabel(suggestion);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
            {suggestion.status === "community_confirmed"
              ? "Community confirmed"
              : "Pending"}
          </p>
          <h2 className="mt-2 text-[16px] font-semibold leading-[1.2] text-[var(--text-primary)]">
            {suggestion.road_name}
          </h2>
          <p className="mt-1 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            {suggestion.district} · {suggestion.lat.toFixed(5)},{" "}
            {suggestion.lng.toFixed(5)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]">
          {suggestion.confirm_count} confirm / {suggestion.reject_count} wrong
          <br />
          {suggestion.nearby_confirm_count} nearby
        </div>
      </div>

      {station ? (
        <p className="mt-3 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
          Suggested station: {station}
        </p>
      ) : null}

      {suggestion.note ? (
        <p className="mt-2 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
          {suggestion.note}
        </p>
      ) : null}

      <p className="mt-3 text-[13px] leading-[1.5] text-[var(--text-muted)]">
        Updated {formatDate(suggestion.updated_at)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <form action={approveSuggestionAction}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[var(--status-open)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A]"
          >
            Approve
          </button>
        </form>
        <form action={rejectSuggestionAction}>
          <input type="hidden" name="suggestionId" value={suggestion.id} />
          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[var(--status-closed)] px-4 text-[15px] font-semibold leading-[1.2] text-white"
          >
            Reject
          </button>
        </form>
      </div>
    </article>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: AdminSearchParams;
}) {
  const params = searchParams ?? {};
  const message = getMessage(params);
  const configured = isAdminConfigured();
  const authenticated = isAdminAuthenticated();

  if (!configured || !authenticated) {
    return <LoginView message={message} isConfigured={configured} />;
  }

  const suggestions = await getSuggestions();
  const communityConfirmedCount = suggestions.filter(
    (suggestion) => suggestion.status === "community_confirmed",
  ).length;

  return (
    <AdminShell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
            GateUndo Admin
          </p>
          <h1 className="mt-2 text-[24px] font-bold leading-[1.2] text-[var(--text-primary)]">
            Gate suggestion review
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            Approving promotes a suggestion into the live gate list as a
            verified coordinate. Confirm the location before approving.
          </p>
        </div>
        <form action={logoutAdminAction}>
          <button
            type="submit"
            className="min-h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]"
          >
            Sign out
          </button>
        </form>
      </header>

      {message ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-[13px] font-semibold leading-[1.5] text-[var(--accent)]">
          {message}
        </div>
      ) : null}

      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <p className="text-[13px] leading-[1.5] text-[var(--text-muted)]">
            Review queue
          </p>
          <p className="mt-1 text-[20px] font-bold leading-[1.2] text-[var(--text-primary)]">
            {suggestions.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <p className="text-[13px] leading-[1.5] text-[var(--text-muted)]">
            Community confirmed
          </p>
          <p className="mt-1 text-[20px] font-bold leading-[1.2] text-[var(--accent)]">
            {communityConfirmedCount}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <p className="text-[13px] leading-[1.5] text-[var(--text-muted)]">
            Needs manual check
          </p>
          <p className="mt-1 text-[20px] font-bold leading-[1.2] text-[var(--text-primary)]">
            {suggestions.length - communityConfirmedCount}
          </p>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-[13px] leading-[1.5] text-[var(--text-secondary)]">
            No pending suggestions right now.
          </div>
        )}
      </section>
    </AdminShell>
  );
}
