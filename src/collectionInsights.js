const hourInParis = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23'
});

const periodDefinitions = [
  { key: 'night', label: 'Nuit', range: '0–6 h', from: 0, to: 6 },
  { key: 'morning', label: 'Matin', range: '6–12 h', from: 6, to: 12 },
  { key: 'afternoon', label: 'Après-midi', range: '12–18 h', from: 12, to: 18 },
  { key: 'evening', label: 'Soir', range: '18–24 h', from: 18, to: 24 }
];

function ranking(values, limit = 4) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
    .slice(0, limit);
}

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
  const recent = data?.recent ?? [];
  const routes = ranking(recent.map(item => item.departure_code && item.arrival_code
    ? `${item.departure_code} → ${item.arrival_code}` : null));
  const origins = ranking(recent.map(item => item.departure_code), 1);
  const destinations = ranking(recent.map(item => item.arrival_code), 1);
  const periods = periodDefinitions.map(period => ({ ...period, count: 0 }));

  for (const item of recent) {
    const instant = new Date(item.captured_at);
    if (Number.isNaN(instant.getTime())) continue;
    const hour = Number(hourInParis.formatToParts(instant).find(part => part.type === 'hour')?.value);
    const period = periods.find(candidate => hour >= candidate.from && hour < candidate.to);
    if (period) period.count += 1;
  }

  const airlines = [...(data?.airlines ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return {
    sampleSize: recent.length,
    routes,
    topOrigin: origins[0] ?? null,
    topDestination: destinations[0] ?? null,
    topAirline: airlines[0] ?? null,
    periods,
    peakPeriod: [...periods].sort((a, b) => b.count - a.count)[0] ?? null,
    routeCoverage: data?.count ? Math.round((data.routeCount ?? 0) / data.count * 100) : 0
  };
}
