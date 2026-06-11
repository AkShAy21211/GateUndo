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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reports table: anonymous crowdsourced status updates
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('open', 'closed')) NOT NULL,
  reporter_hash TEXT,
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
CREATE INDEX idx_report_events_created_at ON report_events(created_at DESC);
CREATE INDEX idx_gates_is_verified_district ON gates(is_verified, district, name);
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

-- Trusted current gate status: one row per gate, calculated in Postgres
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
