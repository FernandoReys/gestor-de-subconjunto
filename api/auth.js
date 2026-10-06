'use strict';
const auth = require('./auth-core');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Método inválido.' });
  if (!auth.configured()) return res.status(503).json({ error: 'Acesso ainda não configurado.' });
  if (req.method === 'GET') { const user = auth.session(req); return user ? res.status(200).json(user) : res.status(401).json({ error: 'Faça login para continuar.' }); }
  if (!auth.sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  if (req.method === 'DELETE') { res.setHeader('Set-Cookie', auth.cookieOptions(req, true)); return res.status(200).json({ signedOut: true }); }
  if (!auth.rateLimit(req)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  let body; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return res.status(400).json({ error: 'Dados inválidos.' }); }
  if (body.username !== 'fernando' || !auth.verifyPassword(body.password)) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  res.setHeader('Set-Cookie', auth.cookieOptions(req));
  return res.status(200).json({ username: 'fernando', role: 'Administrador' });
};
