-- Optional nearby station context for conservative train-activity hints.
-- This does not predict gate status; it only helps users check nearby train
-- movement when a station mapping has been verified.

ALTER TABLE gates
ADD COLUMN IF NOT EXISTS nearest_station_name TEXT,
ADD COLUMN IF NOT EXISTS nearest_station_code TEXT;

ALTER TABLE gates
DROP CONSTRAINT IF EXISTS gates_nearest_station_name_length,
DROP CONSTRAINT IF EXISTS gates_nearest_station_code_format;

ALTER TABLE gates
ADD CONSTRAINT gates_nearest_station_name_length
  CHECK (
    nearest_station_name IS NULL
    OR char_length(trim(nearest_station_name)) BETWEEN 2 AND 80
  ),
ADD CONSTRAINT gates_nearest_station_code_format
  CHECK (
    nearest_station_code IS NULL
    OR nearest_station_code = upper(trim(nearest_station_code))
  );

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
  gates.nearest_station_name,
  gates.nearest_station_code,
  gates.is_verified,
  gates.verified_at,
  gates.verification_note,
  gates.total_report_count::INTEGER AS report_count,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_report_count
    ELSE 0
  END::INTEGER AS recent_report_count,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_report_count
    ELSE 0
  END::INTEGER AS recent_nearby_report_count,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_open_count
    ELSE 0
  END::INTEGER AS recent_open_count,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_closed_count
    ELSE 0
  END::INTEGER AS recent_closed_count,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_open_score
    ELSE 0
  END::INTEGER AS recent_open_score,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_closed_score
    ELSE 0
  END::INTEGER AS recent_closed_score,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_open_score
    ELSE 0
  END::INTEGER AS recent_nearby_open_score,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_closed_score
    ELSE 0
  END::INTEGER AS recent_nearby_closed_score,
  gates.current_last_reported_at AS last_reported_at,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_status
    ELSE 'unknown'
  END AS status,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_signal_source
    ELSE 'none'
  END AS signal_source,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_is_unstable
    ELSE false
  END AS is_status_unstable,
  CASE
    WHEN gates.current_status_expires_at >= now()
      THEN gates.current_recent_flip_count
    ELSE 0
  END::INTEGER AS recent_status_flip_count,
  gates.current_status_expires_at AS status_expires_at
FROM gates;

GRANT SELECT ON gate_statuses TO anon, authenticated;

DROP VIEW IF EXISTS admin_gate_trust_review;

CREATE VIEW admin_gate_trust_review AS
SELECT
  gates.id,
  gates.name,
  gates.district,
  gates.nearest_station_name,
  gates.nearest_station_code,
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

REVOKE ALL ON admin_gate_trust_review FROM PUBLIC, anon, authenticated;
