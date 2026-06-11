# GateUndo Abuse Monitoring

Use this during beta and before wider public launch. The goal is not perfect anti-spam; it is fast detection of suspicious behavior that can damage user trust.

## Daily Checks

Run these in the Supabase SQL editor with owner/service-role access:

```sql
SELECT * FROM admin_report_abuse_signals;
SELECT * FROM admin_gate_trust_review;
SELECT * FROM admin_gate_suggestion_review;
```

## What To Look For

- A reporter hash posting 5+ reports in 24 hours.
- One reporter hash reporting many different gates.
- Any far GPS report that should have been rejected.
- Gates marked `current_is_unstable = true`.
- Gates with 3+ recent reports but no nearby reports.
- Suggestions with many rejects or suspicious notes.
- Community-confirmed suggestions that need manual promotion or rejection.

## Actions

- If a gate coordinate is wrong, keep it provisional and update `verification_note`.
- If a gate is verified on the ground, set `is_verified = true` and `verified_at = now()`.
- If a suggestion is fake, set `status = 'rejected'`.
- If a suggestion is real and field-checked, promote it into `gates` and set the suggestion `status = 'approved'`.
- If one reporter hash is clearly abusive, increase cooldowns or temporarily ignore related reports in a follow-up migration.

## Kannur Beta Launch Rule

Ten gates is enough for a small Kannur beta if they are places you can personally verify or ask trusted locals to verify. It is not enough for an all-Kerala public launch.

For a wider launch, target:

- 10-15 verified gates in one district for beta.
- 30-50 verified gates across 2-3 districts for first public launch.
- Clear provisional labels for everything else.

## How To Get Better Seed Data

- Visit the crossing and drop a map pin while standing safely away from the track.
- Ask trusted local commuters to confirm the road name and crossing position.
- Cross-check the pin against satellite view and railway track alignment.
- Add only gates you can name clearly and place within roughly 50 meters.
- Keep uncertain gates provisional until checked.
