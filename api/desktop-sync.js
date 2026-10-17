'use strict';
const { neon } = require('@neondatabase/serverless');
const { authorize } = require('./auth-core');
const { validateState } = require('../shared/state-contract.cjs');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método inválido.' });
  const user = authorize(req, res);
  if (!user) return;
  if (user.role !== 'Administrador') return res.status(403).json({ error: 'Sem permissão de sincronização.' });
  // Explicit, separate connection: never silently migrate/write the production web DB.
  if (process.env.DESKTOP_SYNC_ENABLED !== '1' || !process.env.DESKTOP_DATABASE_URL) return res.status(503).json({ error: 'Sincronização desktop não habilitada neste servidor.' });
  try {
    const sql = neon(process.env.DESKTOP_DATABASE_URL);
    if (req.method === 'GET') {
      const cursor = Number(new URL(req.url, 'https://localhost').searchParams.get('cursor') || 0);
      if (!Number.isSafeInteger(cursor) || cursor < 0) return res.status(400).json({ error: 'Cursor inválido.' });
      const rows = await sql`SELECT revision, state, author_id, updated_at FROM desktop_workspace WHERE id=1`;
      if (!rows.length) throw new Error('Migration missing');
      const row = rows[0];
      if (cursor > row.revision) return res.status(409).json({ error: 'Banco remoto foi restaurado. Requer revisão administrativa.' });
      return res.status(200).json({ revision: row.revision, ...(row.revision > cursor ? { state: row.state, authorId: row.author_id, updatedAt: row.updated_at } : {}) });
    }
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !uuid.test(body.id) || !uuid.test(body.deviceId) || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0 || typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt))) throw new Error('Alteração inválida.');
      validateState(body.state);
    } catch { return res.status(400).json({ error: 'Alteração inválida ou muito grande.' }); }
    const rows = await sql`SELECT desktop_push(${body.id}::uuid, ${body.baseRevision}, ${JSON.stringify(body.state)}::jsonb, ${user.username}, ${body.deviceId}::uuid, ${body.createdAt}::timestamptz) AS result`;
    const result = rows[0].result;
    return res.status(result.conflict ? 409 : 200).json(result);
  } catch { return res.status(503).json({ error: 'Sincronização indisponível. Verifique o banco de teste e a migração 003. Seus dados locais foram preservados.' }); }
};
