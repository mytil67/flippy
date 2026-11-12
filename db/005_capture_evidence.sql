ALTER TABLE flippy_captures
  ADD COLUMN IF NOT EXISTS route_status text
    CHECK (route_status IN ('confirmed', 'probable', 'unverified', 'announced', 'conflict', 'unknown')),
  ADD COLUMN IF NOT EXISTS reported_flight_number text,
  ADD COLUMN IF NOT EXISTS reported_departure_code text,
  ADD COLUMN IF NOT EXISTS reported_arrival_code text,
  ADD COLUMN IF NOT EXISTS captured_lat double precision,
  ADD COLUMN IF NOT EXISTS captured_lon double precision,
  ADD COLUMN IF NOT EXISTS captured_heading real;
