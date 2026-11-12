CREATE TABLE IF NOT EXISTS flippy_captures (
  collector_id text NOT NULL,
  aircraft text NOT NULL,
  callsign text NOT NULL,
  flight_day date NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  flight_number text,
  registration text,
  model_code text,
  model text,
  airline_code text,
  airline text,
  observed_km integer CHECK (observed_km >= 0),
  PRIMARY KEY (collector_id, aircraft, callsign, flight_day)
);

CREATE INDEX IF NOT EXISTS flippy_captures_recent
  ON flippy_captures (collector_id, captured_at DESC);
