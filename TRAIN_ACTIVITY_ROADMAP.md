# GateUndo Train Activity Roadmap

This document captures the product decision for adding train-movement context to GateUndo. The feature is useful, but it must stay conservative because train data can hint at gate delays without proving whether a physical railway gate is open or closed.

## Final Decision

Build this as a **train activity helper**, not as an automatic gate status predictor.

GateUndo should never say:

- "Gate is safe to cross"
- "Gate is clear, proceed"
- "Gate will definitely close"

GateUndo can safely say:

- "Nearby train activity may affect this gate"
- "Check train movement near Thalassery (TLY)"
- "Train data unavailable. Use community reports and physical signals"

All train-related UI must keep the existing safety rule: **community reports and train hints are informational only; users must obey physical gate signals.**

## Why This Is Useful

Some railway gates are strongly affected by train movement near a nearby station. Local users already do this manually by checking railway apps before choosing a route. GateUndo can make that workflow easier by attaching a verified nearby station to a gate.

This should not be limited to Kuyyali. Kuyyali is only the example that revealed the idea.

Examples:

| Gate area | Nearby station |
| --- | --- |
| Kuyyali / Thalassery side | Thalassery (TLY) |
| Kannur town gates | Kannur (CAN) |
| Payyanur gates | Payyanur (PAY) |
| Koyilandy gates | Koyilandy (QLD) |

Only verified mappings should be shown in the app.

## Phase 1 - Safe MVP

**Timeline:** Now / next product increment.

Goal: Add station context without automatic prediction.

Planned work:

- Add optional station metadata for gates:
  - `nearest_station_name`
  - `nearest_station_code`
- Show station context on gate cards or gate detail/report sheet when available.
- Add a small "Check trains" action that opens an official train enquiry source or clearly shows the station code to search.
- Use safe wording:
  - "Nearby train activity may affect this gate"
  - "Check trains near Thalassery (TLY)"
- Keep community status as the primary status source.

Not included in Phase 1:

- No automatic "likely open" or "likely closed" result.
- No third-party train API dependency.
- No background prediction.

Success criteria:

- Users understand which station affects a gate.
- The feature helps locals check train movement faster.
- No UI suggests that train data is a safety signal.

## Phase 2 - Assisted Train Check

**Timeline:** After Phase 1 is live and at least 1-2 weeks of manual validation on Kannur-area gates.

Goal: Fetch nearby train movement through a backend function, cache it, and show a cautious activity hint.

Planned work:

- Evaluate reliable train data sources:
  - Official NTES / Indian Railways source where usable.
  - Third-party APIs only if reliability, cost, and terms are acceptable.
- Add a backend Edge Function for train activity lookups.
- Cache station activity for 2-3 minutes to avoid excessive API calls.
- Show only conservative states:
  - "Train activity nearby"
  - "No nearby passenger train activity found"
  - "Train data unavailable"
- Include "last checked" time.

Not included in Phase 2:

- No confident gate-open/closed prediction.
- No route-level automation.
- No alerts that imply the road is safe.

Success criteria:

- Train activity data is available consistently during real usage.
- API cost and uptime are acceptable.
- Users find the hint useful without confusing it with confirmed gate status.

## Phase 3 - Delay Risk Hints

**Timeline:** After Phase 2 has been validated for at least 2-4 weeks on real gates.

Goal: Convert train activity into soft delay-risk hints for verified gates only.

Possible labels:

- "Possible delay soon"
- "Train activity likely nearby"
- "No recent train activity found"

Rules:

- Only enable for gates with verified station mapping.
- Never show "safe", "clear", or "proceed".
- Always display the source timestamp.
- Always keep community reports visible beside the train hint.
- Disable or hide the hint automatically if train data becomes stale.

Success criteria:

- Hints match real-world gate behavior often enough to be useful.
- False confidence remains low.
- Users understand this is a delay-risk hint, not a safety instruction.

## Phase 4 - Route Intelligence

**Timeline:** Future feature, only after GateUndo has reliable gate data and more regular users.

Goal: Help users answer: "Will I be delayed on my route?"

Possible work:

- Let users save a simple route or favorite gates.
- Show gate status and train activity across that route.
- Highlight likely blockers before the user starts.
- Keep the app lightweight and no-login by default.

This is likely more valuable long-term than checking one gate at a time, but it should wait until the core gate data is trusted.

## Open Questions

- Which official or third-party train data source is reliable enough for Kerala routes?
- What are the usage limits and costs?
- Which gates have station mappings that locals agree are accurate?
- How often does station arrival/departure activity actually correlate with closure at each crossing?
- Should station mappings be admin-only, community-suggested, or both?

## Launch Position

For the current GateUndo beta, Phase 1 is enough.

Phase 2 and Phase 3 should wait until there is real validation from Kannur-area usage. The safest path is to first collect verified station mappings, then test whether train activity improves user decisions without creating false confidence.
