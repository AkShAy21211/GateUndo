-- Minimal realtime signal for report inserts without exposing raw report rows.
-- Run this after 005_report_retention.sql in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS report_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_id UUID NOT NULL REFERENCES gates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_events_created_at
  ON report_events(created_at DESC);

ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read report events" ON report_events;

CREATE POLICY "Public read report events" ON report_events
  FOR SELECT
  USING (true);

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

DROP TRIGGER IF EXISTS trg_reports_create_event ON reports;

CREATE TRIGGER trg_reports_create_event
AFTER INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION create_report_event();

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
