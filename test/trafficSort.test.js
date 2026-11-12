import test from 'node:test';
import assert from 'node:assert/strict';
import { orderTraffic } from '../src/trafficSort.js';

const planes = [
  { id: 'near', distance: 12, altitude: 8000, speed: 210 },
  { id: 'high', distance: 45, altitude: 34000, speed: 430 },
  { id: 'unknown', distance: 30, altitude: null, speed: null },
  { id: 'fast', distance: 60, altitude: 25000, speed: 470 }
];

test('trie le trafic par proximité, altitude ou vitesse sans modifier la source', () => {
  assert.deepEqual(orderTraffic(planes, 'distance').map(plane => plane.id), ['near', 'unknown', 'high', 'fast']);
  assert.deepEqual(orderTraffic(planes, 'altitude').map(plane => plane.id), ['high', 'fast', 'near', 'unknown']);
  assert.deepEqual(orderTraffic(planes, 'speed').map(plane => plane.id), ['fast', 'high', 'near', 'unknown']);
  assert.deepEqual(planes.map(plane => plane.id), ['near', 'high', 'unknown', 'fast']);
});
