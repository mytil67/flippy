import { airportByCode } from './airportLookup.js';
import { routeDistance } from './routeEvidence.js';

export function captureAirportDetails(item) {
  const from = airportByCode(item.reported_departure_code);
  const to = airportByCode(item.reported_arrival_code);
  const estimate = item.route_km == null && item.route_status !== 'conflict' &&
    from && to && from.code !== to.code &&
    (!item.departure_code || item.departure_code === from.code) &&
    (!item.arrival_code || item.arrival_code === to.code);
  return {
    ...item,
    departure_name: airportByCode(item.departure_code)?.name,
    arrival_name: airportByCode(item.arrival_code)?.name,
    reported_departure_name: from?.name,
    reported_arrival_name: to?.name,
    reported_route_km: estimate ? routeDistance({ from, to }) : undefined
  };
}

export function collectionDistanceLeaders(captures) {
  const ranked = [];
  for (const entry of captures) {
    if (entry.route_status === 'conflict') continue;
    const capture = captureAirportDetails(entry);
    const estimated = capture.route_km == null;
    const departure = estimated ? capture.reported_departure_code : capture.departure_code;
    const arrival = estimated ? capture.reported_arrival_code : capture.arrival_code;
    const km = Number(capture.route_km ?? capture.reported_route_km);
    if (!departure || !arrival || departure === arrival || !Number.isFinite(km) || km <= 0) continue;
    const flight = capture.flight_number || capture.callsign || capture.reported_flight_number || capture.registration || capture.aircraft.toUpperCase();
    ranked.push({ flight, departure, arrival, km, estimated, capture,
      from: airportByCode(departure), to: airportByCode(arrival) });
  }
  ranked.sort((a, b) => b.km - a.km || Number(a.estimated) - Number(b.estimated) ||
    Date.parse(b.capture.captured_at) - Date.parse(a.capture.captured_at) || a.flight.localeCompare(b.flight));
  const flights = [];
  const destinations = [];
  const seenFlights = new Set();
  const seenDestinations = new Set();
  for (const item of ranked) {
    const key = `${item.flight}:${item.departure}:${item.arrival}`;
    if (flights.length < 5 && !seenFlights.has(key)) {
      seenFlights.add(key);
      flights.push(item);
    }
    if (destinations.length < 5 && !seenDestinations.has(item.arrival)) {
      seenDestinations.add(item.arrival);
      destinations.push(item);
    }
    if (flights.length === 5 && destinations.length === 5) break;
  }
  return { flights, destinations };
}
