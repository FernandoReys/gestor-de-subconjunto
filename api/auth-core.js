'use strict';
const crypto = require('node:crypto');
const COOKIE = 'gestor_session';
const TTL = 8 * 60 * 60;
const attempts = new Map();
function configured() { return Boolean(process.env.PILOT_ADMIN_PASSWORD_HASH && process.env.AUTH_SESSION_SECRET?.length >= 32); }
function verifyPassword(password) {
  const parts = (process.env.PILOT_ADMIN_PASSWORD_HASH || '').split('$');
  if (parts.length !== 2 || !/^[0-9a-f]{32}$/.test(parts[0]) || !/^[0-9a-f]{128}$/.test(parts[1]) || typeof password !== 'string' || password.length > 256) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(password, Buffer.from(parts[0], 'hex'), 64), Buffer.from(parts[1], 'hex'));
}
function signedSession() {
  const data = Buffer.from(JSON.stringify({ sub: 'fernando', exp: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  return `${data}.${crypto.createHmac('sha256', process.env.AUTH_SESSION_SECRET).update(data).digest('base64url')}`;
}
function session(req) {
  if (!configured()) return null;
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`));
  const [data, signature, extra] = (cookie?.slice(COOKIE.length + 1) || '').split('.');
  if (!data || !signature || extra || data.length > 256) return null;
  const expected = crypto.createHmac('sha256', process.env.AUTH_SESSION_SECRET).update(data).digest();
  let actual; try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try { const payload = JSON.parse(Buffer.from(data, 'base64url').toString()); return payload.sub === 'fernando' && Number.isSafeInteger(payload.exp) && payload.exp > Date.now() / 1000 ? { username: 'fernando', role: 'Administrador' } : null; } catch { return null; }
}
function cookieOptions(req, clear = false) {
  const secure = process.env.VERCEL || req.headers['x-forwarded-proto'] === 'https';
  return `${COOKIE}=${clear ? '' : signedSession()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : TTL}${secure ? '; Secure' : ''}`;
}
function sameOrigin(req) {
  try { const origin = new URL(req.headers.origin); return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol); } catch { return false; }
}
function authorize(req, res) {
  if (!configured()) { res.status(503).json({ error: 'Acesso ainda não configurado.' }); return null; }
  const user = session(req);
  if (!user) { res.status(401).json({ error: 'Faça login para continuar.' }); return null; }
  if (req.method !== 'GET' && !sameOrigin(req)) { res.status(403).json({ error: 'Origem não permitida.' }); return null; }
  return user;
}
function rateLimit(req) {
  const now = Date.now(), key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  for (const [id, value] of attempts) if (value.until < now) attempts.delete(id);
  const value = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
  if (value.count >= 5) return false;
  attempts.set(key, { count: value.count + 1, until: value.until });
  return true;
}
module.exports = { configured, verifyPassword, session, cookieOptions, sameOrigin, authorize, rateLimit };
