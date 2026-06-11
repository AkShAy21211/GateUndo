# GateUndo

GateUndo is a no-login Kerala railway gate status app. It shows last community reports, nearby trust signals, pending gate suggestions, and a Mapbox gate view.

## Safety Position

GateUndo must never frame a gate as safe to cross. Every status is only a last community report. Users must always obey physical railway signals, barriers, police, and railway staff.

Status wording should stay conservative:

- Last report open
- Last report closed
- No recent report

Avoid wording like safe, clear, proceed, or gate is open.

## Current MVP

- Kannur beta starts by default
- Mobile-first gate list and map
- District filters
- One-tap anonymous reports
- Nearby GPS trust signal
- Recency-weighted status decay
- Status instability warning
- Gate suggestions and community confirmation
- Offline saved data cache
- PWA install support
- DPDP/privacy notes at `/privacy`
- Privacy-conscious PostHog pageview analytics

## Kannur Beta Seed Rule

Ten gates is enough for a small Kannur beta because the launch scope is local and reviewable. Before calling a gate verified, check the crossing on the ground or with a trusted local and make sure the pin is close to the actual road crossing, not just the railway line.

For wider public launch, use 30-50 verified gates across 2-3 districts and keep all uncertain gates provisional.

See `ABUSE_MONITORING.md` for daily review queries and seed verification steps.

## Later Roadmap

Route-level intelligence is intentionally deferred until the core trust layer is stable. The future version should answer "will I be delayed on my route?" instead of only "what is gate X's last report?"

Possible route mode:

- Save a commute route
- Show gates near that route
- Highlight possible delay points
- Open the app directly to saved route status
- Keep the same conservative safety language

## Local Development

```bash
npm run dev
```

Open `http://localhost:3000`.

## Checks

```bash
npm run lint
npx tsc --noEmit --pretty false
```
