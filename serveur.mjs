import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./radar.html', import.meta.url));
const center = { lat: 48.60749, lon: 7.74931 };
const radius = 100;
const queryRadius = Math.ceil(radius / 1.852);
const routes = new Map();
const airlines = new Map();
let snapshot;
let pending;

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return response.json();
}

function adsbdb(resource, code) {
  return json(`https://api.adsbdb.com/v0/${resource}/${code}`).catch(error => {
    if (error.message === 'Source HTTP 404') return null;
    throw error;
  });
}

function airlineByCallsign(callsign) {
  // Les indicatifs radio des compagnies commencent par leur code OACI.
  const code = callsign.match(/^([A-Z]{3})\d/)?.[1];
  if (!code) return null;
  const cached = airlines.get(code);
  if (cached && cached.until > Date.now()) return cached.result;
  const result = adsbdb('airline', code).then(data =>
    data?.response?.find(airline => airline.icao === code) ?? null
  ).catch(error => {
    airlines.delete(code);
    throw error;
  });
  if (airlines.size >= 200) airlines.delete(airlines.keys().next().value);
  airlines.set(code, { result, until: Date.now() + 86400000 });
  return result;
}

async function positions() {
  const data = await json(`https://api.adsb.lol/v2/point/${center.lat}/${center.lon}/${queryRadius}`);
  if (!Array.isArray(data.ac)) throw new Error('Réponse ADS-B invalide');
  const aircraft = data.ac.flatMap(plane => {
    if (!Number.isFinite(plane.lat) || !Number.isFinite(plane.lon) || plane.seen_pos > 60) return [];
    if (plane.alt_baro === 'ground') return [];
    const east = (plane.lon - center.lon) * 111.2 * Math.cos(center.lat * Math.PI / 180);
    const north = (plane.lat - center.lat) * 111.2;
    const distance = Math.hypot(east, north);
    if (distance > radius) return [];
    return [{
      id: plane.hex, callsign: plane.flight?.trim() || '', east, north, distance,
      altitude: plane.alt_baro ?? plane.alt_geom, heading: plane.track,
      lat: plane.lat, lon: plane.lon, speed: plane.gs,
      observedAt: Date.now() - (Number.isFinite(plane.seen_pos) ? plane.seen_pos * 1000 : 0)
    }];
  }).sort((a, b) => a.distance - b.distance);
  return { aircraft, updatedAt: Date.now() };
}

async function flightRoute(callsign) {
  const cached = routes.get(callsign);
  if (cached && cached.until > Date.now()) return cached.result;
  const result = adsbdb('callsign', callsign).then(async data => {
    const route = data?.response?.flightroute;
    const airline = route?.airline?.name ? route.airline : await Promise.resolve(airlineByCallsign(callsign)).catch(error => {
      if (route) return null;
      throw error;
    });
    if (!route && !airline) return null;
    return {
      number: route?.callsign_iata,
      company: airline?.name,
      airlineCodes: [airline?.iata, airline?.icao].filter(Boolean),
      from: route?.origin?.iata_code || route?.origin?.icao_code,
      to: route?.destination?.iata_code || route?.destination?.icao_code,
      fromName: route?.origin?.municipality || route?.origin?.name,
      toName: route?.destination?.municipality || route?.destination?.name,
      toLat: route?.destination?.latitude,
      toLon: route?.destination?.longitude
    };
  }).catch(error => {
    routes.delete(callsign);
    throw error;
  });
  if (routes.size >= 500) routes.delete(routes.keys().next().value);
  routes.set(callsign, { result, until: Date.now() + 3600000 });
  return result;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const reply = (status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  try {
    if (url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page);
    } else if (url.pathname === '/vols') {
      if (!snapshot || Date.now() - snapshot.updatedAt >= 14000) {
        pending ??= positions().then(result => { snapshot = result; }).finally(() => { pending = undefined; });
        await pending;
      }
      reply(200, snapshot);
    } else if (url.pathname === '/trajet') {
      const callsign = url.searchParams.get('vol') ?? '';
      if (!/^[A-Z0-9]{2,10}$/.test(callsign)) return reply(400, null);
      reply(200, await flightRoute(callsign));
    } else {
      reply(404, null);
    }
  } catch (error) {
    console.error(url.pathname, error.cause?.message ?? error.message);
    reply(502, { error: 'Source de données indisponible' });
  }
});

const host = '127.0.0.1';
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && error.port === 8765) {
    server.listen(0, host);
    return;
  }
  console.error('Impossible de démarrer le radar : ' + error.message);
  process.exitCode = 1;
});
server.on('listening', () => {
  const address = 'http://' + host + ':' + server.address().port;
  console.log('Radar Schiltigheim — ' + address);
  if (process.argv.includes('--ouvrir') && process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', address], { windowsHide: true });
  }
});
server.listen(8765, host);
