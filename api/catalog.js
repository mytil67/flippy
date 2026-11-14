import airports from '../lib/airports.json' with { type: 'json' };
import { reply } from '../lib/adsb.js';
import { byName } from '../lib/collectionOrder.js';

const PAGE_SIZE = 24;
let aircraftCache;

export function normalizeAircraftModels(rows) {
  const models = new Map();
  for (const row of rows) {
    const code = row.Designator?.trim();
    if (!code) continue;
    const current = models.get(code);
    const name = row.ModelFullName?.trim() || code;
    if (current) {
      if (name.length < current.name.length) current.name = name;
      continue;
    }
    models.set(code, {
      code,
      name,
      manufacturer: row.ManufacturerCode?.trim() || null,
      category: row.AircraftDescription || null,
      engineType: row.EngineType || null,
      engineCount: Number(row.EngineCount) || null
    });
  }
  return [...models.values()].sort((a, b) => a.code.localeCompare(b.code));
}

async function aircraftCatalog() {
  if (!aircraftCache) aircraftCache = Promise.all([
    fetch('https://doc8643.icao.int/External/AircraftTypes', {
      method: 'POST', signal: AbortSignal.timeout(20000)
    }).then(response => {
      if (!response.ok) throw new Error('ICAO indisponible');
      return response.json();
    }),
    fetch('https://doc8643.icao.int/External/Stats', {
      method: 'POST', signal: AbortSignal.timeout(10000)
    }).then(response => response.ok ? response.json() : null).catch(() => null)
  ]).then(([rows, stats]) => {
    return { items: normalizeAircraftModels(rows).sort(byName), updated: stats?.LastUpdated ?? null };
  }).catch(error => {
    aircraftCache = undefined;
    throw error;
  });
  return aircraftCache;
}

const airportCatalog = airports.map(([code, name, lat, lon]) => ({ code, name, lat, lon })).sort(byName);
const searchable = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const kind = searchParams.get('kind') === 'models' ? 'models' : 'airports';
  const query = searchable((searchParams.get('q') || '').trim().slice(0, 60));
  const page = Math.max(1, Math.min(10000, Number(searchParams.get('page')) || 1));
  const excluded = new Set((searchParams.get('exclude') || '').split(',').filter(code => /^[A-Z0-9]{2,5}$/.test(code)));

  try {
    const catalog = kind === 'models' ? await aircraftCatalog() : { items: airportCatalog, updated: null };
    const filtered = catalog.items.filter(item => !excluded.has(item.code) && (!query ||
      searchable([item.code, item.name, item.manufacturer].filter(Boolean).join(' ')).includes(query)));
    const start = (page - 1) * PAGE_SIZE;
    return reply(response, 200, {
      items: filtered.slice(start, start + PAGE_SIZE), total: filtered.length, page,
      pages: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), catalogTotal: catalog.items.length, updated: catalog.updated,
      source: kind === 'models' ? 'ICAO Doc 8643' : 'OurAirports'
    }, 86400);
  } catch {
    return reply(response, 503, { error: 'Le catalogue aéronautique est temporairement indisponible.' });
  }
}
