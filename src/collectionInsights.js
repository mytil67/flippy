export function routeEvidenceGroup(status) {
  return status === 'announced' ? 'unverified' :
    ['confirmed', 'probable', 'unverified', 'conflict'].includes(status) ? status : 'unknown';
}

export function routeReliability(items = []) {
  const counts = new Map(['confirmed', 'probable', 'unverified', 'conflict', 'unknown'].map(key => [key, 0]));
  for (const item of items) {
    const key = routeEvidenceGroup(item.route_status);
    counts.set(key, counts.get(key) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count })).filter(item => item.count);
}

export function collectionInsights(data) {
  const carriers = new Map();
  const label = item => `${item.departure} → ${item.arrival}`;
  for (const item of data?.routeAirlines ?? []) {
    const key = label(item);
    if (!carriers.has(key)) carriers.set(key, []);
    carriers.get(key).push(item);
  }
  const routes = (data?.routes ?? []).map(item => ({ ...item, label: label(item), airlines: carriers.get(label(item)) ?? [] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  const airports = (items = []) => items.map(item => ({ ...item, label: item.code }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  const byCode = new Map([...(data?.departures ?? []), ...(data?.arrivals ?? [])].map(item => [item.code, item]));
  const network = new Map();
  const corridors = new Map();
  for (const route of routes) {
    const { departure, arrival } = route;
    const pair = [departure, arrival].sort();
    const key = pair.join(' ↔ ');
    const corridor = corridors.get(key) ?? { label: key, count: 0, directions: [] };
    corridor.count += route.count;
    corridor.directions.push(route);
    corridors.set(key, corridor);
    for (const [code, other] of [[departure, arrival], [arrival, departure]]) {
      const linked = network.get(code) ?? new Set();
      linked.add(other);
      network.set(code, linked);
    }
  }
  return {
    routes,
    origins: airports(data?.departures),
    destinations: airports(data?.arrivals),
    airportByCode: byCode,
    airportCount: network.size,
    corridors: [...corridors.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')),
    hubs: [...network].map(([code, linked]) => ({ code, name: byCode.get(code)?.name ?? code, label: code, count: linked.size }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    routeCoverage: data?.count ? Math.round((data.routeCount ?? 0) / data.count * 100) : 0
  };
}
