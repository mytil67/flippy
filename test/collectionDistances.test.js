import test from 'node:test';
import assert from 'node:assert/strict';
import { captureAirportDetails, collectionDistanceLeaders } from '../lib/collectionDistances.js';

const announced = {
  aircraft: 'abc123', callsign: 'AFR162', captured_at: '2026-11-15T15:22:00Z',
  route_status: 'unverified', route_km: null, reported_departure_code: 'CDG', reported_arrival_code: 'HND'
};

test('estime CDG–HND et préserve la distance renseignée ou le statut de conflit', () => {
  assert.equal(captureAirportDetails(announced).reported_route_km, 9708);
  assert.equal(captureAirportDetails({ ...announced, route_km: 9708 }).reported_route_km, undefined);
  assert.equal(captureAirportDetails({ ...announced, route_status: 'conflict' }).reported_route_km, undefined);
  assert.equal(captureAirportDetails({ ...announced, reported_departure_code: null }).reported_route_km, undefined);
  assert.equal(captureAirportDetails({ ...announced, arrival_code: 'NRT' }).reported_route_km, undefined);
});

test('classe les vols et retient une seule liaison par destination en privilégiant le trajet renseigné à égalité', () => {
  const { flights, destinations } = collectionDistanceLeaders([
    announced,
    { ...announced, captured_at: '2026-11-14T15:22:00Z', route_status: 'confirmed', departure_code: 'CDG', arrival_code: 'HND', route_km: 9708 },
    { ...announced, callsign: 'ANA216' },
    { ...announced, callsign: 'IBE350', route_status: 'confirmed', departure_code: 'MAD', arrival_code: 'PVG', route_km: 10281 },
    { ...announced, callsign: 'ZZZ123', route_status: 'conflict' }
  ]);
  assert.deepEqual(flights.map(({ flight, estimated }) => [flight, estimated]), [
    ['IBE350', false], ['AFR162', false], ['ANA216', true]
  ]);
  assert.deepEqual(destinations.map(({ arrival, flight }) => [arrival, flight]), [['PVG', 'IBE350'], ['HND', 'AFR162']]);
});
