-- Hide raw report rows from public clients.
-- The app reads gate_statuses and writes through the report-gate Edge Function.
-- Run this after 003_gate_statuses_view.sql in the Supabase SQL editor.

DROP POLICY IF EXISTS "Public read reports" ON reports;

REVOKE SELECT ON reports FROM anon;
REVOKE SELECT ON reports FROM authenticated;

GRANT SELECT ON gate_statuses TO anon, authenticated;
