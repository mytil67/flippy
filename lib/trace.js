import { distanceKm } from './flight.js';
import { airportNearGround } from './airportLookup.js';

const history = new Map();
const openSkyHistory = new Map();
const flyItalyHistory = new Map();
const traceBase = 'https://adsb.lol/data/traces';
let retryHistoryAt = 0;
let retryOpenSkyAt = 0;
let retryFlyItalyAt = 0;

async function fetchOpenSky(hex, at) {
  const query = new URLSearchParams({ icao24: hex, time: Math.floor(at / 1000) });
  const response = await fetch('https://opensky-network.org/api/tracks/all?' + query, { signal: AbortSignal.timeout(5000) });
  if (response.status === 403 || response.status === 429) retryOpenSkyAt = Date.now() + 5 * 60000;
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('OpenSky HTTP ' + response.status);
  return response.json();
}

function openSkyFor(hex, at) {
  const key = hex + ':' + Math.floor(at / 60000);
  const cached = openSkyHistory.get(key);
  if (cached?.expires > Date.now()) return cached.promise;
  if (retryOpenSkyAt > Date.now()) return null;
  const promise = fetchOpenSky(hex, at).catch(error => {
    console.warn('Historique OpenSky', error.cause?.code ?? error.message);
    return null;
  });
  if (openSkyHistory.size >= 150) openSkyHistory.delete(openSkyHistory.keys().next().value);
  openSkyHistory.set(key, { promise, expires: Date.now() + 45000 });
  return promise;
}

async function fetchTrace(hex, kind) {
  const response = await fetch(`${traceBase}/${hex.slice(-2)}/trace_${kind}_${hex}.json`, {
    signal: AbortSignal.timeout(6000)
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    const error = new Error('Trace ADS-B HTTP ' + response.status);
    error.status = response.status;
    throw error;
  }
  return readsbPoints(await response.json());
}

function readsbPoints(data) {
  if (!Number.isFinite(data.timestamp) || !Array.isArray(data.trace)) throw new Error('Trace ADS-B invalide');
  return data.trace.filter(row => Array.isArray(row) && Number.isFinite(row[0])).map(row => ({
    at: Math.round((data.timestamp + row[0]) * 1000),
    lat: row[1], lon: row[2], ground: row[3] === 'ground', altitude: row[3], speed: row[4],
    flags: row[6] ?? 0,
    callsign: typeof row[8]?.flight === 'string' ? row[8].flight.trim().toUpperCase() : ''
  }));
}

function flyItalyFor(hex, at) {
  const apiKey = process.env.FLYITALYADSB_API_KEY?.trim();
  if (!apiKey) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  const key = hex + ':' + day;
  const cached = flyItalyHistory.get(key);
  if (cached?.expires > Date.now()) return cached.promise;
  if (retryFlyItalyAt > Date.now()) return null;
  const promise = (async () => {
    const response = await fetch('https://api.flyitalyadsb.com/v2/history/' + hex + '/' + day, {
      headers: { 'X-Api-Key': apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(4000)
    });
    if ([401, 403, 429].includes(response.status)) retryFlyItalyAt = Date.now() + 60000;
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('FlyItalyADSB HTTP ' + response.status);
    const data = await response.json();
    if (typeof data.icao !== 'string' || data.icao.toLowerCase() !== hex) return null;
    return readsbPoints(data).sort((a, b) => a.at - b.at);
  })().catch(error => {
    console.warn('Historique FlyItalyADSB', error.cause?.code ?? error.message);
    return null;
  });
  if (flyItalyHistory.size >= 120) flyItalyHistory.delete(flyItalyHistory.keys().next().value);
  flyItalyHistory.set(key, { promise, expires: Date.now() + 30000 });
  return promise;
}

function historyFor(hex) {
  const cached = history.get(hex);
  if (cached?.expires > Date.now()) return cached.promise;
  if (retryHistoryAt > Date.now()) throw new Error('Historique ADS-B temporairement inaccessible');
  const promise = Promise.allSettled([fetchTrace(hex, 'full'), fetchTrace(hex, 'recent')]).then(results => {
    const points = new Map();
    for (const result of results) {
      for (const point of result.value ?? []) {
        const previous = points.get(point.at);
        points.set(point.at, previous ? {
          ...point, flags: point.flags | previous.flags,
          callsign: point.callsign || previous.callsign
        } : point);
      }
    }
    if (!points.size && results.some(result => result.status === 'rejected')) {
      const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (failures.every(error => error.status === 403 || error.status === 429)) retryHistoryAt = Date.now() + 60000;
      throw new AggregateError(failures, 'Historique ADS-B indisponible');
    }
    return [...points.values()].sort((a, b) => a.at - b.at);
  }).catch(error => {
    if (history.get(hex)?.promise === promise) history.delete(hex);
    throw error;
  });
  if (history.size >= 80) history.delete(history.keys().next().value);
  history.set(hex, { promise, expires: Date.now() + 20000 });
  return promise;
}

const gapMs = 90000;
const stale = 1;
const newLeg = 2;
const coordinate = point => [point.lat, point.lon];

function plausible(earlier, later) {
  const elapsed = later.at - earlier.at;
  return elapsed >= 0 && distanceKm(coordinate(earlier), coordinate(later)) <= 0.8 + elapsed / 2483;
}

function connected(earlier, later) {
  return later.at - earlier.at <= gapMs && !(later.flags & stale) && plausible(earlier, later);
}

function departureFromClimb(first, leg) {
  // A low, slow first position only supports a departure if readsb marked a new leg
  // and the subsequent observations show a sustained climb away from a nearby airport.
  if (!(first.flags & newLeg) || !Number.isFinite(first.altitude) || first.altitude > 3000 ||
      !Number.isFinite(first.speed) || first.speed < 90 || first.speed > 235) return;
  const airport = airportNearGround(first.lat, first.lon);
  if (!airport) return;
  const climbed = leg.some(point => {
    const elapsed = point.at - first.at;
    return elapsed >= 30000 && elapsed <= 120000 &&
      Number.isFinite(point.altitude) && point.altitude >= first.altitude + 1200 &&
      plausible(first, point) && distanceKm(coordinate(point), coordinate(airport)) >=
        distanceKm(coordinate(first), coordinate(airport)) + 3;
  });
  if (climbed) return { lat: first.lat, lon: first.lon, airport, inferred: true };
}

function departureFromGround(ground, airborne, callsign) {
  if (!ground?.ground || !airborne || (ground.callsign && callsign && ground.callsign !== callsign)) return;
  const elapsed = airborne.at - ground.at;
  if (elapsed < 0 || elapsed > 120000 || !(distanceKm(coordinate(ground), coordinate(airborne)) <= 12)) return;
  return { lat: ground.lat, lon: ground.lon, takeoffAt: airborne.at, airport: airportNearGround(ground.lat, ground.lon) };
}

export function extractFlightTrace(points, clicked, callsign) {
  const leg = [];
  let departure;
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.at > clicked.at || !Number.isFinite(point.at) || !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) continue;
    const later = leg.at(-1) ?? clicked;
    if (later.at - point.at > 1200000 || (point.callsign && callsign && point.callsign !== callsign)) break;
    if (point.ground) {
      departure = departureFromGround(point, leg.at(-1), callsign);
      break;
    }
    if (leg.length || plausible(point, clicked)) leg.push(point);
    if (point.flags & newLeg) {
      if (leg.at(-1) === point) {
        departure = departureFromGround(points[i - 1], point, callsign) ?? departureFromClimb(point, leg);
      }
      break;
    }
  }
  if (!leg.length) return { segments: [] };
  const ordered = [...leg.reverse(), clicked];
  const segments = [];
  let current = [];
  for (let i = 0; i < ordered.length; i++) {
    const point = ordered[i];
    const next = ordered[i + 1];
    const previous = current.at(-1);
    // Reject an isolated jump when the observations on either side agree.
    if (previous && next && !(point.flags & stale) && !plausible(previous, point) &&
        !plausible(point, next) && connected(previous, next)) continue;
    if (previous && !connected(previous, point)) {
      segments.push(current);
      current = [];
    }
    if (previous?.lat !== point.lat || previous?.lon !== point.lon || !current.length || point === clicked) current.push(point);
  }
  segments.push(current);
  const stride = Math.max(1, Math.ceil(leg.length / 650));
  const thinned = segments.filter(segment => segment.length > 1).map(segment =>
    segment.filter((_, index) => index % stride === 0 || index === segment.length - 1)
  );
  return { segments: thinned, departure };
}

export async function flightTrace(hex, clicked, callsign) {
  let trace;
  let archiveError;
  let source = 'FlyItalyADSB';
  const flyItaly = await flyItalyFor(hex, clicked.at);
  if (flyItaly) {
    const latest = flyItaly.findLast(point => point.at <= clicked.at && Number.isFinite(point.lat) && Number.isFinite(point.lon));
    if (latest && !latest.ground && clicked.at - latest.at <= 5 * 60000 && plausible(latest, clicked)) {
      trace = extractFlightTrace(flyItaly, clicked, callsign);
    }
  }
  if (!trace?.segments.length) {
    source = 'ADSB.lol';
    try {
      trace = extractFlightTrace(await historyFor(hex), clicked, callsign);
    } catch (error) {
      archiveError = error;
    }
  }
  if (!trace?.segments.length) {
    const track = await openSkyFor(hex, clicked.at);
    const alternative = extractOpenSkyTrace(track, hex, clicked, callsign);
    if (alternative?.segments.length) {
      trace = alternative;
      source = 'OpenSky';
    }
  }
  if (!trace) throw archiveError;
  const { segments, departure } = trace;
  return {
    segments: segments.map(segment => segment.map(coordinate)),
    timestamps: segments.map(segment => segment.map(point => point.at)),
    departure,
    source
  };
}

export function extractOpenSkyTrace(track, hex, clicked, callsign) {
  const flight = track?.callsign?.trim().toUpperCase();
  if (track?.icao24 !== hex || !Array.isArray(track.path) || (callsign && flight !== callsign)) return null;
  const points = track.path.filter(row => Array.isArray(row) && Number.isFinite(row[0]))
    .map(row => ({ at: row[0] * 1000, lat: row[1], lon: row[2], ground: row[5] === true, callsign: flight }))
    .sort((a, b) => a.at - b.at);
  const latest = points.findLast(point => point.at <= clicked.at && Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (!latest || latest.ground || clicked.at - latest.at > 5 * 60000 || !plausible(latest, clicked)) return null;
  return extractFlightTrace(points, clicked, callsign);
}
