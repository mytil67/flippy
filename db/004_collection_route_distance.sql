ALTER TABLE flippy_captures
  ADD COLUMN IF NOT EXISTS route_km integer CHECK (route_km >= 0),
  ADD COLUMN IF NOT EXISTS departure_code text,
  ADD COLUMN IF NOT EXISTS arrival_code text;
