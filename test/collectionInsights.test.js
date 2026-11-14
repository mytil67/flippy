import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionInsights, routeEvidenceGroup, routeReliability } from '../src/collectionInsights.js';

test('classe les liaisons et associe les compagnies au bon sens du trajet', () => {
  const insights = collectionInsights({ count: 40, routeCount: 32,
    routes: [{ departure: 'CDG', arrival: 'NCE', count: 9, supported: 7, distance: 694 },
      { departure: 'NCE', arrival: 'CDG', count: 16, supported: 12, distance: 694 }],
    routeAirlines: [{ departure: 'CDG', arrival: 'NCE', code: 'EZY', name: 'easyJet', count: 9 },
      { departure: 'NCE', arrival: 'CDG', code: 'AFR', name: 'Air France', count: 16 }],
    departures: [{ code: 'CDG', count: 9 }, { code: 'NCE', count: 16 }], arrivals: [{ code: 'CDG', count: 16 }] });

  assert.deepEqual(insights.routes.map(({ label, count }) => [label, count]), [['NCE → CDG', 16], ['CDG → NCE', 9]]);
  assert.equal(insights.routes[0].supported, 12);
  assert.equal(insights.routes[0].distance, 694);
  assert.deepEqual(insights.routes.map(route => route.airlines.map(airline => airline.name)), [['Air France'], ['easyJet']]);
  assert.equal(insights.origins[0].label, 'NCE');
  assert.equal(insights.destinations[0].label, 'CDG');
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

test('cumule les deux sens et compte chaque aéroport relié une seule fois', () => {
  const insights = collectionInsights({ routes: [
    { departure: 'CDG', arrival: 'NCE', count: 9, route_km: 6246 },
    { departure: 'NCE', arrival: 'CDG', count: 16, route_km: 11104 },
    { departure: 'CDG', arrival: 'LYS', count: 5 }
  ], departures: [{ code: 'CDG', name: 'Paris', lat: 49, lon: 2.5 }] });
  assert.equal(insights.airportCount, 3);
  assert.equal(insights.corridors.length, 2);
  assert.equal(insights.corridors[0].label, 'CDG ↔ NCE');
  assert.equal(insights.corridors[0].count, 25);
  assert.equal(insights.routes.find(route => route.label === 'CDG → NCE').route_km, 6246);
  assert.deepEqual(insights.hubs[0], { code: 'CDG', label: 'CDG', name: 'Paris', count: 2 });
  assert.equal(insights.airportByCode.get('CDG').lat, 49);
});
