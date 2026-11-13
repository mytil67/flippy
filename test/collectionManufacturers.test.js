import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionManufacturers } from '../src/collectionManufacturers.js';

test('regroupe les captures historiques par constructeur et conserve les distances inconnues', () => {
  const models = [
    { code: 'A20N', name: 'A320neo', count: 2, route_km: '1300' },
    { code: 'A359', name: 'Airbus A350-900', count: 1, route_km: null },
    { code: 'B38M', name: '737 MAX', count: 1, route_km: 900 },
    { code: 'DH8D', name: 'Dash 8', count: 1, route_km: null },
    { code: 'ZZZZ', name: 'Appareil inconnu', count: 1, route_km: null }
  ];
  const groups = collectionManufacturers(models);
  assert.deepEqual(groups[0], { code: 'Airbus', name: 'Airbus', models: models.slice(0, 2), count: 3, route_km: 1300 });
  assert.equal(groups.find(group => group.code === 'Boeing').route_km, 900);
  assert.equal(groups.find(group => group.code === 'De Havilland Canada').route_km, null);
  assert.equal(groups.find(group => group.code === 'Constructeur non identifié').count, 1);
});
