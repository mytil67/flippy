export function albumAirports(departures = [], arrivals = []) {
  const airports = new Map();
  const collect = (items, role) => {
    for (const item of items) {
      if (!item.code || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      const current = airports.get(item.code) ?? {
        code: item.code, name: item.name || item.code, lat: item.lat, lon: item.lon, departures: 0, arrivals: 0
      };
      current[role] += Number(item.count) || 0;
      if (current.name === current.code && item.name) current.name = item.name;
      airports.set(item.code, current);
    }
  };
  collect(departures, 'departures');
  collect(arrivals, 'arrivals');
  return [...airports.values()].sort((left, right) =>
    right.departures + right.arrivals - left.departures - left.arrivals || left.code.localeCompare(right.code));
}
