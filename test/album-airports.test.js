import test from 'node:test';
import assert from 'node:assert/strict';
import { albumAirports } from '../src/albumAirports.js';

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
