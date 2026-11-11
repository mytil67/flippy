import { distanceKm } from '../lib/flight.js';

export function nearLongitude(lon, reference) {
  return lon + 360 * Math.round((reference - lon) / 360);
}

export function buildTraceGeometry(focus, route, segments) {
  if (!focus) return null;
  const current = [focus.plane.lat, focus.plane.lon];
  let reference = current[1];
  const tracks = (segments ?? []).map(segment => new Array(segment.length));
  // Start from the clicked aircraft and keep consecutive samples on the same world copy.
  for (let part = tracks.length - 1; part >= 0; part--) {
    for (let index = segments[part].length - 1; index >= 0; index--) {
      const [lat, lon] = segments[part][index];
      reference = nearLongitude(lon, reference);
      tracks[part][index] = [lat, reference];
    }
  }
  const first = tracks[0]?.[0];
  const last = tracks.at(-1)?.at(-1);
  const airportPoint = (airport, anchor) => Number.isFinite(airport?.lat) && Number.isFinite(airport?.lon)
    ? [airport.lat, nearLongitude(airport.lon, anchor[1])] : null;
  const from = route?.unverified ? null : airportPoint(route?.from, first ?? current);
  const to = route?.unverified ? null : airportPoint(route?.to, current);
  const guides = [];
  const fromGap = from && first ? distanceKm(from, first) : null;
  if (fromGap > 2 && fromGap <= 15) guides.push([from, first]);
  if (to && distanceKm(current, to) > 0.3) guides.push([current, to]);

  const missingStart = Boolean(first && (route?.unverified || fromGap > 15));
  const missingEnd = Boolean(last && distanceKm(last, current) > 0.15);
  return {
    from, to, tracks, guides,
    startOfCoverage: first ?? null,
    endOfCoverage: missingEnd ? last : null,
    partial: Boolean(missingStart || missingEnd || tracks.length > 1),
    bounds: [current, ...[from, to].filter(Boolean), ...tracks.flat()]
  };
}
