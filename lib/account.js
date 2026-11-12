const base = () => process.env.NEON_AUTH_BASE_URL?.replace(/\/$/, '');
const allowedOrigin = (origin, host) => origin === `https://${host}` || (!process.env.VERCEL && origin === `http://${host}`);

export function accountOriginAllowed(request) {
  return allowedOrigin(request.headers.origin, request.headers.host);
}

function authCookies(request) {
  return (request.headers.cookie ?? '').split(/;\s*/).filter(cookie => /^(?:__Secure-|__Host-)?(?:neon-auth|better-auth)\./.test(cookie)).join('; ');
}

export async function accountRequest(request, path, body) {
  const url = base();
  if (!url) throw new Error('Neon Auth is unavailable');
  const cookie = authCookies(request);
  const origin = process.env.VERCEL ? `https://${request.headers.host}` : 'https://flippy.stefe.app';
  return fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { origin, ...(cookie && { cookie }), ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(7000)
  });
}

export async function accountUser(request) {
  if (!authCookies(request)) return null;
  const response = await accountRequest(request, '/get-session');
  if (!response.ok) throw new Error('Neon Auth session unavailable');
  const session = await response.json();
  return typeof session?.user?.id === 'string' ? { id: session.user.id, email: session.user.email } : null;
}

export function accountResponseCookies(response, upstream) {
  const cookies = upstream.headers.getSetCookie().map(cookie => {
    const hostCookie = cookie.startsWith('__Host-');
    let result = cookie.replace(/;\s*Domain=[^;]+/ig, '').replace(/;\s*Path=[^;]+/ig, '');
    if (!process.env.VERCEL) result = result.replace(/;\s*Secure\b/ig, '');
    return result + (hostCookie ? '; Path=/' : '; Path=/api');
  });
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
}

export async function readAccountInput(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  let raw = request.body?.toString() ?? '';
  if (!request.body) for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 2048) return null;
  }
  if (raw.length > 2048) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
