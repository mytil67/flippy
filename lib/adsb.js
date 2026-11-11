import { center, radius, distanceKm, knownAirline, operatorCode } from './flight.js';

const queryRadius = Math.ceil(radius / 1.852);
const feeds = [
  { name: 'ADSB.lol', url: `https://api.adsb.lol/v2/point/${center.join('/')}/${queryRadius}`, aircraft: 'https://api.adsb.lol/v2/icao/' },
  { name: 'ADSB.fi', url: `https://opendata.adsb.fi/api/v3/lat/${center[0]}/lon/${center[1]}/dist/${queryRadius}`, aircraft: 'https://opendata.adsb.fi/api/v2/icao/' }
];

async function readJson(url, allowMissing = false) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error('Source HTTP ' + response.status);
  return response.json();
}

function adsbdb(resource, code) {
  return readJson('https://api.adsbdb.com/v0/' + resource + '/' + code, true);
}

export function normalizePositions(data, updatedAt, localOnly = true) {
  if (!Array.isArray(data?.ac)) throw new Error('Réponse ADS-B invalide');
  const reportedAt = data.now < 1e11 ? data.now * 1000 : data.now;
  if (reportedAt > 1e12 && reportedAt < updatedAt - 60000) return [];
  const publishedAt = Number.isFinite(reportedAt) && reportedAt > 1e12 && reportedAt <= updatedAt + 5000
    ? Math.min(reportedAt, updatedAt) : updatedAt;
  const aircraft = new Map();
  for (const plane of data.ac) {
    if (!plane || !/^~?[0-9a-f]{6}$/i.test(plane.hex) ||
        !Number.isFinite(plane.lat) || !Number.isFinite(plane.lon) ||
        Math.abs(plane.lat) > 90 || Math.abs(plane.lon) > 180) continue;

    const age = plane.seen_pos ?? plane.seen;
    if (!Number.isFinite(age) || age > 60 || age < 0) continue;
    const distance = distanceKm(center, [plane.lat, plane.lon]);
    const ground = plane.alt_baro === 'ground';
    if (localOnly && (distance > radius || ground)) continue;

    const id = plane.hex.toLowerCase();
    const observedAt = publishedAt - age * 1000;
    if (updatedAt - observedAt > 60000) continue;
    if ((aircraft.get(id)?.observedAt ?? -Infinity) >= observedAt) continue;

    const callsign = typeof plane.flight === 'string' ? plane.flight.trim().toUpperCase() : '';
    aircraft.set(id, {
      id, callsign, distance, observedAt, lat: plane.lat, lon: plane.lon, ground,
      altitude: Number.isFinite(plane.alt_baro) ? plane.alt_baro : plane.alt_geom,
      heading: plane.track, speed: plane.gs, registration: plane.r, type: plane.t,
      model: plane.desc, airline: knownAirline(callsign)
    });
  }
  return [...aircraft.values()].sort((a, b) => a.distance - b.distance);
}

let snapshot;
let pending;

export async function positions() {
  if (snapshot && Date.now() - snapshot.updatedAt < 14000) return snapshot;
  pending ??= loadPositions().then(result => {
    if (snapshot && result.updatedAt - snapshot.updatedAt <= 90000) {
      result.previousAircraft = snapshot.aircraft;
    }
    snapshot = result;
    return result;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function loadPositions() {
  for (const feed of feeds) {
    try {
      const data = await readJson(feed.url);
      const updatedAt = Date.now();
      return { aircraft: normalizePositions(data, updatedAt), updatedAt, source: feed.name };
    } catch (error) {
      console.warn(feed.name, error.message);
    }
  }
  throw new Error('Les flux ADS-B sont indisponibles');
}

const routes = new Map();
const airframes = new Map();
const airlines = new Map();
const followedAircraft = new Map();

function cached(cache, key, ttl, load) {
  const entry = cache.get(key);
  if (entry?.until > Date.now()) return entry.result;
  const result = load().catch(error => {
    if (cache.get(key)?.result === result) cache.delete(key);
    throw error;
  });
  if (cache.size >= 500) cache.delete(cache.keys().next().value);
  cache.set(key, { result, until: Date.now() + ttl });
  return result;
}

export function aircraftPosition(hex) {
  return cached(followedAircraft, hex, 12000, async () => {
    let answered = false;
    for (const feed of feeds) {
      try {
        const data = await readJson(feed.aircraft + hex, true);
        const plane = data && normalizePositions(data, Date.now(), false).find(item => item.id === hex);
        if (plane) return { plane, source: feed.name };
        answered = true;
      } catch {
        // Try the other network when this provider is temporarily unavailable.
      }
    }
    if (!answered) throw new Error('Les flux ADS-B sont indisponibles');
    return { plane: null };
  });
}

function fetchAirline(callsign) {
  const code = operatorCode(callsign);
  if (!code) return null;
  return cached(airlines, code, 86400000, async () => {
    const data = await adsbdb('airline', code);
    return data?.response?.find(airline => airline.icao === code) ?? knownAirline(callsign);
  });
}

async function routeByCallsign(callsign) {
  const [routeResult, airlineResult] = await Promise.allSettled([
    cached(routes, callsign, 3600000, async () => {
      const data = await adsbdb('callsign', callsign);
      return data?.response?.flightroute ?? null;
    }),
    fetchAirline(callsign)
  ]);
  const route = routeResult.value;
  const airline = route?.airline?.name ? route.airline : airlineResult.value ?? knownAirline(callsign);
  const airport = data => data && ({
    code: data.iata_code || data.icao_code,
    name: data.municipality || data.name,
    lat: data.latitude,
    lon: data.longitude
  });
  return {
    number: route?.callsign_iata,
    airline: airline && { name: airline.name, iata: airline.iata, icao: airline.icao },
    from: airport(route?.origin), to: airport(route?.destination),
    routeUnavailable: routeResult.status === 'rejected'
  };
}

export async function flightDetails(callsign, hex) {
  const [route, airframe] = await Promise.all([
    callsign ? routeByCallsign(callsign) : null,
    hex ? cached(airframes, hex, 86400000, async () => {
      const data = await adsbdb('aircraft', hex);
      const aircraft = data?.response?.aircraft;
      return aircraft && {
        registration: aircraft.registration, type: aircraft.icao_type,
        model: aircraft.type, owner: aircraft.registered_owner
      };
    }).catch(() => null) : null
  ]);
  return { ...route, airframe };
}

export function reply(response, status, data, sharedSeconds = 0) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': sharedSeconds ? 'public, max-age=0, s-maxage=' + sharedSeconds : 'no-store'
  });
  response.end(JSON.stringify(data));
}
