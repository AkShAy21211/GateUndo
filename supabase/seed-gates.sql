WITH seed_gates(
  name,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
  is_active,
  inactive_reason,
  is_verified,
  verification_note
) AS (
  VALUES
    ('Pappinisseri', 'Kannur', 11.938737, 75.348391, 'Pappinisseri railway crossing', NULL, NULL, false, 'Reported replaced by ROB; needs final local confirmation', true, 'Reported obsolete/replaced by ROB from local feedback'),
    ('Muzhappilangad', 'Kannur', 11.799612, 75.448296, 'Muzhappilangad railway crossing', 'Dharmadam', 'DMD', true, NULL, true, 'Locally verified starter gate'),
    ('Thazhe Chovva', 'Kannur', 11.864337, 75.407984, 'Thazhe Chovva railway crossing', 'Kannur South', 'CS', true, NULL, true, 'Locally verified starter gate'),
    ('Melechowa South', 'Kannur', 11.866387, 75.402703, 'Melechowa South railway crossing', 'Kannur South', 'CS', true, NULL, true, 'Locally verified starter gate'),
    ('Pallikkunnu', 'Kannur', 11.888852, 75.360965, 'Pallikkunnu railway crossing', 'Kannur', 'CAN', true, NULL, true, 'Locally verified starter gate'),
    ('Cherukunnu-Keezhara', 'Kannur', 11.990838, 75.308609, 'Cherukunnu-Keezhara railway crossing', 'Kannapuram', 'KPQ', true, NULL, true, 'Locally verified starter gate'),
    ('Thavam', 'Kannur', 12.016511, 75.274600, 'Thavam railway crossing', 'Pazhayangadi', 'PAZ', true, NULL, true, 'Locally verified starter gate'),
    ('Kuyyali (Thalassery)', 'Kannur', 11.759975, 75.488922, 'Kuyyali railway crossing', 'Thalassery', 'TLY', true, NULL, true, 'Locally verified starter gate'),
    ('Gopalpet (New Mahe / Thalassery Border)', 'Kannur', 11.730793, 75.511741, 'Gopalpet railway crossing', 'Mahe', 'MAHE', true, NULL, true, 'Locally verified starter gate'),
    ('Peringadi (Mahe Border)', 'Kannur', 11.710650, 75.544212, 'Peringadi railway crossing', 'Mahe', 'MAHE', true, NULL, true, 'Locally verified starter gate')
)
INSERT INTO gates (
  name,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
  is_active,
  inactive_reason,
  inactive_at,
  is_verified,
  verified_at,
  verification_note
)
SELECT
  name,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
  is_active,
  inactive_reason,
  CASE WHEN is_active THEN NULL ELSE now() END,
  is_verified,
  CASE WHEN is_verified THEN now() ELSE NULL END,
  verification_note
FROM seed_gates
WHERE NOT EXISTS (
  SELECT 1
  FROM gates
  WHERE gates.name = seed_gates.name
    AND gates.district = seed_gates.district
);

WITH seed_station_context(
  name,
  district,
  nearest_station_name,
  nearest_station_code
) AS (
  VALUES
    ('Pappinisseri', 'Kannur', NULL, NULL),
    ('Muzhappilangad', 'Kannur', 'Dharmadam', 'DMD'),
    ('Thazhe Chovva', 'Kannur', 'Kannur South', 'CS'),
    ('Melechowa South', 'Kannur', 'Kannur South', 'CS'),
    ('Pallikkunnu', 'Kannur', 'Kannur', 'CAN'),
    ('Cherukunnu-Keezhara', 'Kannur', 'Kannapuram', 'KPQ'),
    ('Thavam', 'Kannur', 'Pazhayangadi', 'PAZ'),
    ('Kuyyali (Thalassery)', 'Kannur', 'Thalassery', 'TLY'),
    ('Gopalpet (New Mahe / Thalassery Border)', 'Kannur', 'Mahe', 'MAHE'),
    ('Peringadi (Mahe Border)', 'Kannur', 'Mahe', 'MAHE')
)
UPDATE gates
SET
  nearest_station_name = seed_station_context.nearest_station_name,
  nearest_station_code = seed_station_context.nearest_station_code
FROM seed_station_context
WHERE gates.name = seed_station_context.name
  AND gates.district = seed_station_context.district
  AND (
    gates.nearest_station_name IS DISTINCT FROM seed_station_context.nearest_station_name
    OR gates.nearest_station_code IS DISTINCT FROM seed_station_context.nearest_station_code
  );

WITH verified_seed_gates(name, district) AS (
  VALUES
    ('Pappinisseri', 'Kannur'),
    ('Muzhappilangad', 'Kannur'),
    ('Thazhe Chovva', 'Kannur'),
    ('Melechowa South', 'Kannur'),
    ('Pallikkunnu', 'Kannur'),
    ('Cherukunnu-Keezhara', 'Kannur'),
    ('Thavam', 'Kannur'),
    ('Kuyyali (Thalassery)', 'Kannur'),
    ('Gopalpet (New Mahe / Thalassery Border)', 'Kannur'),
    ('Peringadi (Mahe Border)', 'Kannur')
)
UPDATE gates
SET
  is_verified = true,
  verified_at = COALESCE(gates.verified_at, now()),
  verification_note = 'Locally verified starter gate'
FROM verified_seed_gates
WHERE gates.name = verified_seed_gates.name
  AND gates.district = verified_seed_gates.district;

UPDATE gates
SET
  is_active = false,
  inactive_reason = 'Reported replaced by ROB; needs final local confirmation',
  inactive_at = COALESCE(gates.inactive_at, now()),
  verification_note = 'Reported obsolete/replaced by ROB from local feedback'
WHERE gates.name = 'Pappinisseri'
  AND gates.district = 'Kannur';
