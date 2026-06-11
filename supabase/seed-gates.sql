WITH seed_gates(
  name,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
  is_verified,
  verification_note
) AS (
  VALUES
    ('Pappinisseri', 'Kannur', 11.938737, 75.348391, 'Pappinisseri railway crossing', NULL, NULL, false, 'Community sourced coordinate; needs field verification before launch'),
    ('Muzhappilangad', 'Kannur', 11.799612, 75.448296, 'Muzhappilangad railway crossing', 'Dharmadam', 'DMD', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Thazhe Chovva', 'Kannur', 11.864337, 75.407984, 'Thazhe Chovva railway crossing', 'Kannur South', 'CS', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Melechowa South', 'Kannur', 11.866387, 75.402703, 'Melechowa South railway crossing', 'Kannur South', 'CS', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Pallikkunnu', 'Kannur', 11.888852, 75.360965, 'Pallikkunnu railway crossing', 'Kannur', 'CAN', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Cherukunnu-Keezhara', 'Kannur', 11.990838, 75.308609, 'Cherukunnu-Keezhara railway crossing', 'Kannapuram', 'KPQ', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Thavam', 'Kannur', 12.016511, 75.274600, 'Thavam railway crossing', 'Pazhayangadi', 'PAZ', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Kuyyali (Thalassery)', 'Kannur', 11.759975, 75.488922, 'Kuyyali railway crossing', 'Thalassery', 'TLY', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Gopalpet (New Mahe / Thalassery Border)', 'Kannur', 11.730793, 75.511741, 'Gopalpet railway crossing', 'Mahe', 'MAHE', false, 'Community sourced coordinate; needs field verification before launch'),
    ('Peringadi (Mahe Border)', 'Kannur', 11.710650, 75.544212, 'Peringadi railway crossing', 'Mahe', 'MAHE', false, 'Community sourced coordinate; needs field verification before launch')
)
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
SELECT
  name,
  district,
  lat,
  lng,
  road_name,
  nearest_station_name,
  nearest_station_code,
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
