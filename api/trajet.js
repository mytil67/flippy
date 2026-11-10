import { flightDetails, reply } from '../lib/adsb.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const callsign = searchParams.get('vol') ?? '';
  const hex = searchParams.get('hex') ?? '';
  if ((!callsign && !hex) || (callsign && !/^[A-Z0-9]{2,10}$/.test(callsign)) ||
      (hex && !/^[0-9a-f]{6}$/.test(hex))) {
    return reply(response, 400, { error: 'Identifiant de vol invalide' });
  }
  const details = await flightDetails(callsign, hex);
  reply(response, 200, details, details.routeUnavailable ? 0 : 60);
}
