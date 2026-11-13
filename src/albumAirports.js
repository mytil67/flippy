import { nearLongitude } from './traceGeometry.js';

export function atlasConnection(from, to) {
  const end = nearLongitude(to.lon, from.lon);
  const startPoint = [from.lat, from.lon];
  const endPoint = [to.lat, to.lon];
  if (end === to.lon) return [[startPoint, endPoint]];
  if (end === from.lon) return [[startPoint, [to.lat, end]]];
  const edge = end > 180 ? 180 : -180;
  const edgeLat = from.lat + (to.lat - from.lat) * (edge - from.lon) / (end - from.lon);
  return [[startPoint, [edgeLat, edge]], [[edgeLat, -edge], endPoint]];
}

export function albumAirports(departures = [], arrivals = []) {
  const airports = new Map();
  const collect = (items, role) => {
    for (const item of items) {
      if (!item.code || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      const current = airports.get(item.code) ?? {
        code: item.code, name: item.name || item.code, lat: item.lat, lon: item.lon, departures: 0, arrivals: 0
      };
      current[role] += Number(item.count) || 0;
      if (current.name === current.code && item.name) current.name = item.name;
      airports.set(item.code, current);
    }
  };
  collect(departures, 'departures');
  collect(arrivals, 'arrivals');
  return [...airports.values()].sort((left, right) =>
    right.departures + right.arrivals - left.departures - left.arrivals || left.code.localeCompare(right.code));
}
