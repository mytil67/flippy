import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFlightTrace, extractOpenSkyTrace, flightTrace } from '../lib/trace.js';
import { reconcileRoute, resolveFlightRoute, routeDistance, routeStatus, validateRouteDirection } from '../lib/routeEvidence.js';

test('RYR4801 retrouve Ancône avec une seule liaison historique et un départ corroboré', () => {
  const from = { code: 'CRL', lat: 50.46196, lon: 4.45956 };
  const to = { code: 'AOI', lat: 43.6163, lon: 13.3623 };
  const details = {
    from: { code: 'CAG', lat: 39.2515, lon: 9.05428 },
    to: { code: 'CIA', lat: 41.7994, lon: 12.5949 },
    historicalRoutes: [{ from, to, day: '2026-11-09' }]
  };
  const departure = { airport: from, lat: 50.454479, lon: 4.434988, inferred: true };
  const plane = { id: '4ca4f0', lat: 48.96234, lon: 8.45145, heading: 122.51, speed: 483.8, observedAt: 1794551551715 };
  const route = resolveFlightRoute(details, departure, plane);
  assert.equal(route.to.code, 'AOI');
  assert.equal(routeStatus(route), 'probable');
  assert.equal(resolveFlightRoute(details, departure, { ...plane, heading: 300 }).to, undefined);
  const ambiguous = { ...details, historicalRoutes: [...details.historicalRoutes, { from, to: { ...to, code: 'PSR' }, day: '2026-11-10' }] };
  assert.equal(resolveFlightRoute(ambiguous, departure, plane).to, undefined);
});

test('UAL108 retrouve Munich grâce à une liaison récurrente compatible avec sa trace', () => {
  const plane = { id: 'a2a2e6', lat: 47.825, lon: 7.772, heading: 106.71, speed: 493.9, observedAt: Date.parse('2026-11-13T06:23Z') };
  const from = { code: 'IAD', lat: 38.9445, lon: -77.4558 };
  const to = { code: 'MUC', lat: 48.3538, lon: 11.7861 };
  const details = {
    number: 'UA108', from: { code: 'EWR', lat: 40.6925, lon: -74.1687 }, to: { code: 'EDI', lat: 55.95, lon: -3.372 },
    historicalRoutes: [{ from, to, day: '2026-11-10' }, { from, to, day: '2026-11-11' }]
  };
  const route = resolveFlightRoute(details, undefined, plane);
  assert.equal(route.to.code, 'MUC');
  assert.equal(route.historicalRoute, true);
  assert.equal(route.unverified, true);
  assert.equal(routeDistance(route), null);
  assert.equal(resolveFlightRoute({ ...details, historicalRoutes: details.historicalRoutes.slice(0, 1) }, undefined, plane).to, undefined);
  assert.equal(resolveFlightRoute(details, { lat: 40.6925, lon: -74.1687, airport: details.from }, plane).to, undefined);
});

test('la distance du trajet couvre les deux aéroports et reste inconnue en cas de conflit', () => {
  const route = { from: { lat: 49.01, lon: 2.55 }, to: { lat: 43.66, lon: 7.22 } };
  assert.equal(routeDistance(route), 694);
  assert.equal(routeDistance({ ...route, unverified: true }), null);
  assert.equal(routeDistance({ ...route, routeConflict: true }), null);
  assert.equal(routeDistance({ ...route, to: { lat: 92, lon: 7.22 } }), null);
  assert.equal(routeDistance({ from: route.from }), null);
});

test('qualifie la preuve associée au trajet sans confondre annonce et confirmation', () => {
  assert.equal(routeStatus({ from: {}, to: {}, observedDeparture: true }), 'confirmed');
  assert.equal(routeStatus({ from: {}, to: {}, probableDeparture: true }), 'probable');
  assert.equal(routeStatus({ from: {}, to: {}, unverified: true }), 'unverified');
  assert.equal(routeStatus({ from: {}, to: {} }), 'announced');
  assert.equal(routeStatus({ routeConflict: true }), 'conflict');
  assert.equal(routeStatus(null), 'unknown');
});

const extractTrace = (...args) => extractFlightTrace(...args).segments;
import { buildTraceGeometry, nearLongitude } from '../src/traceGeometry.js';
import { appendLiveSample, isFollowPosition, liveTrailSegments, radarTrace, recordRadarHistory } from '../src/liveTrail.js';
import { flightDetails, normalizePositions } from '../lib/adsb.js';
import { flightDurationLabel } from '../src/flightDuration.js';
import { airportByCode } from '../lib/airportLookup.js';

const sample = (seconds, lon, extra) => ({ at: seconds * 1000, lat: 48.5, lon, ...extra });

test('RYR11LC retrouve la rotation hebdomadaire de Dublin à Venise', async context => {
  const previous = process.env.FLYITALYADSB_API_KEY;
  process.env.FLYITALYADSB_API_KEY = 'test-route-history';
  context.after(() => {
    if (previous === undefined) delete process.env.FLYITALYADSB_API_KEY;
    else process.env.FLYITALYADSB_API_KEY = previous;
  });
  const provider = context.mock.method(globalThis, 'fetch', async url => {
    if (url !== 'https://api.flyitalyadsb.com/v2/flights/callsign/RYR11LC?days=7') return Response.json({ response: {} });
    return Response.json({ flights: [{
      callsign: 'RYR11LC', icao: '4CA893', from: { iata: 'DUB' }, to: { iata: 'VCE' }, day: '2026-11-06'
    }] });
  });
  const from = airportByCode('DUB');
  const departure = { ...from, airport: from };
  const plane = {
    id: '4d2234', callsign: 'RYR11LC', observedAt: 1794554156630,
    lat: 48.665523, lon: 8.735793, heading: 139.16, speed: 477.1
  };
  const details = {
    ...await flightDetails(plane.callsign, plane.id),
    number: 'FR11LC', from: airportByCode('MAN'), to: airportByCode('MXP')
  };
  assert.ok(provider.mock.calls.some(call => call.arguments[0].endsWith('?days=7')));
  const route = resolveFlightRoute(details, departure, plane);
  assert.equal(route.from.code, 'DUB');
  assert.equal(route.to.code, 'VCE');
  assert.equal(route.number, undefined);
  assert.equal(routeStatus(route), 'probable');
  assert.ok(buildTraceGeometry({ plane }, route).to);
  assert.equal(resolveFlightRoute(details, departure, { ...plane, heading: 300 }).to, undefined);
});

test('une rotation observée prime sur la route générique du même indicatif', () => {
  const plane = { id: '4d2234', lat: 48.665523, lon: 8.735793, observedAt: 1794554156630 };
  const item = {
    aircraft: plane.id, firstSeen: 1794549098, lastSeen: 1794558000,
    day: '2026-11-13', from: airportByCode('DUB'), to: airportByCode('VCE')
  };
  const details = { from: item.from, to: airportByCode('MXP'), historicalRoutes: [item] };
  assert.equal(resolveFlightRoute(details, null, plane).to.code, 'VCE');
  assert.equal(resolveFlightRoute(details, null, { ...plane, id: '4ca893' }).to.code, 'MXP');
  const conflicting = { ...details, historicalRoutes: [item, { ...item, to: airportByCode('MXP') }] };
  assert.equal(resolveFlightRoute(conflicting, null, plane).to, undefined);
});

test('DAL8861 retrouve Munich uniquement pour la rotation du N516DN', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ response: {} }));
  const plane = {
    id: 'a67811', callsign: 'DAL8861', observedAt: 1794553873950,
    lat: 47.888397, lon: 7.300621, heading: 104.14, speed: 523.9
  };
  const details = {
    ...await flightDetails(plane.callsign, plane.id),
    from: { code: 'EWR', lat: 40.6925, lon: -74.1687 },
    to: { code: 'CVG', lat: 39.0488, lon: -84.6678 }
  };
  const route = resolveFlightRoute(details, null, plane);
  assert.equal(route.from.code, 'DTW');
  assert.equal(route.to.code, 'MUC');
  assert.equal(routeStatus(route), 'announced');
  assert.ok(buildTraceGeometry({ plane }, route).to);
  assert.equal(resolveFlightRoute(details, null, { ...plane, id: 'a4b827' }).to, undefined);
  assert.equal(resolveFlightRoute(details, null, { ...plane, observedAt: details.scheduledRoute.end }).to, undefined);
  assert.equal(resolveFlightRoute(details, { ...details.from, airport: details.from }, plane).to, undefined);
});

test('la source configurée renvoie une trace dès le clic, sans position locale antérieure', async context => {
  const key = 'test-flight-history-key';
  const previous = process.env.FLYITALYADSB_API_KEY;
  process.env.FLYITALYADSB_API_KEY = key;
  context.after(() => {
    if (previous === undefined) delete process.env.FLYITALYADSB_API_KEY;
    else process.env.FLYITALYADSB_API_KEY = previous;
  });
  const at = Date.parse('2026-11-11T12:00:00Z');
  const provider = context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.flyitalyadsb.com/v2/history/123abc/2026-11-11');
    assert.equal(options.headers['X-Api-Key'], key);
    return Response.json({ icao: '123abc', timestamp: at / 1000 - 40, trace: [
      [0, 48.6, 7.45, 5000, 200, 90, 0, null, { flight: 'AFR198 ' }],
      [20, 48.6, 7.49, 5000, 200, 90, 0]
    ] });
  });
  const result = await flightTrace('123abc', { at, lat: 48.6, lon: 7.53 }, 'AFR198');
  assert.equal(provider.mock.callCount(), 1);
  assert.equal(result.source, 'FlyItalyADSB');
  assert.deepEqual(result.segments, [[[48.6, 7.45], [48.6, 7.49], [48.6, 7.53]]]);
});

test('ignore un point aberrant sans couper les observations cohérentes', () => {
  const start = sample(0, 7, { flags: 2 });
  const middle = sample(10, 7.025);
  const spike = sample(15, 7.5);
  const last = sample(20, 7.05);
  const click = sample(30, 7.075);
  assert.deepEqual(extractTrace([start, middle, spike, last], click, 'AFR198'), [[start, middle, last, click]]);
});

test('conserve les coupures signalées et ne relie pas une position isolée après une longue absence', () => {
  const start = sample(0, 7);
  const before = sample(10, 7.02);
  const after = sample(32, 7.06, { flags: 1 });
  const last = sample(45, 7.09);
  const click = sample(180, 7.3);
  assert.deepEqual(extractTrace([start, before, after, last], click, 'AFR198'), [[start, before], [after, last]]);
});

test('écarte une dernière mesure incohérente et isole le vol courant', () => {
  const previousFlight = sample(0, 6.9, { callsign: 'AFR999' });
  const start = sample(20, 7, { flags: 2 });
  const last = sample(30, 7.02);
  const spike = sample(35, 9);
  const click = sample(40, 7.04);
  assert.deepEqual(extractTrace([previousFlight, start, last, spike], click, 'AFR198'), [[start, last, click]]);
});

test('le début de couverture reste distinct du départ et la trace traverse le méridien sans retour artificiel', () => {
  const focus = { plane: { lat: 50, lon: 179 } };
  const route = { from: { lat: 45, lon: -130 }, to: { lat: 49, lon: -179 } };
  const geometry = buildTraceGeometry(focus, route, [[[50, -177], [50, -179], [50, 179]]]);
  assert.deepEqual(geometry.tracks, [[[50, 183], [50, 181], [50, 179]]]);
  assert.deepEqual(geometry.startOfCoverage, [50, 183]);
  assert.deepEqual(geometry.guides, [[[50, 179], [49, 181]]]);
  assert.equal(geometry.partial, true);
  assert.equal(nearLongitude(-178, geometry.tracks[0][0][1]), 182);
});

test('le suivi conserve le dernier point et sépare les positions reçues après une coupure', () => {
  const samples = [
    { lat: 48.6, lon: 7.5, observedAt: 1000 },
    { lat: 48.6, lon: 7.54, observedAt: 16000 },
    { lat: 48.6, lon: 7.9, observedAt: 121000 },
    { lat: 48.6, lon: 7.94, observedAt: 136000 }
  ].reduce(appendLiveSample, []);
  assert.equal(appendLiveSample(samples, null), samples);
  assert.equal(appendLiveSample(samples, samples[1]), samples);
  assert.deepEqual(liveTrailSegments(samples), [
    [[48.6, 7.5], [48.6, 7.54]], [[48.6, 7.9], [48.6, 7.94]]
  ]);
});


test('RYR74TN observé au sol à Stansted invalide le trajet Vienne–Málaga', () => {
  const ground = { at: 10000, lat: 51.881049, lon: 0.228863, ground: true, callsign: 'RYR74TN' };
  const first = { at: 39000, lat: 51.892319, lon: 0.245708, flags: 1 };
  const click = { at: 49000, lat: 51.898, lon: 0.252 };
  const trace = extractFlightTrace([ground, first], click, 'RYR74TN');
  assert.equal(trace.departure.airport.code, 'STN');
  assert.equal(trace.departure.takeoffAt, first.at);
  const announced = {
    from: { code: 'VIE', name: 'Vienne', lat: 48.1103, lon: 16.5697 },
    to: { code: 'AGP', name: 'Málaga', lat: 36.6749, lon: -4.49911 }
  };
  const route = reconcileRoute(announced, trace.departure);
  assert.equal(route.from.code, 'STN');
  assert.equal(route.to, undefined);
  assert.equal(route.routeConflict, true);
  assert.equal(buildTraceGeometry({ plane: click }, route, trace.segments.map(part => part.map(p => [p.lat, p.lon]))).guides.some(line => line.at(-1)[1] < 0), false);
  assert.equal(reconcileRoute(announced, undefined, true).to, undefined);
});

test('le résumé distingue le temps depuis le décollage du temps couvert par la trace', () => {
  assert.equal(flightDurationLabel(4500000, 60000, 90000), 'En vol depuis environ 1 h 14 min');
  assert.equal(flightDurationLabel(4500000, undefined, 90000), 'En vol depuis au moins 1 h 13 min');
  assert.equal(flightDurationLabel(4500000, undefined, undefined), null);
});

test('un départ annoncé compatible conserve la destination annoncée', () => {
  const from = { code: 'STN', lat: 51.885, lon: 0.235 };
  const to = { code: 'FKB', lat: 48.7794, lon: 8.0805 };
  const departure = { lat: 51.881, lon: 0.228, airport: from };
  assert.deepEqual(reconcileRoute({ from, to }, departure), { from, to, observedDeparture: true });
});

test('sans observation au sol, les aéroports annoncés restent dans le billet', () => {
  const announced = { from: { code: 'VIE', lat: 48.11, lon: 16.57 }, to: { code: 'AGP', lat: 36.67, lon: -4.5 } };
  const route = reconcileRoute(announced);
  const geometry = buildTraceGeometry({ plane: { lat: 48.67, lon: 7.98 } }, route, [[[51.88, 0.23], [48.67, 7.98]]]);
  assert.equal(route.from.code, 'VIE');
  assert.equal(route.unverified, true);
  assert.equal(geometry.from, null);
  assert.equal(geometry.to, null);
  assert.deepEqual(geometry.guides, []);
});

test('un trajet annoncé vers l’ouest est écarté quand le vol file clairement vers l’est', () => {
  const announced = reconcileRoute({
    number: 'AF328V',
    from: { code: 'CDG', name: 'Paris', lat: 49.01, lon: 2.55 },
    to: { code: 'PTP', name: 'Pointe-à-Pitre', lat: 16.27, lon: -61.53 }
  });
  const plane = { lat: 48.61, lon: 7.75, heading: 88, speed: 430 };
  const route = validateRouteDirection(announced, plane);
  assert.equal(route.directionConflict, true);
  assert.equal(route.reportedDestination, 'Pointe-à-Pitre');
  assert.equal(route.to, undefined);
  assert.equal(route.number, undefined);
  assert.equal(routeDistance(route), null);
});

test('une route cohérente et un virage temporaire près du départ ne sont pas rejetés', () => {
  const route = { from: { code: 'CDG', lat: 49.01, lon: 2.55 }, to: { code: 'YOW', lat: 45.32, lon: -75.67 } };
  assert.equal(validateRouteDirection(route, { lat: 49, lon: 2, heading: 90, speed: 220 }), route);
  assert.equal(validateRouteDirection(route, { lat: 48.6, lon: 7.75, heading: 260, speed: 430 }), route);
});

test('le suivi refuse une nouvelle rotation ou un saut incompatible après la sortie du radar', () => {
  const selected = { id: '4cadff', callsign: 'RYR74TN', registration: 'EI-IHT', lat: 48.6, lon: 7.75, observedAt: 1000 };
  const remote = { ...selected, lat: 49.65, observedAt: 600000 };
  assert.equal(isFollowPosition(selected, null, remote), true);
  assert.equal(isFollowPosition(selected, null, { ...remote, callsign: 'RYR22' }), false);
  assert.equal(isFollowPosition(selected, null, { ...remote, callsign: '' }), false);
  assert.equal(isFollowPosition(selected, null, { ...remote, observedAt: 3000 }), false);
  assert.equal(isFollowPosition(selected, { ...selected, ground: true }, remote), false);
});

test('la recherche ciblée conserve un avion hors rayon ou au sol, avec l’heure de la source', () => {
  const now = 1794328891248;
  const plane = { hex: '4cadff', flight: 'RYR74TN', lat: 49.65, lon: 7.75, alt_baro: 'ground', seen_pos: 3 };
  const data = { ac: [plane], now: now - 5000 };
  assert.deepEqual(normalizePositions(data, now), []);
  const [target] = normalizePositions(data, now, false);
  assert.equal(target.ground, true);
  assert.equal(target.observedAt, now - 8000);
  assert.ok(target.distance > 100);
  assert.deepEqual(normalizePositions({ ...data, now: now - 61000 }, now, false), []);
});


test('ASL36B en montée près de CDG écarte Bruxelles–Belgrade sans prétendre avoir vu le décollage', () => {
  const groundPreviousFlight = { at: 0, lat: 49.020787, lon: 2.556959, ground: true, callsign: 'ASL10C' };
  const first = { at: 4826000, lat: 49.023743, lon: 2.56444, altitude: 1300, speed: 147.8, flags: 3 };
  const climbed = { at: 4886000, lat: 49.04, lon: 2.66, altitude: 3700, speed: 200, callsign: 'ASL36B' };
  const click = { at: 4896000, lat: 49.04, lon: 2.69 };
  const trace = extractFlightTrace([groundPreviousFlight, first, climbed], click, 'ASL36B');
  assert.equal(trace.departure?.airport.code, 'CDG');
  assert.equal(trace.departure.inferred, true);
  assert.equal(trace.departure.takeoffAt, undefined);
  const route = reconcileRoute({
    from: { code: 'BRU', lat: 50.9014, lon: 4.48444 },
    to: { code: 'BEG', lat: 44.8184, lon: 20.3091 }
  }, trace.departure);
  assert.equal(route.from.code, 'CDG');
  assert.equal(route.to, undefined);
  assert.equal(route.probableDeparture, true);
  assert.equal(route.observedDeparture, undefined);
  assert.equal(extractFlightTrace([{ ...first, flags: 0 }, climbed], click, 'ASL36B').departure, undefined);
  assert.equal(extractFlightTrace([first, { ...climbed, altitude: 900 }], click, 'ASL36B').departure, undefined);
});

test('le radar reconstruit une trace horodatée sans mélanger les rotations', () => {
  const p = (observedAt, lon, callsign = 'AFR198') => ({ id: '123abc', observedAt, lat: 48.6, lon, callsign });
  const first = p(10000, 7.5);
  const clicked = p(25000, 7.54);
  const later = p(40000, 7.58);
  let history = new Map();
  for (const point of [first, clicked, later]) history = recordRadarHistory(history, [point], point.observedAt);
  assert.deepEqual(radarTrace(history.get(first.id), clicked), {
    segments: [[[48.6, 7.5], [48.6, 7.54], [48.6, 7.58]]],
    timestamps: [[10000, 25000, 40000]]
  });
  assert.deepEqual(radarTrace([clicked], clicked, later), {
    segments: [[[48.6, 7.54], [48.6, 7.58]]],
    timestamps: [[25000, 40000]]
  });
  history = recordRadarHistory(history, [p(55000, 7.61, 'AFR222')], 55000);
  assert.equal(radarTrace(history.get(first.id), clicked), null);
});

test('OpenSky doit correspondre à l’appareil, à l’indicatif et au moment du clic', () => {
  const clicked = { at: 55000, lat: 48.6, lon: 7.58 };
  const data = { icao24: '123abc', callsign: 'AFR198 ', path: [[10, 48.6, 7.5, 1000, 90, false], [35, 48.6, 7.54, 1200, 90, false]] };
  const result = extractOpenSkyTrace(data, '123abc', clicked, 'AFR198');
  assert.deepEqual(result.segments[0].map(point => point.at), [10000, 35000, 55000]);
  assert.equal(extractOpenSkyTrace(data, '123abd', clicked, 'AFR198'), null);
  assert.equal(extractOpenSkyTrace(data, '123abc', clicked, 'AFR199'), null);
  assert.equal(extractOpenSkyTrace(data, '123abc', { ...clicked, at: 400000 }, 'AFR198'), null);
});
