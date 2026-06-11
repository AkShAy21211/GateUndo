-- GPS proximity validation for reports. Reports without location are still
-- accepted, but nearby reports become the preferred signal when available.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS user_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS user_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distance_meters INTEGER,
  ADD COLUMN IF NOT EXISTS is_nearby BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_reports_gate_nearby_reported_at
  ON reports(gate_id, is_nearby, reported_at DESC);

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
  COALESCE(report_counts.recent_nearby_reports, 0)::INTEGER AS recent_nearby_report_count,
  COALESCE(report_counts.recent_open_reports, 0)::INTEGER AS recent_open_count,
  COALESCE(report_counts.recent_closed_reports, 0)::INTEGER AS recent_closed_count,
  report_counts.last_reported_at,
  CASE
    WHEN COALESCE(report_counts.recent_nearby_reports, 0) > 0
      AND COALESCE(report_counts.recent_nearby_open_reports, 0) >
        COALESCE(report_counts.recent_nearby_closed_reports, 0)
      THEN 'open'
    WHEN COALESCE(report_counts.recent_nearby_reports, 0) > 0
      AND COALESCE(report_counts.recent_nearby_closed_reports, 0) >
        COALESCE(report_counts.recent_nearby_open_reports, 0)
      THEN 'closed'
    WHEN COALESCE(report_counts.recent_nearby_reports, 0) > 0
      THEN 'unknown'
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
        AND reports.is_nearby
    ) AS recent_nearby_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.status = 'open'
    ) AS recent_open_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.status = 'closed'
    ) AS recent_closed_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.is_nearby
        AND reports.status = 'open'
    ) AS recent_nearby_open_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
        AND reports.is_nearby
        AND reports.status = 'closed'
    ) AS recent_nearby_closed_reports,
    MAX(reports.reported_at) AS last_reported_at
  FROM reports
  WHERE reports.gate_id = gates.id
) report_counts ON true;

GRANT SELECT ON gate_statuses TO anon, authenticated;
