import { reply } from '../lib/adsb.js';
import { flightTrace } from '../lib/trace.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const hex = searchParams.get('hex') ?? '';
  const callsign = searchParams.get('vol') ?? '';
  const at = Number(searchParams.get('at'));
  const lat = Number(searchParams.get('lat'));
  const lon = Number(searchParams.get('lon'));
  const age = Date.now() - at;
  if (!/^[0-9a-f]{6}$/.test(hex) || !/^[A-Z0-9]{0,10}$/.test(callsign) ||
      !Number.isFinite(age) || age < -60000 || age > 1800000 ||
      !searchParams.has('lat') || !searchParams.has('lon') ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return reply(response, 400, { error: 'Position ou identifiant invalide' });
  }
  try {
    const trace = await flightTrace(hex, { at, lat, lon }, callsign);
    reply(response, 200, trace, trace.segments.length ? 20 : 0);
  } catch (error) {
    console.warn('Historique ADS-B', error.errors?.map(cause => cause.cause?.code ?? cause.message) ?? error.message);
    reply(response, 502, { error: 'Historique ADS-B indisponible' });
  }
}
