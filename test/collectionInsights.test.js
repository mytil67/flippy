import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionInsights, routeEvidenceGroup, routeReliability } from '../src/collectionInsights.js';

test('résume les compagnies, routes, aéroports et moments des captures récentes', () => {
  const recent = [
    ['2026-11-12T06:00:00Z', 'CDG', 'NCE'],
    ['2026-11-12T07:00:00Z', 'CDG', 'NCE'],
    ['2026-11-12T12:00:00Z', 'FRA', 'SXB'],
    ['2026-11-12T19:00:00Z', 'CDG', 'SXB'],
    ['2026-11-12T23:00:00Z', null, null]
  ].map(([captured_at, departure_code, arrival_code]) => ({ captured_at, departure_code, arrival_code }));
  const insights = collectionInsights({ count: 10, routeCount: 8, recent, airlines: [
    { name: 'Lufthansa', count: 2 }, { name: 'Air France', count: 5 }
  ] });

  assert.equal(insights.topAirline.name, 'Air France');
  assert.deepEqual(insights.routes[0], { label: 'CDG → NCE', count: 2 });
  assert.deepEqual(insights.topOrigin, { label: 'CDG', count: 3 });
  assert.deepEqual(insights.topDestination, { label: 'NCE', count: 2 });
  assert.deepEqual(insights.periods.map(period => period.count), [1, 2, 1, 1]);
  assert.equal(insights.peakPeriod.label, 'Matin');
  assert.equal(insights.routeCoverage, 80);
});

test('regroupe et compte les niveaux de preuve des trajets', () => {
  const items = ['confirmed', 'confirmed', 'probable', 'unverified', 'announced', 'conflict', null]
    .map(route_status => ({ route_status }));
  assert.equal(routeEvidenceGroup('announced'), 'unverified');
  assert.equal(routeEvidenceGroup('unexpected'), 'unknown');
  assert.deepEqual(routeReliability(items), [
    { key: 'confirmed', count: 2 },
    { key: 'probable', count: 1 },
    { key: 'unverified', count: 2 },
    { key: 'conflict', count: 1 },
    { key: 'unknown', count: 1 }
  ]);
});
