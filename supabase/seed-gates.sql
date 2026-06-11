WITH seed_gates(name, district, lat, lng, road_name, is_verified, verification_note) AS (
  VALUES
    ('Pappinisseri', 'Kannur', 11.938737, 75.348391, 'Pappinisseri railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Muzhappilangad', 'Kannur', 11.799612, 75.448296, 'Muzhappilangad railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Thazhe Chovva', 'Kannur', 11.864337, 75.407984, 'Thazhe Chovva railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Melechowa South', 'Kannur', 11.866387, 75.402703, 'Melechowa South railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Pallikkunnu', 'Kannur', 11.888852, 75.360965, 'Pallikkunnu railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Cherukunnu-Keezhara', 'Kannur', 11.990838, 75.308609, 'Cherukunnu-Keezhara railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Thavam', 'Kannur', 12.016511, 75.274600, 'Thavam railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Kuyyali (Thalassery)', 'Kannur', 11.759975, 75.488922, 'Kuyyali railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Gopalpet (New Mahe / Thalassery Border)', 'Kannur', 11.730793, 75.511741, 'Gopalpet railway crossing', true, 'Community sourced coordinate; verify against field survey before launch'),
    ('Peringadi (Mahe Border)', 'Kannur', 11.710650, 75.544212, 'Peringadi railway crossing', true, 'Community sourced coordinate; verify against field survey before launch')
)
INSERT INTO gates (
  name,
  district,
  lat,
  lng,
  road_name,
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
