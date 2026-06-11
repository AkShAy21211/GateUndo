-- Optional station context on suggested gates. These values are user-submitted
-- hints only and must be reviewed before promotion into verified gates.

ALTER TABLE gate_suggestions
ADD COLUMN IF NOT EXISTS nearest_station_name TEXT,
ADD COLUMN IF NOT EXISTS nearest_station_code TEXT;

ALTER TABLE gate_suggestions
DROP CONSTRAINT IF EXISTS gate_suggestions_nearest_station_name_length,
DROP CONSTRAINT IF EXISTS gate_suggestions_nearest_station_code_format;

ALTER TABLE gate_suggestions
ADD CONSTRAINT gate_suggestions_nearest_station_name_length
  CHECK (
    nearest_station_name IS NULL
    OR char_length(trim(nearest_station_name)) BETWEEN 2 AND 80
  ),
ADD CONSTRAINT gate_suggestions_nearest_station_code_format
  CHECK (
    nearest_station_code IS NULL
    OR nearest_station_code = upper(trim(nearest_station_code))
  );

GRANT SELECT (
  id,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
  note,
  status,
  confirm_count,
  reject_count,
  nearby_confirm_count,
  created_at,
  updated_at
) ON gate_suggestions TO anon, authenticated;

DROP VIEW IF EXISTS admin_gate_suggestion_review;

CREATE VIEW admin_gate_suggestion_review AS
SELECT
  gate_suggestions.id,
  gate_suggestions.district,
  gate_suggestions.lat,
  gate_suggestions.lng,
  gate_suggestions.road_name,
  gate_suggestions.nearest_station_name,
  gate_suggestions.nearest_station_code,
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

REVOKE ALL ON admin_gate_suggestion_review FROM PUBLIC, anon, authenticated;
