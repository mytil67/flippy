import { distanceKm } from './flight.js';

const history = new Map();
const traceBase = 'https://globe.adsb.lol/data/traces';

async function fetchTrace(hex, kind) {
  const response = await fetch(`${traceBase}/${hex.slice(-2)}/trace_${kind}_${hex}.json`, {
    signal: AbortSignal.timeout(6500)
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error('Trace ADS-B HTTP ' + response.status);
  const data = await response.json();
  if (!Number.isFinite(data.timestamp) || !Array.isArray(data.trace)) throw new Error('Trace ADS-B invalide');
  return data.trace.map(row => ({
    at: Math.round((data.timestamp + row[0]) * 1000),
    lat: row[1], lon: row[2], ground: row[3] === 'ground',
    flags: row[6] ?? 0, callsign: row[8]?.flight?.trim().toUpperCase()
  }));
}

function historyFor(hex) {
  const cached = history.get(hex);
  if (cached?.expires > Date.now()) return cached.promise;
  const promise = Promise.allSettled([fetchTrace(hex, 'full'), fetchTrace(hex, 'recent')]).then(results => {
    const points = new Map();
    for (const result of results) {
      for (const point of result.value ?? []) {
        if (!point.callsign && points.get(point.at)?.callsign) continue;
        points.set(point.at, point);
      }
    }
    if (!points.size && results.some(result => result.status === 'rejected')) throw new Error('Historique ADS-B indisponible');
    return [...points.values()].sort((a, b) => a.at - b.at);
  }).catch(error => {
    if (history.get(hex)?.promise === promise) history.delete(hex);
    throw error;
  });
  if (history.size >= 80) history.delete(history.keys().next().value);
  history.set(hex, { promise, expires: Date.now() + 20000 });
  return promise;
}

const gapMs = 180000;
const coordinate = point => [point.lat, point.lon];

function separated(earlier, later) {
  const elapsed = later.at - earlier.at;
  return elapsed > gapMs || distanceKm(coordinate(earlier), coordinate(later)) > 4 + elapsed / 2700;
}

export function extractTrace(points, clicked, callsign) {
  const leg = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.at > clicked.at || !Number.isFinite(point.at) || !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) continue;
    const later = leg.at(-1) ?? clicked;
    if (later.at - point.at > 1200000 || (point.callsign && callsign && point.callsign !== callsign)) break;
    if (!leg.length && distanceKm(coordinate(point), coordinate(clicked)) > 8 + (clicked.at - point.at) / 2700) break;
    if (!point.ground && !(point.flags & 1)) leg.push(point);
    if (point.ground || point.flags & 2) break;
  }
  if (!leg.length) return [];
  const segments = [];
  let current = [];
  for (const point of [...leg.reverse(), clicked]) {
    const previous = current.at(-1);
    if (previous && separated(previous, point)) {
      segments.push(current);
      current = [];
    }
    if (previous?.lat !== point.lat || previous?.lon !== point.lon || !current.length) current.push(point);
  }
  segments.push(current);
  const stride = Math.max(1, Math.ceil(leg.length / 650));
  return segments.filter(segment => segment.length > 1).map(segment =>
    segment.filter((_, index) => index % stride === 0 || index === segment.length - 1)
  );
}

export async function flightTrace(hex, clicked, callsign) {
  const trace = extractTrace(await historyFor(hex), clicked, callsign);
  return {
    segments: trace.map(segment => segment.map(coordinate)),
    timestamps: trace.map(segment => segment.map(point => point.at))
  };
}
