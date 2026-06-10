-- Community gate suggestions. Suggested gates are never treated as verified gates
-- until an admin or trusted backend promotion moves them into the gates table.

CREATE TABLE IF NOT EXISTS gate_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district TEXT NOT NULL CHECK (district IN (
    'Alappuzha',
    'Ernakulam',
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

CREATE TABLE IF NOT EXISTS gate_suggestion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES gate_suggestions(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'reject')),
  voter_hash TEXT NOT NULL,
  is_nearby BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (suggestion_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_gate_suggestions_status_district
  ON gate_suggestions(status, district, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gate_suggestions_location
  ON gate_suggestions(lat, lng);

CREATE INDEX IF NOT EXISTS idx_gate_suggestion_votes_suggestion_id
  ON gate_suggestion_votes(suggestion_id);

CREATE INDEX IF NOT EXISTS idx_gate_suggestion_votes_voter_hash_created_at
  ON gate_suggestion_votes(voter_hash, created_at DESC);

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

DROP TRIGGER IF EXISTS trg_gate_suggestion_votes_refresh_counts
  ON gate_suggestion_votes;

CREATE TRIGGER trg_gate_suggestion_votes_refresh_counts
AFTER INSERT OR UPDATE OR DELETE ON gate_suggestion_votes
FOR EACH ROW
EXECUTE FUNCTION refresh_gate_suggestion_counts();

ALTER TABLE gate_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_suggestion_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active gate suggestions" ON gate_suggestions;

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

REVOKE ALL ON FUNCTION refresh_gate_suggestion_counts() FROM PUBLIC;

DO $$
BEGIN
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
