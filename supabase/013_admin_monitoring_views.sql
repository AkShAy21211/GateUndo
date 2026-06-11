-- Admin-only review helpers for launch monitoring.
-- These views intentionally expose reporter/suggester hashes and must not be
-- granted to anon or authenticated clients. Use them from the Supabase SQL
-- editor/service role only.

CREATE OR REPLACE VIEW admin_report_abuse_signals AS
SELECT
  reports.reporter_hash,
  COUNT(*)::INTEGER AS reports_24h,
  COUNT(DISTINCT reports.gate_id)::INTEGER AS gates_reported_24h,
  COUNT(*) FILTER (WHERE reports.distance_meters IS NULL)::INTEGER AS remote_reports_24h,
  COUNT(*) FILTER (WHERE reports.distance_meters > 1000)::INTEGER AS far_reports_24h,
  COUNT(*) FILTER (WHERE reports.is_nearby)::INTEGER AS nearby_reports_24h,
  MIN(reports.reported_at) AS first_reported_at,
  MAX(reports.reported_at) AS last_reported_at
FROM reports
WHERE reports.reporter_hash IS NOT NULL
  AND reports.reported_at >= now() - INTERVAL '24 hours'
GROUP BY reports.reporter_hash
HAVING COUNT(*) >= 5
  OR COUNT(DISTINCT reports.gate_id) >= 4
  OR COUNT(*) FILTER (WHERE reports.distance_meters > 1000) > 0
ORDER BY reports_24h DESC, last_reported_at DESC;

CREATE OR REPLACE VIEW admin_gate_trust_review AS
SELECT
  gates.id,
  gates.name,
  gates.district,
  gates.is_verified,
  gates.verification_note,
  gates.current_status,
  gates.current_signal_source,
  gates.current_recent_report_count,
  gates.current_recent_nearby_report_count,
  gates.current_recent_open_score,
  gates.current_recent_closed_score,
  gates.current_is_unstable,
  gates.current_recent_flip_count,
  gates.current_last_reported_at
FROM gates
WHERE NOT gates.is_verified
  OR gates.current_is_unstable
  OR gates.current_recent_flip_count >= 2
  OR (
    gates.current_recent_report_count >= 3
    AND gates.current_recent_nearby_report_count = 0
  )
ORDER BY
  gates.current_is_unstable DESC,
  gates.current_recent_flip_count DESC,
  gates.current_last_reported_at DESC NULLS LAST,
  gates.district,
  gates.name;

CREATE OR REPLACE VIEW admin_gate_suggestion_review AS
SELECT
  gate_suggestions.id,
  gate_suggestions.district,
  gate_suggestions.lat,
  gate_suggestions.lng,
  gate_suggestions.road_name,
  gate_suggestions.note,
  gate_suggestions.status,
  gate_suggestions.confirm_count,
  gate_suggestions.reject_count,
  gate_suggestions.nearby_confirm_count,
  gate_suggestions.suggested_by_hash,
  gate_suggestions.created_at,
  gate_suggestions.updated_at
FROM gate_suggestions
WHERE gate_suggestions.status IN ('pending', 'community_confirmed')
ORDER BY
  gate_suggestions.status = 'community_confirmed' DESC,
  gate_suggestions.nearby_confirm_count DESC,
  gate_suggestions.confirm_count DESC,
  gate_suggestions.updated_at DESC;

REVOKE ALL ON admin_report_abuse_signals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON admin_gate_trust_review FROM PUBLIC, anon, authenticated;
REVOKE ALL ON admin_gate_suggestion_review FROM PUBLIC, anon, authenticated;
