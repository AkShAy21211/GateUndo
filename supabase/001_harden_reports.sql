-- Harden anonymous reports without changing the app flow.
-- Run this in the Supabase SQL editor for the existing project.
-- Important: run 002_edge_report_rate_limit.sql immediately after this migration
-- before exposing the app publicly.

-- Remove invalid rows before adding stricter constraints.
DELETE FROM reports
WHERE gate_id IS NULL;

ALTER TABLE reports
  ALTER COLUMN gate_id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS user_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS user_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS distance_meters INTEGER,
  ADD COLUMN IF NOT EXISTS is_nearby BOOLEAN NOT NULL DEFAULT false,
  ALTER COLUMN reported_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reports_gate_id_reported_at
  ON reports(gate_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_gate_nearby_reported_at
  ON reports(gate_id, is_nearby, reported_at DESC);

-- Force reports to use trusted server time, even if a client sends reported_at.
CREATE OR REPLACE FUNCTION set_report_server_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.reported_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_server_timestamp ON reports;

CREATE TRIGGER trg_reports_server_timestamp
BEFORE INSERT ON reports
FOR EACH ROW
EXECUTE FUNCTION set_report_server_timestamp();

DROP POLICY IF EXISTS "Public insert reports" ON reports;

CREATE POLICY "Public insert reports" ON reports
  FOR INSERT
  TO anon
  WITH CHECK (gate_id IS NOT NULL AND status IN ('open', 'closed'));
