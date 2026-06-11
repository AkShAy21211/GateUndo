-- Gates table: railway level crossings in Kerala
CREATE TABLE gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  road_name TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verification_note TEXT,
  total_report_count INTEGER NOT NULL DEFAULT 0 CHECK (total_report_count >= 0),
  current_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (current_status IN ('open', 'closed', 'unknown')),
  current_status_updated_at TIMESTAMPTZ,
  current_status_expires_at TIMESTAMPTZ,
  current_last_reported_at TIMESTAMPTZ,
  current_recent_report_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_report_count >= 0),
  current_recent_nearby_report_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_report_count >= 0),
  current_recent_open_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_open_count >= 0),
  current_recent_closed_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_closed_count >= 0),
  current_recent_open_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_open_score >= 0),
  current_recent_closed_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_closed_score >= 0),
  current_recent_nearby_open_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_open_score >= 0),
  current_recent_nearby_closed_score INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_nearby_closed_score >= 0),
  current_signal_source TEXT NOT NULL DEFAULT 'none'
    CHECK (current_signal_source IN ('none', 'nearby', 'remote', 'mixed')),
  current_is_unstable BOOLEAN NOT NULL DEFAULT false,
  current_recent_flip_count INTEGER NOT NULL DEFAULT 0 CHECK (current_recent_flip_count >= 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reports table: anonymous crowdsourced status updates
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('open', 'closed')) NOT NULL,
  reporter_hash TEXT,
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  distance_meters INTEGER,
  is_nearby BOOLEAN NOT NULL DEFAULT false,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Minimal public realtime event stream. Does not expose report status or reporter hashes.
CREATE TABLE report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suggested gates stay separate from verified gates until reviewed/promoted
CREATE TABLE gate_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district TEXT NOT NULL CHECK (district IN (
    'Alappuzha',
    'Ernakulam',
    'Idukki',
    'Kannur',
    'Kasaragod',
    'Kollam',
    'Kottayam',
    'Kozhikode',
    'Malappuram',
    'Palakkad',
    'Pathanamthitta',
    'Thrissur',
    'Thiruvananthapuram',
    'Wayanad'
  )),
  lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN 8.0 AND 13.0),
  lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN 74.5 AND 78.0),
  road_name TEXT NOT NULL CHECK (char_length(trim(road_name)) BETWEEN 3 AND 100),
  note TEXT CHECK (note IS NULL OR char_length(trim(note)) <= 180),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'community_confirmed', 'approved', 'rejected')),
  suggested_by_hash TEXT NOT NULL,
  confirm_count INTEGER NOT NULL DEFAULT 0 CHECK (confirm_count >= 0),
  reject_count INTEGER NOT NULL DEFAULT 0 CHECK (reject_count >= 0),
  nearby_confirm_count INTEGER NOT NULL DEFAULT 0 CHECK (nearby_confirm_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gate_suggestion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES gate_suggestions(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'reject')),
  voter_hash TEXT NOT NULL,
  is_nearby BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, voter_hash)
);

-- Indexes for fast lookups
CREATE INDEX idx_reports_gate_id ON reports(gate_id);
CREATE INDEX idx_reports_reported_at ON reports(reported_at DESC);
CREATE INDEX idx_reports_gate_id_reported_at ON reports(gate_id, reported_at DESC);
CREATE INDEX idx_reports_gate_reporter_recent ON reports(gate_id, reporter_hash, reported_at DESC)
  WHERE reporter_hash IS NOT NULL;
CREATE INDEX idx_reports_gate_nearby_reported_at
  ON reports(gate_id, is_nearby, reported_at DESC);
CREATE INDEX idx_report_events_created_at ON report_events(created_at DESC);
CREATE INDEX idx_gates_is_verified_district ON gates(is_verified, district, name);
CREATE INDEX idx_gates_current_status_district
  ON gates(current_status, district, name);
CREATE INDEX idx_gate_suggestions_status_district
  ON gate_suggestions(status, district, created_at DESC);
CREATE INDEX idx_gate_suggestions_location ON gate_suggestions(lat, lng);
CREATE INDEX idx_gate_suggestion_votes_suggestion_id
  ON gate_suggestion_votes(suggestion_id);
CREATE INDEX idx_gate_suggestion_votes_voter_hash_created_at
  ON gate_suggestion_votes(voter_hash, created_at DESC);

-- Force reports to use trusted server time, even if a client sends reported_at
CREATE OR REPLACE FUNCTION set_report_server_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reported_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_server_timestamp
BEFORE INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION set_report_server_timestamp();

CREATE OR REPLACE FUNCTION create_report_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO report_events(gate_id, created_at)
  VALUES (NEW.gate_id, NEW.reported_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reports_create_event
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION create_report_event();

-- Keep raw report storage bounded. Current status only needs the last 7 minutes.
CREATE OR REPLACE FUNCTION cleanup_old_reports()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_reports INTEGER;
  deleted_events INTEGER;
BEGIN
  DELETE FROM reports
  WHERE reported_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_reports = ROW_COUNT;

  DELETE FROM report_events
  WHERE created_at < now() - INTERVAL '1 day';
  GET DIAGNOSTICS deleted_events = ROW_COUNT;

  RETURN deleted_reports + deleted_events;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_old_reports() FROM PUBLIC;

CREATE OR REPLACE FUNCTION refresh_gate_suggestion_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_suggestion_id UUID;
  next_confirm_count INTEGER;
  next_reject_count INTEGER;
  next_nearby_confirm_count INTEGER;
  current_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_suggestion_id = OLD.suggestion_id;
  ELSE
    target_suggestion_id = NEW.suggestion_id;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'confirm'),
    COUNT(*) FILTER (WHERE vote = 'reject'),
    COUNT(*) FILTER (WHERE vote = 'confirm' AND is_nearby)
  INTO
    next_confirm_count,
    next_reject_count,
    next_nearby_confirm_count
  FROM gate_suggestion_votes
  WHERE suggestion_id = target_suggestion_id;

  SELECT status INTO current_status
  FROM gate_suggestions
  WHERE id = target_suggestion_id;

  UPDATE gate_suggestions
  SET
    confirm_count = COALESCE(next_confirm_count, 0),
    reject_count = COALESCE(next_reject_count, 0),
    nearby_confirm_count = COALESCE(next_nearby_confirm_count, 0),
    status = CASE
      WHEN current_status IN ('approved', 'rejected') THEN current_status
      WHEN COALESCE(next_confirm_count, 0) >= 5
        AND COALESCE(next_reject_count, 0) <= 1
        AND COALESCE(next_nearby_confirm_count, 0) >= 2
        THEN 'community_confirmed'
      ELSE 'pending'
    END,
    updated_at = now()
  WHERE id = target_suggestion_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_gate_suggestion_votes_refresh_counts
AFTER INSERT OR UPDATE OR DELETE ON gate_suggestion_votes
FOR EACH ROW
EXECUTE FUNCTION refresh_gate_suggestion_counts();

REVOKE ALL ON FUNCTION refresh_gate_suggestion_counts() FROM PUBLIC;

CREATE OR REPLACE FUNCTION report_freshness_weight(reported_at TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN reported_at >= now() - INTERVAL '90 seconds' THEN 4
    WHEN reported_at >= now() - INTERVAL '3 minutes' THEN 3
    WHEN reported_at >= now() - INTERVAL '5 minutes' THEN 2
    WHEN reported_at >= now() - INTERVAL '7 minutes' THEN 1
    ELSE 0
  END;
$$;

REVOKE ALL ON FUNCTION report_freshness_weight(TIMESTAMPTZ) FROM PUBLIC;

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

CREATE TRIGGER trg_reports_refresh_gate_current_status
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION refresh_gate_current_status_from_report();

REVOKE ALL ON FUNCTION refresh_gate_current_status_from_report() FROM PUBLIC;

-- Enable Row Level Security
ALTER TABLE gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_suggestion_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read gates" ON gates FOR SELECT USING (true);
CREATE POLICY "Public read report events" ON report_events FOR SELECT USING (true);
CREATE POLICY "Public read active gate suggestions" ON gate_suggestions
  FOR SELECT
  USING (status IN ('pending', 'community_confirmed'));

REVOKE ALL ON gate_suggestions FROM anon, authenticated;
REVOKE ALL ON gate_suggestion_votes FROM anon, authenticated;
GRANT SELECT (
  id,
  district,
  lat,
  lng,
  road_name,
  note,
  status,
  confirm_count,
  reject_count,
  nearby_confirm_count,
  created_at,
  updated_at
) ON gate_suggestions TO anon, authenticated;

-- Trusted current gate status: one row per gate, read from cached gate fields.
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

CREATE VIEW admin_report_abuse_signals AS
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

CREATE VIEW admin_gate_trust_review AS
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

CREATE VIEW admin_gate_suggestion_review AS
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'report_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE report_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gate_suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE gate_suggestions;
  END IF;
END $$;
