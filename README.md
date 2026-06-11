# GateUndo

GateUndo is a no-login, mobile-first Kerala railway gate status app. It helps people see the latest community-reported railway gate status, report fresh status, suggest missing gates, and help verify pending suggestions.

The app is currently a Kannur-focused beta. It is designed for quick use on slow mobile networks, especially when someone is already near a railway crossing and needs a fast community signal.

## Safety Position

GateUndo is informational only. It must never frame a crossing as safe to cross.

Every status is shown as a last community report, not an official railway signal. Users must always obey physical railway gates, signals, barriers, police, and railway staff.

Allowed wording:

- Last report open
- Last report closed
- No recent report
- Train activity may affect this gate

Avoid wording like:

- Safe
- Clear
- Proceed
- Gate is open
- Good to go

## Current Features

- Mobile-first list view for railway gates
- Mapbox map view with custom railway-style markers
- District filters for Kerala districts
- Default beta focus on Kannur
- One-tap anonymous gate status reporting
- Open / closed / unknown status badges
- Recency-weighted status calculation
- Status decay to unknown when reports become stale
- Nearby GPS trust signal for reports
- Distance validation before optimistic report updates
- Status instability warning when reports flip quickly
- Offline saved gate data cache
- Manual refresh in list view
- PWA install support for Android home screen
- Beta banner for first-time users
- Footer privacy link and safety disclaimer language
- Privacy-conscious PostHog pageview analytics

## Gate Suggestions

Users can suggest missing railway gates from the map after selecting a district. Suggested gates are not treated as live gates.

Suggestion flow:

1. User selects a district.
2. User places a marker on the map.
3. User submits road/place name, optional note, and optional nearby railway station context.
4. Other users can confirm or mark the suggestion wrong.
5. A suggestion can become `community_confirmed`.
6. A maintainer/admin must still review it before it becomes a live gate.

Current community confirmation criteria:

- At least 5 confirms
- At most 1 reject
- At least 2 nearby confirmations

Nearby confirmation currently means the voter is within 500 meters of the suggested gate.

List view also surfaces up to 3 pending suggestions so people do not have to open the map just to help verify new gates.

Minimal admin review is available at:

```text
/admin
```

The admin page uses a preset password from environment variables. Approving a suggestion promotes it into the live `gates` table as a verified gate and marks the suggestion as `approved`. Rejecting marks the suggestion as `rejected`.

## Train Activity Context

GateUndo supports optional nearby railway station context for gates and suggestions:

- `nearest_station_name`
- `nearest_station_code`

This is Phase 1 only. The app does not use a live train API yet and does not predict gate closure from train movement.

For gates with station context, the app shows conservative helper text such as:

> Train activity near Thalassery (TLY) may affect this gate.

Users can open the official NTES website manually from the report sheet. Automated train activity checks are deferred until a reliable source is validated.

See `TRAIN_ACTIVITY_ROADMAP.md` for the staged plan.

## Trust And Anti-Spam

GateUndo uses several lightweight trust layers:

- Cloudflare Turnstile support for reports/suggestions/votes
- Anonymous device hash through Supabase Edge Functions
- Report rate limiting
- Suggestion rate limiting
- Suggestion vote rate limiting
- GPS proximity scoring
- Server-side timestamps for reports
- Raw report table hidden from public clients
- Public app reads trusted status through views/cached gate fields
- Admin-only review views for abuse and gate trust monitoring

The app intentionally avoids login, user profiles, comments, and public identity features.

## Architecture

Frontend:

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- React client page for the interactive app
- Lucide icons
- Mapbox GL JS, lazy-loaded only on map view
- PWA manifest and service worker
- PostHog pageview analytics with session recording disabled

Backend:

- Supabase Postgres
- Supabase RLS policies
- Supabase Edge Functions
- Public read views for app data
- Admin-only SQL views for review workflows

Important Edge Functions:

- `report-gate`
- `suggest-gate`
- `vote-gate-suggestion`

Important docs:

- `PRIVACY.md`
- `ABUSE_MONITORING.md`
- `DEPLOYMENT_CHECKLIST.md`
- `TRAIN_ACTIVITY_ROADMAP.md`

## Supabase Schema

The canonical schema is in:

```text
supabase/schema.sql
```

Incremental migrations are stored as numbered SQL files:

```text
supabase/001_harden_reports.sql
supabase/002_edge_report_rate_limit.sql
...
supabase/015_gate_suggestion_station_context.sql
```

Seed data for the current Kannur beta is in:

```text
supabase/seed-gates.sql
```

## Kannur Beta Seed Rule

Ten starter gates is enough for a small Kannur beta because the launch scope is local and reviewable.

Before calling any gate verified:

- Check the crossing on the ground or with a trusted local.
- Confirm the marker is on the actual road crossing, not just the railway line.
- Keep uncertain coordinates provisional.

For wider public launch, use 30-50 verified gates across 2-3 districts before presenting the app as broadly useful.

## Environment Variables

Create `.env.local` for local development. Do not commit real secrets.

Required public variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
```

Optional public variables:

```bash
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_project_key
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Required Supabase Edge Function secrets:

```bash
SUPABASE_URL=managed_by_supabase
SUPABASE_SERVICE_ROLE_KEY=managed_by_supabase
REPORT_HASH_SALT=some_long_random_secret
```

Optional Edge Function secret:

```bash
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
```

Required for `/admin`:

```bash
ADMIN_PASSWORD=your_private_admin_password
ADMIN_SESSION_SECRET=another_long_random_secret
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Never commit:

- Supabase service role key
- Turnstile secret key
- Report hash salt
- Admin password
- Admin session secret
- Any private API key

## Local Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Checks

Run before committing:

```bash
npm run lint
npx tsc --noEmit --pretty false
```

Production build:

```bash
npm run build
```

## Deployment Notes

Vercel:

- Add all required `NEXT_PUBLIC_*` environment variables.
- Redeploy after changing any public environment variable.
- Use a URL-restricted Mapbox public token for production.

Mapbox token recommendations:

- Use a public `pk...` token.
- Enable public scopes such as `styles:read`, `styles:tiles`, and `fonts:read`.
- Do not enable secret scopes for the frontend token.
- Add URL restrictions for production and local testing:
  - `https://gateundo.vercel.app/*`
  - `http://localhost:3000/*`
  - `http://127.0.0.1:3000/*`

Supabase:

- Apply migrations before deploying code that reads new columns.
- Deploy Edge Functions after changes.
- Keep raw reports hidden from public clients.
- Use admin review views regularly during beta.

## Privacy

GateUndo is built to avoid accounts and personal profiles.

The app may process:

- Approximate location when the user grants permission
- Anonymous device hash
- Report/suggestion/vote timestamps
- Basic pageview analytics

See `PRIVACY.md` for details and contact information.

## Roadmap

Near-term:

- Verify more Kannur gates on the ground
- Improve admin review flow for community-confirmed suggestions
- Add more clear beta/help copy if users misunderstand status confidence

Later:

- Route-level delay intelligence
- Better favorite/nearby gate workflows
- Automated train activity hints only if a reliable source is validated
- Wider launch districts after verified seed coverage improves

Route-level intelligence is intentionally deferred until the core trust layer is stable. The future version should answer "will I be delayed on my route?" instead of only "what is gate X's last report?"
