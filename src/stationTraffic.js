export const stationIntervals = [15, 30, 45, 60, 120];

export function spotlightKey(plane) {
  return plane.id + ':' + plane.callsign;
}

export function nextSpotlight(planes, history, seen, mode, now = Date.now()) {
  const current = mode === 'demo' ? planes : planes.filter(plane => now - plane.observedAt <= 60000);
  const keys = new Set(current.map(spotlightKey));
  const recent = mode === 'demo' ? [] : [...history.values()].map(samples => samples.at(-1))
    .filter(plane => plane && now - plane.observedAt <= 10 * 60000 && !keys.has(spotlightKey(plane)));
  const order = (a, b) => (seen.get(spotlightKey(a)) ?? 0) - (seen.get(spotlightKey(b)) ?? 0);
  return current.find(plane => !seen.has(spotlightKey(plane))) ??
    recent.filter(plane => !seen.has(spotlightKey(plane))).sort((a, b) => b.observedAt - a.observedAt)[0] ??
    [...current].sort(order)[0] ?? recent.sort(order)[0];
}
