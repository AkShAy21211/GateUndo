-- Keep raw report storage bounded.
-- Run this after 004_hide_raw_reports.sql in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION cleanup_old_reports()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM reports
  WHERE reported_at < now() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_old_reports() FROM PUBLIC;

-- Optional manual cleanup after creating the function.
SELECT cleanup_old_reports();

-- Optional scheduled cleanup:
-- Enable pg_cron in Supabase Dashboard > Database > Extensions, then run:
-- SELECT cron.schedule(
--   'cleanup-old-railundo-reports',
--   '17 * * * *',
--   'SELECT cleanup_old_reports();'
-- );
