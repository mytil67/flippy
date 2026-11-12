import { accountOriginAllowed, accountRequest, accountResponseCookies, readAccountInput } from '../lib/account.js';
import { reply } from '../lib/adsb.js';

const paths = { signup: '/sign-up/email', login: '/sign-in/email', logout: '/sign-out' };

export default async function handler(request, response) {
  if (request.method !== 'POST') return reply(response, 405, { error: 'Méthode non autorisée.' });
  if (!accountOriginAllowed(request)) return reply(response, 403, { error: 'Ouvre la connexion depuis FLIPPY.' });
  const action = new URL(request.url, 'http://localhost').searchParams.get('action');
  if (!Object.hasOwn(paths, action)) return reply(response, 400, { error: 'Action inconnue.' });

  try {
    let body = {};
    if (action !== 'logout') {
      const input = await readAccountInput(request);
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      const password = input?.password;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
          typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return reply(response, 400, { error: 'Saisis une adresse e-mail et un mot de passe de 8 à 128 caractères.' });
      }
      body = { email, password, ...(action === 'signup' && { name: email.split('@')[0] }) };
    }
    const upstream = await accountRequest(request, paths[action], body);
    const data = await upstream.json();
    if (!upstream.ok) {
      const message = upstream.status === 429 ? 'Trop de tentatives. Réessaie dans un instant.' :
        action === 'login' ? 'Adresse e-mail ou mot de passe incorrect.' :
          action === 'signup' ? 'La création a échoué. Essaie de te connecter si tu as déjà un compte.' : 'La déconnexion a échoué.';
      return reply(response, upstream.status, { error: message });
    }
    accountResponseCookies(response, upstream);
    return reply(response, 200, { account: data?.user ? { email: data.user.email } : null });
  } catch {
    return reply(response, 503, { error: 'La connexion est momentanément indisponible.' });
  }
}
