-- Aggressive status decay: open/closed status only uses reports from the
-- last 7 minutes. Older reports remain in history, but the live status falls
-- back to unknown/no recent signal.

DROP VIEW IF EXISTS gate_statuses;

CREATE VIEW gate_statuses
WITH (security_invoker = false) AS
SELECT
  gates.id,
  gates.name,
  gates.district,
  gates.lat,
  gates.lng,
  gates.road_name,
  gates.is_verified,
  gates.verified_at,
  gates.verification_note,
  COALESCE(report_counts.total_reports, 0)::INTEGER AS report_count,
  COALESCE(report_counts.recent_reports, 0)::INTEGER AS recent_report_count,
  COALESCE(report_counts.recent_open_reports, 0)::INTEGER AS recent_open_count,
  COALESCE(report_counts.recent_closed_reports, 0)::INTEGER AS recent_closed_count,
  report_counts.last_reported_at,
  CASE
    WHEN COALESCE(report_counts.recent_open_reports, 0) >
      COALESCE(report_counts.recent_closed_reports, 0)
      THEN 'open'
    WHEN COALESCE(report_counts.recent_closed_reports, 0) >
      COALESCE(report_counts.recent_open_reports, 0)
      THEN 'closed'
    ELSE 'unknown'
  END AS status
FROM gates
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
    ) AS recent_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.status = 'open'
    ) AS recent_open_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.status = 'closed'
    ) AS recent_closed_reports,
    MAX(reports.reported_at) AS last_reported_at
  FROM reports
  WHERE reports.gate_id = gates.id
) report_counts ON true;

GRANT SELECT ON gate_statuses TO anon, authenticated;
