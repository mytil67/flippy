import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionProgress } from '../src/collectionProgress.js';

test('compte une compagnie une seule fois et distingue les captures hors référentiel', () => {
  const data = {
    airlines: [{ code: 'AFR' }, { code: ' af ' }, { code: ' anA ' }, { code: 'Q?' }],
    models: [{ code: 'A320' }, { code: 'A359' }, { code: 'TEST' }]
  };
  const result = collectionProgress(data, {
    modelManufacturers: { A320: 'AIRBUS', A359: 'AIRBUS', B738: 'BOEING' }, manufacturerTotal: 2
  });
  assert.equal(result.airlines.found, 2);
  assert.equal(result.airlines.outside, 1);
  assert.deepEqual(result.models, { found: 2, total: 3, outside: 1 });
  assert.deepEqual(result.manufacturers, { found: 1, total: 2 });
  assert.deepEqual(collectionProgress(data).models, { found: 3 });
});
