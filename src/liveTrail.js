import { distanceKm } from '../lib/flight.js';
import { nearLongitude } from './traceGeometry.js';

export function isFollowPosition(selected, previous, candidate) {
  if (!candidate || candidate.id !== selected?.id || previous?.ground) return false;
  const reference = previous ?? selected;
  const callsign = selected.callsign || reference.callsign;
  const registration = selected.registration || reference.registration;
  const elapsed = candidate.observedAt - reference.observedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 20 * 60000 ||
      (callsign && candidate.callsign && callsign !== candidate.callsign) ||
      (registration && candidate.registration && registration !== candidate.registration) ||
      (callsign && !candidate.callsign && elapsed > 120000)) return false;
  return distanceKm([reference.lat, reference.lon], [candidate.lat, candidate.lon]) <= 1.5 + elapsed / 2483;
}

export function appendLiveSample(samples, next) {
  const previous = samples.at(-1);
  if (!Number.isFinite(next?.observedAt) || next.observedAt <= (previous?.observedAt ?? -Infinity)) return samples;
  return [...samples.slice(-179), next];
}

function positionSegments(samples) {
  const segments = [];
  let current = [];
  let previous;
  for (const sample of samples) {
    const position = [sample.lat, nearLongitude(sample.lon, previous?.position[1] ?? sample.lon)];
    if (previous) {
      const elapsed = sample.observedAt - previous.at;
      const distance = distanceKm(previous.position, position);
      if (elapsed > 90000 || distance > 0.8 + elapsed / 2483) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    previous = { position, at: sample.observedAt };
    const last = current.at(-1)?.position;
    if (!last || position[0] !== last[0] || position[1] !== last[1]) current.push(previous);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

export function liveTrailSegments(samples) {
  return positionSegments(samples).map(part => part.map(sample => sample.position));
}

export function recordRadarHistory(history, aircraft, updatedAt) {
  const cutoff = updatedAt - 30 * 60000;
  const next = new Map([...history].filter(([, samples]) => samples.at(-1).observedAt >= cutoff));
  for (const plane of aircraft) {
    const samples = next.get(plane.id) ?? [];
    const last = samples.at(-1);
    if (last && plane.observedAt <= last.observedAt) continue;
    const recent = last && isFollowPosition(last, null, plane) ? samples.filter(sample => sample.observedAt >= cutoff) : [];
    next.delete(plane.id);
    next.set(plane.id, appendLiveSample(recent, plane));
  }
  while (next.size > 250) next.delete(next.keys().next().value);
  return next;
}

export function radarTrace(samples, selected, extraSample) {
  const active = samples ?? [];
  // A new rotation can replace the buffer for the same transponder.
  // Only display the buffer if it still contains the observation the user clicked.
  if (!active.some(sample => sample.observedAt === selected.observedAt)) return null;
  const observations = extraSample && !active.some(sample => sample.observedAt === extraSample.observedAt)
    ? [...active, extraSample].sort((a, b) => a.observedAt - b.observedAt) : active;
  const parts = positionSegments(observations);
  return parts.length ? {
    segments: parts.map(part => part.map(sample => sample.position)),
    timestamps: parts.map(part => part.map(sample => sample.at))
  } : null;
}
