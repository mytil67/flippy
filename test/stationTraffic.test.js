import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSpotlight, spotlightKey, upcomingPassages } from '../src/stationTraffic.js';
import { center, distanceKm } from '../lib/flight.js';

test('le tableau ordonne les rapprochements et écarte les relevés périmés et les avions qui s’éloignent', () => {
  const [lat, lon] = center;
  const now = 1000000;
  const northbound = { lat: lat - .5, lon, speed: 360, heading: 0, observedAt: now };
  const close = { ...northbound, lat: lat - .2 };
  const stale = { ...close, observedAt: now - 61000 };
  const [first, second, ...rest] = upcomingPassages([northbound, stale, close, { ...close, heading: 180 }], now);
  assert.equal(first.plane, close);
  assert.equal(second.plane, northbound);
  assert.ok(first.seconds > 110 && first.seconds < 130);
  assert.ok(first.closestKm < .001);
  assert.ok(distanceKm(first.point, center) < .001);
  assert.equal(rest.length, 0);
  assert.deepEqual(upcomingPassages([{ ...close, lat: lat - .01, observedAt: now - 30000 }], now), []);
});

test('le point sur la carte correspond à la distance du passage estimé', () => {
  const [lat, lon] = center;
  const now = 1000000;
  const plane = { lat: lat - .3, lon: lon - .4, speed: 360, heading: 90, observedAt: now };
  const [passage] = upcomingPassages([plane], now);
  assert.ok(passage.point[1] > plane.lon);
  assert.ok(Math.abs(distanceKm(passage.point, center) - passage.closestKm) < .001);
  assert.ok(Math.abs(distanceKm([plane.lat, plane.lon], passage.point) - passage.seconds * plane.speed * 1.852 / 3600) < .001);
});

test('la station présente les passages inédits et le geste saute le billet courant', () => {
  const now = 1000000;
  const current = { id: 'abc123', callsign: 'AFR100', observedAt: now };
  const recent = { id: 'def456', callsign: 'DLH200', observedAt: now - 120000 };
  const expired = { id: 'ghi789', callsign: 'EZY300', observedAt: now - 660000 };
  const history = new Map([[recent.id, [recent]], [expired.id, [expired]]]);
  const seen = new Map([[spotlightKey(current), now - 10000]]);
  assert.equal(nextSpotlight([current], history, seen, 'live', now), recent);
  seen.set(spotlightKey(recent), now);
  assert.equal(nextSpotlight([current], history, seen, 'live', now, current), recent);
  assert.equal(nextSpotlight([], history, seen, 'live', now + 600000), undefined);
});
