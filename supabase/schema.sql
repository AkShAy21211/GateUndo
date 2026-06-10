-- Gates table: railway level crossings in Kerala
CREATE TABLE gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  road_name TEXT,
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

-- Indexes for fast lookups
CREATE INDEX idx_reports_gate_id ON reports(gate_id);
CREATE INDEX idx_reports_reported_at ON reports(reported_at DESC);
CREATE INDEX idx_reports_gate_id_reported_at ON reports(gate_id, reported_at DESC);
CREATE INDEX idx_reports_gate_reporter_recent ON reports(gate_id, reporter_hash, reported_at DESC)
  WHERE reporter_hash IS NOT NULL;
CREATE INDEX idx_report_events_created_at ON report_events(created_at DESC);

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

-- Keep raw report storage bounded. Current status only needs the last 10 minutes.
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

-- Enable Row Level Security
ALTER TABLE gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read gates" ON gates FOR SELECT USING (true);
CREATE POLICY "Public read report events" ON report_events FOR SELECT USING (true);

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
      WHERE reports.reported_at >= now() - INTERVAL '10 minutes'
    ) AS recent_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '10 minutes'
        AND reports.status = 'open'
    ) AS recent_open_reports,
    COUNT(*) FILTER (
      WHERE reports.reported_at >= now() - INTERVAL '10 minutes'
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
END $$;
