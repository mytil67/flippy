-- Les versions précédentes enregistraient les trajets annoncés même lorsque
-- aucun départ ADS-B ne les confirmait. La base ne conserve pas la preuve qui
-- permettrait de distinguer après coup les lignes fiables des faux positifs.
-- On garde donc chaque capture, mais on retire uniquement ces métadonnées de
-- trajet héritées. Les nouvelles captures ne les rempliront qu'après validation.
CREATE TABLE IF NOT EXISTS flippy_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

WITH migration AS (
  INSERT INTO flippy_migrations (name) VALUES ('005_clear_unverified_routes')
  ON CONFLICT DO NOTHING RETURNING 1
)
UPDATE flippy_captures
SET flight_number = NULL,
    route_km = NULL,
    departure_code = NULL,
    arrival_code = NULL
WHERE EXISTS (SELECT 1 FROM migration)
  AND (flight_number IS NOT NULL
    OR route_km IS NOT NULL
    OR departure_code IS NOT NULL
    OR arrival_code IS NOT NULL);
