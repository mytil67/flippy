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
  return {
    routes,
    origins: airports(data?.departures),
    destinations: airports(data?.arrivals),
    routeCoverage: data?.count ? Math.round((data.routeCount ?? 0) / data.count * 100) : 0
  };
}
