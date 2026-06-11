-- Materialize current gate status for faster reads and clearer trust signals.
-- The public gate_statuses view keeps the same core API, but reads cached
-- gate fields instead of aggregating the full reports table on every request.

ALTER TABLE gates
  ADD COLUMN IF NOT EXISTS total_report_count INTEGER NOT NULL DEFAULT 0 CHECK (total_report_count >= 0),
  ADD COLUMN IF NOT EXISTS current_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (current_status IN ('open', 'closed', 'unknown')),
  ADD COLUMN IF NOT EXISTS current_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_status_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_last_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_recent_report_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_report_count >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_nearby_report_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_report_count >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_open_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_open_count >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_closed_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_closed_count >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_open_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_open_score >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_closed_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_closed_score >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_nearby_open_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_open_score >= 0),
  ADD COLUMN IF NOT EXISTS current_recent_nearby_closed_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_closed_score >= 0),
  ADD COLUMN IF NOT EXISTS current_signal_source TEXT NOT NULL DEFAULT 'none'
    CHECK (current_signal_source IN ('none', 'nearby', 'remote', 'mixed')),
  ADD COLUMN IF NOT EXISTS current_is_unstable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_recent_flip_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_flip_count >= 0);

CREATE INDEX IF NOT EXISTS idx_gates_current_status_district
  ON gates(current_status, district, name);

CREATE OR REPLACE FUNCTION refresh_gate_current_status(target_gate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_status TEXT;
  next_total_report_count INTEGER;
  next_recent_report_count INTEGER;
  next_recent_nearby_report_count INTEGER;
  next_recent_open_count INTEGER;
  next_recent_closed_count INTEGER;
  next_recent_open_score INTEGER;
  next_recent_closed_score INTEGER;
  next_recent_nearby_open_score INTEGER;
  next_recent_nearby_closed_score INTEGER;
  next_last_reported_at TIMESTAMPTZ;
  next_status TEXT;
  next_signal_source TEXT;
  next_is_unstable BOOLEAN;
  next_recent_flip_count INTEGER;
BEGIN
  SELECT gates.current_status
  INTO previous_status
  FROM gates
  WHERE gates.id = target_gate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH recent_reports AS (
    SELECT
      reports.id,
      reports.status,
      reports.is_nearby,
      reports.reported_at,
      report_freshness_weight(reports.reported_at) AS freshness_weight
    FROM reports
    WHERE reports.gate_id = target_gate_id
      AND reports.reported_at >= now() - INTERVAL '7 minutes'
  ),
  ordered_recent_reports AS (
    SELECT
      recent_reports.status,
      LAG(recent_reports.status) OVER (
        ORDER BY recent_reports.reported_at, recent_reports.id
      ) AS previous_report_status
    FROM recent_reports
  ),
  recent_flip_counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE previous_report_status IS NOT NULL
          AND previous_report_status <> status
      )::INTEGER AS recent_flip_count
    FROM ordered_recent_reports
  ),
  report_counts AS (
    SELECT
      COUNT(*)::INTEGER AS total_reports,
      COUNT(*) FILTER (
        WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
      )::INTEGER AS recent_reports,
      COUNT(*) FILTER (
        WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
          AND reports.is_nearby
      )::INTEGER AS recent_nearby_reports,
      COUNT(*) FILTER (
        WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
          AND reports.status = 'open'
      )::INTEGER AS recent_open_reports,
      COUNT(*) FILTER (
        WHERE reports.reported_at >= now() - INTERVAL '7 minutes'
          AND reports.status = 'closed'
      )::INTEGER AS recent_closed_reports,
      COALESCE(SUM(
        CASE
          WHEN reports.reported_at < now() - INTERVAL '7 minutes'
            OR reports.status <> 'open'
            THEN 0
          ELSE report_freshness_weight(reports.reported_at)
        END
      ), 0)::INTEGER AS recent_open_score,
      COALESCE(SUM(
        CASE
          WHEN reports.reported_at < now() - INTERVAL '7 minutes'
            OR reports.status <> 'closed'
            THEN 0
          ELSE report_freshness_weight(reports.reported_at)
        END
      ), 0)::INTEGER AS recent_closed_score,
      COALESCE(SUM(
        CASE
          WHEN reports.reported_at < now() - INTERVAL '7 minutes'
            OR NOT reports.is_nearby
            OR reports.status <> 'open'
            THEN 0
          ELSE report_freshness_weight(reports.reported_at)
        END
      ), 0)::INTEGER AS recent_nearby_open_score,
      COALESCE(SUM(
        CASE
          WHEN reports.reported_at < now() - INTERVAL '7 minutes'
            OR NOT reports.is_nearby
            OR reports.status <> 'closed'
            THEN 0
          ELSE report_freshness_weight(reports.reported_at)
        END
      ), 0)::INTEGER AS recent_nearby_closed_score,
      MAX(reports.reported_at) AS last_reported_at
    FROM reports
    WHERE reports.gate_id = target_gate_id
  )
  SELECT
    report_counts.total_reports,
    report_counts.recent_reports,
    report_counts.recent_nearby_reports,
    report_counts.recent_open_reports,
    report_counts.recent_closed_reports,
    report_counts.recent_open_score,
    report_counts.recent_closed_score,
    report_counts.recent_nearby_open_score,
    report_counts.recent_nearby_closed_score,
    report_counts.last_reported_at,
    CASE
      WHEN report_counts.recent_nearby_reports > 0
        AND report_counts.recent_nearby_open_score >
          report_counts.recent_nearby_closed_score
        THEN 'open'
      WHEN report_counts.recent_nearby_reports > 0
        AND report_counts.recent_nearby_closed_score >
          report_counts.recent_nearby_open_score
        THEN 'closed'
      WHEN report_counts.recent_nearby_reports > 0
        THEN 'unknown'
      WHEN report_counts.recent_open_score > report_counts.recent_closed_score
        THEN 'open'
      WHEN report_counts.recent_closed_score > report_counts.recent_open_score
        THEN 'closed'
      ELSE 'unknown'
    END,
    CASE
      WHEN report_counts.recent_reports = 0 THEN 'none'
      WHEN report_counts.recent_nearby_reports > 0
        AND report_counts.recent_nearby_open_score <>
          report_counts.recent_nearby_closed_score
        THEN 'nearby'
      WHEN report_counts.recent_open_score = report_counts.recent_closed_score
        THEN 'mixed'
      ELSE 'remote'
    END,
    (
      report_counts.recent_reports >= 3
      AND (
        COALESCE(recent_flip_counts.recent_flip_count, 0) >= 2
        OR (
          report_counts.recent_open_score > 0
          AND report_counts.recent_closed_score > 0
          AND abs(report_counts.recent_open_score - report_counts.recent_closed_score) <= 2
        )
      )
    ),
    COALESCE(recent_flip_counts.recent_flip_count, 0)
  INTO
    next_total_report_count,
    next_recent_report_count,
    next_recent_nearby_report_count,
    next_recent_open_count,
    next_recent_closed_count,
    next_recent_open_score,
    next_recent_closed_score,
    next_recent_nearby_open_score,
    next_recent_nearby_closed_score,
    next_last_reported_at,
    next_status,
    next_signal_source,
    next_is_unstable,
    next_recent_flip_count
  FROM report_counts
  CROSS JOIN recent_flip_counts;

  UPDATE gates
  SET
    total_report_count = COALESCE(next_total_report_count, 0),
    current_status = COALESCE(next_status, 'unknown'),
    current_status_updated_at = now(),
    current_status_expires_at = CASE
      WHEN next_last_reported_at IS NULL THEN NULL
      ELSE next_last_reported_at + INTERVAL '7 minutes'
    END,
    current_last_reported_at = next_last_reported_at,
    current_recent_report_count = COALESCE(next_recent_report_count, 0),
    current_recent_nearby_report_count = COALESCE(next_recent_nearby_report_count, 0),
    current_recent_open_count = COALESCE(next_recent_open_count, 0),
    current_recent_closed_count = COALESCE(next_recent_closed_count, 0),
    current_recent_open_score = COALESCE(next_recent_open_score, 0),
    current_recent_closed_score = COALESCE(next_recent_closed_score, 0),
    current_recent_nearby_open_score = COALESCE(next_recent_nearby_open_score, 0),
    current_recent_nearby_closed_score = COALESCE(next_recent_nearby_closed_score, 0),
    current_signal_source = COALESCE(next_signal_source, 'none'),
    current_is_unstable = COALESCE(next_is_unstable, false),
    current_recent_flip_count = COALESCE(next_recent_flip_count, 0)
  WHERE gates.id = target_gate_id;
END;
$$;

REVOKE ALL ON FUNCTION refresh_gate_current_status(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION refresh_gate_current_status_from_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_gate_current_status(NEW.gate_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_refresh_gate_current_status ON reports;

CREATE TRIGGER trg_reports_refresh_gate_current_status
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION refresh_gate_current_status_from_report();

REVOKE ALL ON FUNCTION refresh_gate_current_status_from_report() FROM PUBLIC;

DO $$
DECLARE
  gate_record RECORD;
BEGIN
  FOR gate_record IN SELECT id FROM gates LOOP
    PERFORM refresh_gate_current_status(gate_record.id);
  END LOOP;
END $$;

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
