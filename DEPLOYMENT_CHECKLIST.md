# GateUndo Deployment Checklist

Use this when setting up a fresh Supabase project or after deleting the old tables.

## 1. App environment

Update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_project_api_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

`NEXT_PUBLIC_TURNSTILE_SITE_KEY` comes from Cloudflare Turnstile.
`NEXT_PUBLIC_POSTHOG_KEY` comes from PostHog project settings.

## 2. Supabase SQL

For a fresh database, run only:

```sql
-- supabase/schema.sql
```

Then seed gates:

```sql
-- supabase/seed-gates.sql
```

For an existing database, run migrations in order:

```text
001_harden_reports.sql
002_edge_report_rate_limit.sql
003_gate_statuses_view.sql
004_hide_raw_reports.sql
005_report_retention.sql
006_realtime_report_events.sql
```

## 3. Edge Function secrets

Set these in Supabase Dashboard > Edge Functions > Secrets:

```text
REPORT_HASH_SALT=long_random_private_text
TURNSTILE_SECRET_KEY=cloudflare_turnstile_secret_key
```

`TURNSTILE_SECRET_KEY` comes from Cloudflare Turnstile. If it is missing, Turnstile validation is skipped.

## 4. Deploy Edge Function

Deploy:

```bash
supabase functions deploy report-gate
```

If Supabase CLI is not installed, deploy the function from the Supabase Dashboard or install the CLI first.

## 5. Verify database

Run:

```sql
SELECT id, name, district FROM gates LIMIT 5;
SELECT * FROM gate_statuses LIMIT 5;
SELECT * FROM report_events ORDER BY created_at DESC LIMIT 5;
SELECT * FROM admin_report_abuse_signals;
SELECT * FROM admin_gate_trust_review;
SELECT * FROM admin_gate_suggestion_review;
```

`reports` should not be readable from the public app. The app should read `gate_statuses`.

## 6. Verify report flow

Use the app:

1. Open a gate.
2. Complete the Turnstile check if visible.
3. Tap `OPEN` or `CLOSED`.
4. Confirm the card updates instantly.
5. Confirm `report_events` receives a new row.
6. Confirm another browser/app instance refreshes automatically.

## 7. Verify map

1. Open Map view.
2. Confirm markers render.
3. Confirm location is not requested automatically.
4. Tap `Use my location`.
5. Allow location and confirm the blue marker appears.

## 8. Kannur beta launch

Ten starter gates are enough for a small Kannur beta if you can personally verify them or get trusted local confirmation. Keep uncertain gates provisional. Do not present all-Kerala coverage as ready until 30-50 verified gates exist across 2-3 districts.

Check `ABUSE_MONITORING.md` daily during beta.
