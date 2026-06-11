import Link from "next/link";
import {
  ArrowLeft,
  Database,
  LocateFixed,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

const privacySections = [
  {
    title: "Minimal data",
    icon: Database,
    items: [
      "Gate reports, gate suggestions, and suggestion votes",
      "Anonymous server-side hashes for spam control",
      "Optional GPS only when the browser grants permission",
    ],
  },
  {
    title: "No account",
    icon: Smartphone,
    items: [
      "No login, phone number, email, password, or profile",
      "No background location tracking",
      "Local cache stays in the browser for faster repeat opens",
    ],
  },
  {
    title: "Location use",
    icon: LocateFixed,
    items: [
      "Nearby reports are trusted more than remote reports",
      "GPS reports too far from a gate are rejected",
      "Users can deny location and still view gate status",
    ],
  },
  {
    title: "Retention",
    icon: ShieldCheck,
    items: [
      "Raw reports are intended to be cleaned after 7 days",
      "Realtime report events are intended to be cleaned after 1 day",
      "Verified gate data remains in the public gate list",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-4 py-5 text-[var(--text-primary)] sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back
        </Link>

        <header className="mt-6 border-b border-[var(--border)] pb-5">
          <p className="text-[13px] font-bold uppercase leading-[1.2] tracking-[0.08em] text-[var(--accent)]">
            Privacy
          </p>
          <h1 className="mt-2 text-[28px] font-bold leading-[1.2]">
            GateUndo privacy notes
          </h1>
          <p className="mt-3 text-[15px] font-normal leading-[1.5] text-[var(--text-secondary)]">
            GateUndo is a no-login public utility. It collects only what is
            needed to show railway gate status, reduce spam, and keep the app
            useful on slow mobile networks.
          </p>
        </header>

        <section className="mt-5 grid gap-3 sm:grid-cols-2">
          {privacySections.map((section) => {
            const Icon = section.icon;

            return (
              <article
                key={section.title}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"
              >
                <div className="flex items-center gap-2 text-[var(--accent)]">
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  <h2 className="text-[16px] font-semibold leading-[1.2]">
                    {section.title}
                  </h2>
                </div>
                <ul className="mt-3 space-y-2 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h2 className="text-[16px] font-semibold leading-[1.2]">
            DPDP readiness
          </h2>
          <p className="mt-3 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
            Data is used for gate status, suggestions, anti-spam, and app
            reliability. The app avoids direct identity fields, keeps raw report
            access private, hashes reporter signals on the server, and provides
            a cleanup path for short-lived report data.
          </p>
        </section>

        <section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h2 className="text-[16px] font-semibold leading-[1.2]">
            User controls
          </h2>
          <p className="mt-3 text-[13px] font-normal leading-[1.5] text-[var(--text-secondary)]">
            Users can deny location permission, clear browser site data to
            remove local app cache and the browser device id, and dismiss app
            install prompts. Add a public contact email here before launch for
            privacy and correction requests.
          </p>
        </section>
      </div>
    </main>
  );
}
