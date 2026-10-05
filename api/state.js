'use strict';
const { neon } = require('@neondatabase/serverless');

const sectors = new Set(['Sala de máquinas', 'Linha de bolsa', 'Subconjunto', 'Embalagem final']);
const stations = new Set(['20', '30', '40', '50', '60', '70']);
const configured = () => Boolean(process.env.DATABASE_URL);
const connect = () => neon(process.env.DATABASE_URL);
const dataOf = row => ({
  id: row.id, name: row.name, sector: row.sector, active: true,
  present: row.present, noGlue: row.no_glue, allowed: row.allowed,
  fixed: row.fixed, initial: row.initial_station,
  supportPreckoff: row.support_preckoff, supportNeedle: row.support_needle
});

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Método inválido.' });
  if (!configured()) return res.status(503).json({ error: 'Banco SQL ainda não configurado.' });
  try {
    const sql = connect();
    if (req.method === 'GET') {
      const [settings, rows] = await Promise.all([
        sql`SELECT config, generated FROM app_settings WHERE id = 1`,
        sql`SELECT * FROM employees ORDER BY name`
      ]);
      return res.status(200).json({ config: settings[0]?.config || {}, generated: !!settings[0]?.generated, employees: rows.map(dataOf) });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.employees) || body.employees.length > 100 || !body.config || typeof body.config !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    const names = new Set();
    for (const p of body.employees) {
      const name = String(p.name || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(p.id) || !name || name.length > 100 || !sectors.has(p.sector) || !Array.isArray(p.allowed) || !p.allowed.length || p.allowed.some(s => !stations.has(s)) || p.fixed && !p.allowed.includes(p.fixed) || p.initial && !p.allowed.includes(p.initial) || p.noGlue && (p.allowed.length !== 1 || p.allowed[0] !== '30') || names.has(name.toLocaleLowerCase('pt-BR'))) {
        return res.status(400).json({ error: 'Revise o cadastro de funcionários.' });
      }
      names.add(name.toLocaleLowerCase('pt-BR'));
    }
    const input = JSON.stringify(body.employees.map(p => ({
      id: p.id, name: p.name.trim(), sector: p.sector, present: !!p.present,
      no_glue: !!p.noGlue, allowed: p.allowed, fixed: p.fixed || '',
      initial_station: p.initial || '', support_preckoff: !!p.supportPreckoff,
      support_needle: !!p.supportNeedle
    })));
    await sql.transaction([
      sql`INSERT INTO app_settings (id, config, generated) VALUES (1, ${JSON.stringify(body.config)}::jsonb, ${!!body.generated}) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, generated = EXCLUDED.generated, updated_at = now()`,
      sql`DELETE FROM employees`,
      sql`INSERT INTO employees (id, name, sector, present, no_glue, allowed, fixed, initial_station, support_preckoff, support_needle)
          SELECT id::uuid, name, sector, present, no_glue, allowed, fixed, initial_station, support_preckoff, support_needle
          FROM jsonb_to_recordset(${input}::jsonb) AS x(id text, name text, sector text, present boolean, no_glue boolean, allowed text[], fixed text, initial_station text, support_preckoff boolean, support_needle boolean)`
    ]);
    return res.status(200).json({ saved: true });
  } catch (error) {
    console.error('Database request failed:', error);
    return res.status(500).json({ error: 'Não foi possível acessar o banco SQL. Nenhum dado foi confirmado.' });
  }
};
