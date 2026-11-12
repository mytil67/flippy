import test from 'node:test';
import assert from 'node:assert/strict';
import { airportByCode } from '../lib/airportLookup.js';

test('retrouve les coordonnées et le nom d’un aéroport par son code IATA', () => {
  assert.deepEqual(airportByCode('cdg'), {
    code: 'CDG', name: "Paris (Roissy-en-France, Val-d'Oise)", lat: 49.00896, lon: 2.55412
  });
  assert.equal(airportByCode('ZZZ'), undefined);
});
