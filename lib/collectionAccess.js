import { createHash, randomBytes } from 'node:crypto';
import { reply } from './adsb.js';

export const collectionToken = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');

export function setCollector(response, token = collectionToken(), maxAge = 31536000) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  response.setHeader('Set-Cookie', `flippy_collection=${token}; Path=/api/collection; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure}`);
}

export async function collectionIdentity(sql, token) {
  if (!token) return null;
  const session = digest(token);
  const [identity] = await sql`
    WITH owner AS (
      SELECT COALESCE((SELECT collector_id FROM flippy_collection_sessions WHERE session_hash = ${session}), ${session}) AS id
    )
    SELECT id, EXISTS(SELECT 1 FROM flippy_collection_keys WHERE collector_id = id) AS "hasKey" FROM owner`;
  return { ...identity, session };
}

async function readCode(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body.code;
  let raw = request.body?.toString() ?? '';
  if (!request.body) {
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 512) return null;
    }
  }
  if (raw.length > 512) return null;
  try { return JSON.parse(raw)?.code; } catch { return null; }
}

export async function collectionAccess(sql, identity, action, request, response) {
  if (action === 'connect') {
    const input = await readCode(request);
    const code = typeof input === 'string' ? input.trim() : '';
    if (!/^fc_[A-Za-z0-9_-]{43}$/.test(code)) return reply(response, 400, { error: 'Vérifie le format du code d’accès.' });
    const [target] = await sql`SELECT collector_id FROM flippy_collection_keys WHERE key_hash = ${digest(code)}`;
    if (!target) return reply(response, 404, { error: 'Ce code d’accès est invalide ou a été remplacé.' });
    if (target.collector_id === identity?.id) return reply(response, 200, { connected: true });
    if (identity && !identity.hasKey) {
      const [local] = await sql`SELECT EXISTS(SELECT 1 FROM flippy_captures WHERE collector_id = ${identity.id}) AS captures`;
      if (local.captures) return reply(response, 409, { error: 'Crée et conserve d’abord le code de cette collection pour pouvoir y revenir.' });
    }
    const token = collectionToken();
    const queries = [sql`INSERT INTO flippy_collection_sessions (session_hash, collector_id)
      VALUES (${digest(token)}, ${target.collector_id})`];
    if (identity) queries.push(sql`DELETE FROM flippy_collection_sessions WHERE session_hash = ${identity.session}`);
    await sql.transaction(queries);
    setCollector(response, token);
    return reply(response, 200, { connected: true });
  }
  if (!identity) return reply(response, 409, { error: 'Autorise les cookies pour activer l’accès à ta collection.' });
  if (action === 'key') {
    const code = 'fc_' + randomBytes(32).toString('base64url');
    await sql`INSERT INTO flippy_collection_keys (collector_id, key_hash) VALUES (${identity.id}, ${digest(code)})
      ON CONFLICT (collector_id) DO UPDATE SET key_hash = EXCLUDED.key_hash`;
    return reply(response, 200, { code });
  }
  if (action === 'disconnect') {
    if (!identity.hasKey) return reply(response, 409, { error: 'Conserve un code d’accès avant de déconnecter ce navigateur.' });
    await sql`DELETE FROM flippy_collection_sessions WHERE session_hash = ${identity.session}`;
    setCollector(response, '', 0);
    return reply(response, 200, { connected: false });
  }
  return reply(response, 400, { error: 'Action inconnue.' });
}
