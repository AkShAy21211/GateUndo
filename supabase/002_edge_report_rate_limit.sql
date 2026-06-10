-- Move public report writes behind the report-gate Edge Function.
-- Run this after 001_harden_reports.sql in the Supabase SQL editor.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reporter_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_gate_reporter_recent
  ON reports(gate_id, reporter_hash, reported_at DESC)
  WHERE reporter_hash IS NOT NULL;

-- Anonymous clients should no longer insert directly into reports.
-- The Edge Function uses the service role key and inserts after validation/rate-limit checks.
DROP POLICY IF EXISTS "Public insert reports" ON reports;
