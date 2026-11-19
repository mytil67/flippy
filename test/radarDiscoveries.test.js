import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryIndex, flightDiscoveries } from '../src/radarDiscoveries.js';

const from = { code: 'CDG', lat: 49, lon: 2.55 };
const to = { code: 'HND', lat: 35.55, lon: 139.79 };

test('compare modèles, codes compagnie et liaisons directionnelles avec la collection', () => {
  const index = discoveryIndex({ models: ['A320'], airlines: ['AFR'], iata: ['AF'], routes: ['CDG:HND'] });
  const plane = { type: 'a320', airline: { iata: 'AF' } };
  assert.deepEqual(flightDiscoveries(index, plane, { from, to }), []);
  assert.deepEqual(flightDiscoveries(index, plane, {
    from: to, to: from, airframe: { type: 'A359' }, airline: { icao: 'ANA' }
  }), ['model', 'airline', 'route']);
});

test('n’annonce aucune nouveauté sans collection ni liaison lorsque le trajet est incertain', () => {
  assert.deepEqual(flightDiscoveries(discoveryIndex(null), { type: 'A359' }, { from, to }), []);
  const index = discoveryIndex({});
  assert.deepEqual(flightDiscoveries(index, { type: 'ZZZZ' }, { from, to, unverified: true }), []);
  assert.deepEqual(flightDiscoveries(index, {}, { from, to, routeConflict: true }), []);
  assert.deepEqual(flightDiscoveries(index, {}, { from, to: from }), []);
});
