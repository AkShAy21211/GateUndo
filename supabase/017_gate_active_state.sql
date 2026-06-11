-- Gate lifecycle state. Inactive gates are retained for local context but are
-- not live reportable crossings.

ALTER TABLE gates
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS inactive_reason TEXT,
ADD COLUMN IF NOT EXISTS inactive_at TIMESTAMPTZ;

ALTER TABLE gates
DROP CONSTRAINT IF EXISTS gates_inactive_reason_length;

ALTER TABLE gates
ADD CONSTRAINT gates_inactive_reason_length
  CHECK (
    inactive_reason IS NULL
    OR char_length(trim(inactive_reason)) BETWEEN 3 AND 160
  );

UPDATE gates
SET
  is_active = false,
  inactive_reason = 'Reported replaced by ROB; needs final local confirmation',
  inactive_at = COALESCE(inactive_at, now()),
  verification_note = 'Reported obsolete/replaced by ROB from local feedback'
WHERE name = 'Pappinisseri'
  AND district = 'Kannur';

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
  gates.is_active,
  gates.inactive_reason,
  gates.inactive_at,
  gates.is_verified,
  gates.verified_at,
  gates.verification_note,
  gates.total_report_count::INTEGER AS report_count,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_report_count
    ELSE 0
  END::INTEGER AS recent_report_count,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_report_count
    ELSE 0
  END::INTEGER AS recent_nearby_report_count,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_open_count
    ELSE 0
  END::INTEGER AS recent_open_count,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_closed_count
    ELSE 0
  END::INTEGER AS recent_closed_count,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_open_score
    ELSE 0
  END::INTEGER AS recent_open_score,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_closed_score
    ELSE 0
  END::INTEGER AS recent_closed_score,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_open_score
    ELSE 0
  END::INTEGER AS recent_nearby_open_score,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_nearby_closed_score
    ELSE 0
  END::INTEGER AS recent_nearby_closed_score,
  CASE
    WHEN gates.is_active THEN gates.current_last_reported_at
    ELSE NULL
  END AS last_reported_at,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_status
    ELSE 'unknown'
  END AS status,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_signal_source
    ELSE 'none'
  END AS signal_source,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_is_unstable
    ELSE false
  END AS is_status_unstable,
  CASE
    WHEN gates.is_active AND gates.current_status_expires_at >= now()
      THEN gates.current_recent_flip_count
    ELSE 0
  END::INTEGER AS recent_status_flip_count,
  CASE
    WHEN gates.is_active THEN gates.current_status_expires_at
    ELSE NULL
  END AS status_expires_at
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
  gates.is_active,
  gates.inactive_reason,
  gates.inactive_at,
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
WHERE NOT gates.is_active
  OR NOT gates.is_verified
  OR gates.current_is_unstable
  OR gates.current_recent_flip_count >= 2
  OR (
    gates.current_recent_report_count >= 3
    AND gates.current_recent_nearby_report_count = 0
  )
ORDER BY
  gates.is_active ASC,
  gates.current_is_unstable DESC,
  gates.current_recent_flip_count DESC,
  gates.current_last_reported_at DESC NULLS LAST,
  gates.district,
  gates.name;

REVOKE ALL ON admin_gate_trust_review FROM PUBLIC, anon, authenticated;
