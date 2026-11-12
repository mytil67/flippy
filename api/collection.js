import { neon } from '@neondatabase/serverless';
import { flightDetails, positions, reply } from '../lib/adsb.js';
import { collectionAccess, collectionIdentity, setCollector } from '../lib/collectionAccess.js';
import { accountUser } from '../lib/account.js';
import { distanceKm } from '../lib/flight.js';
import { flightTrace } from '../lib/trace.js';
import { reconcileRoute, routeDistance, routeStatus, validateRouteDirection } from '../lib/routeEvidence.js';

const empty = { count: 0, aircraft: 0, measured: 0, kilometers: 0, routeCount: 0, routeKilometers: null, record: null, planes: [], models: [], airlines: [], recent: [] };
let evidenceSchema;

function ensureEvidenceSchema(sql) {
  evidenceSchema ??= sql`ALTER TABLE flippy_captures
    ADD COLUMN IF NOT EXISTS route_status text CHECK (route_status IN ('confirmed', 'probable', 'unverified', 'announced', 'conflict', 'unknown')),
    ADD COLUMN IF NOT EXISTS reported_flight_number text,
    ADD COLUMN IF NOT EXISTS reported_departure_code text,
    ADD COLUMN IF NOT EXISTS reported_arrival_code text,
    ADD COLUMN IF NOT EXISTS captured_lat double precision,
    ADD COLUMN IF NOT EXISTS captured_lon double precision,
    ADD COLUMN IF NOT EXISTS captured_heading real`
    .catch(error => {
      evidenceSchema = undefined;
      throw error;
    });
  return evidenceSchema;
}

async function collection(sql, owner) {
  const [row] = await sql`
    WITH own AS (SELECT * FROM flippy_captures WHERE collector_id = ${owner}),
    planes AS (
      SELECT aircraft AS code, COALESCE(max(registration), upper(aircraft)) AS name, max(model) AS model, max(model_code) AS model_code,
        count(*)::int AS count, sum(observed_km) AS kilometers, sum(route_km) AS route_km
      FROM own GROUP BY aircraft
    ),
    models AS (
      SELECT model_code AS code, COALESCE(max(model), model_code) AS name,
        count(*)::int AS count, sum(observed_km) AS kilometers, sum(route_km) AS route_km
      FROM own WHERE model_code IS NOT NULL GROUP BY model_code
    ),
    airlines AS (
      SELECT airline_code AS code, COALESCE(max(airline), airline_code) AS name, max(airline_iata) AS iata,
        count(*)::int AS count, sum(observed_km) AS kilometers, sum(route_km) AS route_km
      FROM own WHERE airline_code IS NOT NULL GROUP BY airline_code
    ),
    recent AS (
      SELECT aircraft, callsign, captured_at, flight_number, registration, model_code, model,
        airline_code, airline_iata, airline, observed_km, route_km, departure_code, arrival_code,
        route_status, reported_flight_number, reported_departure_code, reported_arrival_code,
        captured_lat, captured_lon, captured_heading
      FROM own ORDER BY captured_at DESC LIMIT 30
    )
    SELECT count(*)::int AS count, count(DISTINCT aircraft)::int AS aircraft,
      count(observed_km)::int AS measured, COALESCE(sum(observed_km), 0) AS kilometers,
      count(route_km)::int AS "routeCount", sum(route_km) AS "routeKilometers",
      (SELECT json_build_object('flight', COALESCE(flight_number, NULLIF(callsign, ''), registration, aircraft),
        'kilometers', route_km) FROM own WHERE route_km IS NOT NULL
        ORDER BY route_km DESC, captured_at DESC LIMIT 1) AS record,
      COALESCE((SELECT json_agg(planes ORDER BY route_km DESC NULLS LAST, kilometers DESC NULLS LAST, count DESC, name) FROM planes), '[]') AS planes,
      COALESCE((SELECT json_agg(models ORDER BY route_km DESC NULLS LAST, kilometers DESC NULLS LAST, count DESC, name) FROM models), '[]') AS models,
      COALESCE((SELECT json_agg(airlines ORDER BY route_km DESC NULLS LAST, kilometers DESC NULLS LAST, count DESC, name) FROM airlines), '[]') AS airlines,
      COALESCE((SELECT json_agg(recent ORDER BY captured_at DESC) FROM recent), '[]') AS recent
    FROM own`;
  return { ...row, kilometers: Number(row.kilometers), routeKilometers: row.routeKilometers === null ? null : Number(row.routeKilometers) };
}

function observedDistance(segments) {
  let total = 0;
  for (const segment of segments) {
    for (let index = 1; index < segment.length; index++) total += distanceKm(segment[index - 1], segment[index]);
  }
  return segments.length ? Math.round(total) : null;
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return reply(response, 405, { error: 'Méthode non autorisée' });
  const connection = process.env.DATABASE_URL;
  if (!connection) return reply(response, 503, { error: 'La collection est temporairement indisponible.' });
  const token = request.headers.cookie?.match(/(?:^|;\s*)flippy_collection=([0-9a-f]{64})(?:;|$)/)?.[1];

  if (request.method === 'POST') {
    const origin = request.headers.origin;
    if (origin !== `https://${request.headers.host}` && (process.env.VERCEL || origin !== `http://${request.headers.host}`)) {
      return reply(response, 403, { error: 'Cette capture doit être lancée depuis FLIPPY.' });
    }
  }
  const { searchParams } = new URL(request.url, 'http://localhost');
  if (request.method === 'GET' && searchParams.has('session')) {
    const site = request.headers['sec-fetch-site'];
    if (site && site !== 'same-origin') return reply(response, 403, { error: 'Ouvre la collection depuis FLIPPY.' });
    setCollector(response, token);
    return reply(response, 200, {});
  }
  const action = request.method === 'POST' && searchParams.get('access');

  try {
    const sql = neon(connection);
    await ensureEvidenceSchema(sql);
    const [identity, account] = await Promise.all([collectionIdentity(sql, token), accountUser(request)]);
    const owner = account ? 'account:' + account.id : identity?.id;
    if (action === 'claim') {
      if (!account) return reply(response, 401, { error: 'Connecte-toi pour rattacher tes captures.' });
      if (identity) await sql`
        WITH moved AS (DELETE FROM flippy_captures WHERE collector_id = ${identity.id} RETURNING *)
        INSERT INTO flippy_captures (collector_id, aircraft, callsign, flight_day, captured_at, flight_number,
          registration, model_code, model, airline_code, airline_iata, airline, observed_km, route_km, departure_code, arrival_code,
          route_status, reported_flight_number, reported_departure_code, reported_arrival_code, captured_lat, captured_lon, captured_heading)
        SELECT ${owner}, aircraft, callsign, flight_day, captured_at, flight_number, registration,
          model_code, model, airline_code, airline_iata, airline, observed_km, route_km, departure_code, arrival_code,
          route_status, reported_flight_number, reported_departure_code, reported_arrival_code, captured_lat, captured_lon, captured_heading FROM moved
        ON CONFLICT (collector_id, aircraft, callsign, flight_day) DO UPDATE SET
          observed_km = greatest(flippy_captures.observed_km, EXCLUDED.observed_km),
          airline_iata = coalesce(flippy_captures.airline_iata, EXCLUDED.airline_iata),
          route_km = coalesce(flippy_captures.route_km, EXCLUDED.route_km),
          departure_code = CASE WHEN flippy_captures.route_km IS NULL THEN EXCLUDED.departure_code ELSE flippy_captures.departure_code END,
          arrival_code = CASE WHEN flippy_captures.route_km IS NULL THEN EXCLUDED.arrival_code ELSE flippy_captures.arrival_code END,
          route_status = CASE WHEN flippy_captures.route_km IS NULL
            THEN coalesce(EXCLUDED.route_status, flippy_captures.route_status) ELSE flippy_captures.route_status END,
          reported_flight_number = coalesce(EXCLUDED.reported_flight_number, flippy_captures.reported_flight_number),
          reported_departure_code = coalesce(EXCLUDED.reported_departure_code, flippy_captures.reported_departure_code),
          reported_arrival_code = coalesce(EXCLUDED.reported_arrival_code, flippy_captures.reported_arrival_code),
          captured_lat = coalesce(EXCLUDED.captured_lat, flippy_captures.captured_lat),
          captured_lon = coalesce(EXCLUDED.captured_lon, flippy_captures.captured_lon),
          captured_heading = coalesce(EXCLUDED.captured_heading, flippy_captures.captured_heading)`;
      return reply(response, 200, { claimed: true });
    }
    if (action) return await collectionAccess(sql, identity, action, request, response);
    if (request.method === 'GET') {
      const [data, local] = await Promise.all([
        owner ? collection(sql, owner) : empty,
        account && identity ? sql`SELECT count(*)::int AS count FROM flippy_captures WHERE collector_id = ${identity.id}` : []
      ]);
      return reply(response, 200, { ...data, account: account ? { email: account.email } : null, localCount: local[0]?.count ?? 0 });
    }
    if (!account) return reply(response, 401, { error: 'Connecte-toi pour ajouter ce vol à ta collection.' });

    const hex = searchParams.get('hex') ?? '';
    const callsign = searchParams.get('vol') ?? '';
    if (!/^[0-9a-f]{6}$/.test(hex) || !/^[A-Z0-9]{0,10}$/.test(callsign)) {
      return reply(response, 400, { error: 'Cet appareil ne peut pas être identifié.' });
    }
    const plane = (await positions()).aircraft.find(item => item.id === hex && item.callsign === callsign);
    if (!plane || Date.now() - plane.observedAt > 65000) {
      return reply(response, 409, { error: 'Cet avion n’est plus visible dans le radar. Sélectionne un avion de passage.' });
    }
    const day = new Date(plane.observedAt).toISOString().slice(0, 10);
    const [duplicate] = await sql`SELECT route_km FROM flippy_captures WHERE collector_id = ${owner}
      AND aircraft = ${hex} AND callsign = ${callsign} AND flight_day = ${day}`;
    const [details, trace] = await Promise.all([
      flightDetails(callsign, hex).catch(() => null),
      flightTrace(hex, { at: plane.observedAt, lat: plane.lat, lon: plane.lon }, callsign).catch(() => null)
    ]);
    const modelCode = details?.airframe?.type || plane.type || null;
    const airline = details?.airline || plane.airline;
    const route = validateRouteDirection(reconcileRoute(details, trace?.departure), plane, trace?.segments);
    const routeKm = routeDistance(route);
    const status = routeStatus(route);
    const departureCode = routeKm === null ? null : route.from.code ?? null;
    const arrivalCode = routeKm === null ? null : route.to.code ?? null;
    const captured = duplicate ? [] : await sql`INSERT INTO flippy_captures
      (collector_id, aircraft, callsign, flight_day, flight_number, registration, model_code, model, airline_code, airline_iata, airline,
        observed_km, route_km, departure_code, arrival_code, route_status, reported_flight_number,
        reported_departure_code, reported_arrival_code, captured_lat, captured_lon, captured_heading)
      VALUES (${owner}, ${hex}, ${callsign}, ${day}, ${route?.unverified || route?.routeConflict ? null : route?.number ?? null}, ${plane.registration || details?.airframe?.registration || null},
        ${modelCode}, ${details?.airframe?.model || plane.model || null}, ${airline?.icao || airline?.iata || null}, ${airline?.iata || null}, ${airline?.name || null},
        ${observedDistance(trace?.segments ?? [])}, ${routeKm}, ${departureCode}, ${arrivalCode}, ${status}, ${details?.number ?? null},
        ${details?.from?.code ?? null}, ${details?.to?.code ?? null}, ${plane.lat}, ${plane.lon}, ${Number.isFinite(plane.heading) ? plane.heading : null})
      ON CONFLICT DO NOTHING RETURNING 1`;
    if (!captured.length) await sql`UPDATE flippy_captures SET
      flight_number = CASE WHEN route_km IS NULL AND ${routeKm}::integer IS NOT NULL THEN ${route?.number ?? null} ELSE flight_number END,
      route_km = coalesce(route_km, ${routeKm}),
      departure_code = CASE WHEN route_km IS NULL THEN ${departureCode} ELSE departure_code END,
      arrival_code = CASE WHEN route_km IS NULL THEN ${arrivalCode} ELSE arrival_code END,
      route_status = ${status}, reported_flight_number = ${details?.number ?? null},
      reported_departure_code = ${details?.from?.code ?? null}, reported_arrival_code = ${details?.to?.code ?? null},
      captured_lat = ${plane.lat}, captured_lon = ${plane.lon}, captured_heading = ${Number.isFinite(plane.heading) ? plane.heading : null}
      WHERE collector_id = ${owner} AND aircraft = ${hex} AND callsign = ${callsign}
        AND flight_day = ${day}`;
    reply(response, captured.length ? 201 : 200, { already: !captured.length });
  } catch (error) {
    console.warn('Collection FLIPPY indisponible', error.code ?? error.name);
    reply(response, 503, { error: 'La collection est temporairement indisponible. Réessaie dans un instant.' });
  }
}
