-- Admin helper for promoting reviewed community suggestions into live gates.
-- No public execute grant is provided; call this from server-side admin code
-- with the Supabase service role key.

CREATE OR REPLACE FUNCTION promote_gate_suggestion_to_gate(target_suggestion_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  suggestion_record gate_suggestions%ROWTYPE;
  new_gate_id UUID;
BEGIN
  SELECT *
  INTO suggestion_record
  FROM gate_suggestions
  WHERE id = target_suggestion_id
    AND status IN ('pending', 'community_confirmed')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'suggestion_not_promotable';
  END IF;

  INSERT INTO gates (
    name,
    district,
    lat,
    lng,
    road_name,
    nearest_station_name,
    nearest_station_code,
    is_verified,
    verified_at,
    verification_note
  )
  VALUES (
    suggestion_record.road_name,
    suggestion_record.district,
    suggestion_record.lat,
    suggestion_record.lng,
    suggestion_record.road_name,
    suggestion_record.nearest_station_name,
    suggestion_record.nearest_station_code,
    true,
    now(),
    'Promoted from community suggestion ' || suggestion_record.id::TEXT
  )
  RETURNING id INTO new_gate_id;

  UPDATE gate_suggestions
  SET
    status = 'approved',
    updated_at = now()
  WHERE id = target_suggestion_id;

  RETURN new_gate_id;
END;
$$;

REVOKE ALL ON FUNCTION promote_gate_suggestion_to_gate(UUID) FROM PUBLIC;
