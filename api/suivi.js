import { aircraftPosition, reply } from '../lib/adsb.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const hex = searchParams.get('hex') ?? '';
  if (!/^[0-9a-f]{6}$/.test(hex)) return reply(response, 400, { error: 'Identifiant d’avion invalide' });
  try {
    reply(response, 200, await aircraftPosition(hex), 10);
  } catch {
    reply(response, 502, { error: 'Position indisponible' });
  }
}
