WITH seed_gates(name, district, lat, lng, road_name) AS (
  VALUES
    ('Kannur LC-08', 'Kannur', 11.8752, 75.3648, 'NH 66 Approach'),
    ('Kannur LC-12', 'Kannur', 12.0415, 75.3621, 'Thaliparamba Road'),
    ('Kozhikode LC-38', 'Kozhikode', 11.2581, 75.7795, 'Beach Road'),
    ('Kozhikode LC-44', 'Kozhikode', 11.1432, 75.8519, 'Feroke Road'),
    ('Palakkad LC-85', 'Palakkad', 10.7621, 76.2708, 'NH 966'),
    ('Palakkad LC-90', 'Palakkad', 10.7705, 76.3781, 'Ottapalam Road'),
    ('Thrissur LC-102', 'Thrissur', 10.5280, 76.2140, 'Round South'),
    ('Thrissur LC-109', 'Thrissur', 10.3005, 76.3312, 'Chalakudy Road'),
    ('Ernakulam LC-128', 'Ernakulam', 9.9818, 76.2995, 'MG Road'),
    ('Ernakulam LC-134', 'Ernakulam', 10.1008, 76.3575, 'Aluva Bypass'),
    ('Kottayam LC-145', 'Kottayam', 9.5912, 76.5225, 'Baker Junction Road'),
    ('Kollam LC-175', 'Kollam', 8.8935, 76.6138, 'Station Road'),
    ('Thiruvananthapuram LC-195', 'Thiruvananthapuram', 8.4858, 76.9495, 'MG Road'),
    ('Kannur LC-22', 'Kannur', 12.0980, 75.2030, 'Payyanur Town Road'),
    ('Kozhikode LC-48', 'Kozhikode', 11.1275, 75.9480, 'University Road')
)
INSERT INTO gates (name, district, lat, lng, road_name)
SELECT name, district, lat, lng, road_name
FROM seed_gates
WHERE NOT EXISTS (
  SELECT 1
  FROM gates
  WHERE gates.name = seed_gates.name
);
