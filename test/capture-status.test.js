import assert from 'node:assert/strict';
import test from 'node:test';
import { captureFlightKey, captureStatus } from '../src/captureStatus.js';

test('distingue les captures au passage de minuit à Paris', () => {
  const now = new Date('2026-11-12T23:05:00Z');
  assert.equal(captureStatus('2026-11-12T23:00:00Z', now), 'today');
  assert.equal(captureStatus('2026-11-12T22:59:59Z', now), 'previous');
  assert.equal(captureStatus(undefined, now), undefined);
  assert.equal(captureStatus('date invalide', now), undefined);
});

test('un changement d’indicatif ne réutilise pas la capture du vol précédent', () => {
  assert.notEqual(captureFlightKey({ id: '123abc', callsign: 'AFR1' }), captureFlightKey({ id: '123abc', callsign: 'AFR2' }));
});
