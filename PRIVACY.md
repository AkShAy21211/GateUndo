# GateUndo Privacy Notes

Last updated: June 11, 2026

GateUndo is a no-login public utility for checking community-reported railway gate status. The app is designed to collect the minimum data needed to reduce spam, protect trust, and show useful nearby gates.

## Safety Notice

GateUndo shows last community reports only. It does not decide whether a crossing is safe. Always obey physical railway signals, barriers, police, and railway staff.

## What We Collect

- Gate reports: gate id, reported status, server timestamp, and a short-lived anonymous reporter hash.
- Location for reports: only when the browser grants permission. We store latitude, longitude, distance from the gate, and whether the report was nearby.
- Gate suggestions: selected district, map coordinate, road/place name, optional note, server timestamp, and anonymous suggester hash.
- Suggestion votes: suggestion id, confirm/wrong vote, anonymous voter hash, and whether the vote was near the suggested gate.
- Local device id: stored in browser localStorage so the server can slow repeated spam from the same browser.
- Local app cache: recent gate status and pending suggestions are stored in localStorage so the app can open on slow or offline connections.
- Bot protection: Cloudflare Turnstile may process browser/security signals when enabled.
- Map display: Mapbox receives map tile requests when the map view is opened.

## What We Do Not Collect

- No account, password, phone number, email, profile, or contact list.
- No comments or social profile data.
- No background location tracking.
- No sale of user data.

## Why We Use This Data

- Show recent community gate status.
- Prefer nearby reports over remote reports.
- Reject or downweight suspicious reports.
- Prevent rapid repeated reports and fake gate suggestions.
- Cache the app shell and last known data for unreliable mobile networks.

## Retention

- Raw reports are intended to be cleaned after 7 days.
- Realtime report events are intended to be cleaned after 1 day.
- Browser localStorage remains on the device until the user clears site data or the app changes the cache version.
- Approved/verified gate data remains part of the public gate list.

## Anonymous Hashes

GateUndo hashes the browser device id, IP address, user-agent, and a private server salt before storing it. The raw device id is not stored in the database. This hash is used for rate limiting and abuse prevention, not for user profiles.

## Location

Location is optional. If permission is denied, users can still view the app and may still submit a lower-trust remote report. If a report includes GPS and is too far from the selected gate, the report is rejected.

## User Controls

- Deny location permission in the browser to avoid sharing GPS.
- Clear browser site data to remove the local device id and cached app data.
- Dismiss install prompts and banners in the app.

## DPDP Readiness Checklist

- Purpose limitation: data is used for gate status, suggestions, anti-spam, and reliability.
- Data minimization: no login or direct identity fields are collected.
- Retention limit: raw reports and realtime events have cleanup paths.
- User notice: this document explains collection and use in plain language.
- Security: writes go through Supabase Edge Functions, public clients cannot read raw reports, and reporter ids are hashed server-side.

## Contact

Before public launch, add a public contact email or form here for privacy and data correction requests.
