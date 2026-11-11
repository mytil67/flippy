import { distanceKm } from './flight.js';
import airports from './airports.json' with { type: 'json' };

// OurAirports public-domain snapshot, filtered to medium and large airports with IATA codes.
// https://ourairports.com/data/
export function airportNearGround(lat, lon) {
  let nearest;
  let best = 6;
  let second = Infinity;
  for (const [code, name, airportLat, airportLon] of airports) {
    if (Math.abs(airportLat - lat) > 0.06) continue;
    const distance = distanceKm([lat, lon], [airportLat, airportLon]);
    if (distance < best) {
      second = nearest ? best : second;
      best = distance;
      nearest = { code, name, lat: airportLat, lon: airportLon };
    } else if (distance < second) {
      second = distance;
    }
  }
  return second - best >= 1 ? nearest : undefined;
}
