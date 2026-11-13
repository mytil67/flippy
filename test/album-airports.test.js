import test from 'node:test';
import assert from 'node:assert/strict';
import { albumAirports, atlasConnection } from '../src/albumAirports.js';

test('trace une liaison sans traverser toute la carte au méridien de 180°', () => {
  const west = { lat: 50, lon: 179 };
  const east = { lat: 52, lon: -179 };
  assert.deepEqual(atlasConnection(west, east), [[[50, 179], [51, 180]], [[51, -180], [52, -179]]]);
  assert.deepEqual(atlasConnection(east, west), [[[52, -179], [51, -180]], [[51, 180], [50, 179]]]);
  assert.deepEqual(atlasConnection({ lat: 50, lon: 180 }, { lat: 52, lon: -180 }), [[[50, 180], [52, 180]]]);
  assert.deepEqual(atlasConnection({ lat: 49, lon: 2 }, { lat: 44, lon: 7 }), [[[49, 2], [44, 7]]]);
});

test('fusionne les aéroports de départ et d’arrivée pour la carte globale', () => {
  const result = albumAirports(
    [{ code: 'LFPG', name: 'Paris Charles de Gaulle', lat: 49.01, lon: 2.55, count: 3 }],
    [{ code: 'LFPG', name: 'Paris Charles de Gaulle', lat: 49.01, lon: 2.55, count: 2 },
      { code: 'TFFR', name: 'Pointe-à-Pitre', lat: 16.27, lon: -61.53, count: 1 }]
  );
  assert.deepEqual(result.map(({ code, departures, arrivals }) => ({ code, departures, arrivals })), [
    { code: 'LFPG', departures: 3, arrivals: 2 },
    { code: 'TFFR', departures: 0, arrivals: 1 }
  ]);
});
