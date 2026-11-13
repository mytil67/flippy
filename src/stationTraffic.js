import { center, distanceKm, radius } from '../lib/flight.js';

export const stationIntervals = [15, 30, 45, 60, 120];

export function upcomingPassages(planes, now, demo = false) {
  const radians = Math.PI / 180;
  const earthKm = 6371;
  const [radarLat, radarLon] = center.map(value => value * radians);
  return planes.flatMap(plane => {
    const { lat, lon, speed, heading, observedAt } = plane;
    const age = demo ? 0 : (now - observedAt) / 1000;
    if (plane.ground || ![lat, lon, speed, heading, age].every(Number.isFinite) ||
        speed <= 0 || age > 60 || age < -5) return [];

    const latitude = lat * radians;
    const deltaLon = radarLon - lon * radians;
    const bearing = Math.atan2(Math.sin(deltaLon) * Math.cos(radarLat),
      Math.cos(latitude) * Math.sin(radarLat) - Math.sin(latitude) * Math.cos(radarLat) * Math.cos(deltaLon));
    const distance = distanceKm([lat, lon], center);
    const angle = heading * radians - bearing;
    const along = Math.atan2(Math.sin(distance / earthKm) * Math.cos(angle), Math.cos(distance / earthKm));
    const seconds = along * earthKm / (speed * 1.852 / 3600) - Math.max(0, age);
    if (seconds <= 0 || seconds > 20 * 60 || distance > radius) return [];
    const closestKm = earthKm * Math.asin(Math.min(1, Math.abs(Math.sin(distance / earthKm) * Math.sin(angle))));
    const track = heading * radians;
    const closestLat = Math.asin(Math.sin(latitude) * Math.cos(along) + Math.cos(latitude) * Math.sin(along) * Math.cos(track));
    const closestLon = lon * radians + Math.atan2(Math.sin(track) * Math.sin(along) * Math.cos(latitude),
      Math.cos(along) - Math.sin(latitude) * Math.sin(closestLat));
    return [{ plane, seconds, closestKm, point: [closestLat / radians, closestLon / radians] }];
  }).sort((a, b) => a.seconds - b.seconds || a.closestKm - b.closestKm);
}

export function spotlightKey(plane) {
  return plane.id + ':' + plane.callsign;
}

export function nextSpotlight(planes, history, seen, mode, now = Date.now(), selected) {
  const excluded = selected && spotlightKey(selected);
  const current = planes.filter(plane => spotlightKey(plane) !== excluded &&
    (mode === 'demo' || now - plane.observedAt <= 60000));
  const keys = new Set(current.map(spotlightKey));
  const recent = mode === 'demo' ? [] : [...history.values()].map(samples => samples.at(-1))
    .filter(plane => plane && now - plane.observedAt <= 10 * 60000 &&
      spotlightKey(plane) !== excluded && !keys.has(spotlightKey(plane)));
  const order = (a, b) => (seen.get(spotlightKey(a)) ?? 0) - (seen.get(spotlightKey(b)) ?? 0);
  return current.find(plane => !seen.has(spotlightKey(plane))) ??
    recent.filter(plane => !seen.has(spotlightKey(plane))).sort((a, b) => b.observedAt - a.observedAt)[0] ??
    [...current].sort(order)[0] ?? recent.sort(order)[0];
}
