import { positions, reply } from '../lib/adsb.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  try {
    reply(response, 200, await positions(), 12);
  } catch {
    reply(response, 502, { error: 'Les flux ADS-B sont indisponibles' });
  }
}
