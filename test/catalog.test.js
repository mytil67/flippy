import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAircraftModels } from '../api/catalog.js';

test('normalise et déduplique le catalogue des modèles par code ICAO', () => {
  const rows = [
    { Designator: 'B738', ModelFullName: '737-800', ManufacturerCode: 'BOEING', AircraftDescription: 'LandPlane', EngineType: 'Jet', EngineCount: '2' },
    { Designator: 'A320', ModelFullName: 'A-320', ManufacturerCode: 'AIRBUS', AircraftDescription: 'LandPlane', EngineType: 'Jet', EngineCount: '2' },
    { Designator: 'B738', ModelFullName: 'doublon', ManufacturerCode: 'AUTRE' },
    { Designator: '', ModelFullName: 'sans code' }
  ];
  assert.deepEqual(normalizeAircraftModels(rows), [
    { code: 'A320', name: 'A-320', manufacturer: 'AIRBUS', category: 'LandPlane', engineType: 'Jet', engineCount: 2 },
    { code: 'B738', name: '737-800', manufacturer: 'BOEING', category: 'LandPlane', engineType: 'Jet', engineCount: 2 }
  ]);
});
