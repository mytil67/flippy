import { routeDistance } from '../lib/routeEvidence.js';

const code = value => value?.trim().toUpperCase();
const pattern = /^[A-Z0-9]{2,5}$/;

export const discoveryLabels = {
  model: 'Nouveau modèle',
  airline: 'Nouvelle compagnie',
  route: 'Nouvelle liaison'
};

export function discoveryIndex(snapshot) {
  if (!snapshot) return null;
  return {
    models: new Set((snapshot.models ?? []).map(code)),
    airlines: new Set([...(snapshot.airlines ?? []), ...(snapshot.iata ?? [])].map(code)),
    routes: new Set((snapshot.routes ?? []).map(code))
  };
}

export function flightDiscoveries(index, plane, route) {
  if (!index || !plane) return [];
  const model = code(route?.airframe?.type || plane.type);
  const airline = route?.airline ?? plane.airline;
  const airlineCodes = [code(airline?.icao), code(airline?.iata)].filter(value => /^[A-Z0-9]{2,3}$/.test(value ?? ''));
  const from = code(route?.from?.code);
  const to = code(route?.to?.code);
  const discoveries = [];
  if (pattern.test(model ?? '') && model !== 'ZZZZ' && !index.models.has(model)) discoveries.push('model');
  if (airlineCodes.length && !airlineCodes.some(value => index.airlines.has(value))) discoveries.push('airline');
  if (from && to && from !== to && routeDistance(route) > 0 && !index.routes.has(`${from}:${to}`)) discoveries.push('route');
  return discoveries;
}
