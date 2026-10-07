'use strict';
const { neon } = require('@neondatabase/serverless');
const { authorize } = require('./auth-core');

const sectors = new Set(['Sala de máquinas', 'Linha de bolsa', 'Linha de Bolsas', 'Subconjunto', 'Embalagem final', 'Outros']);
const stations = new Set(['20', '30', '40', '50', '60', '70']);
const roles = new Set(['Operador', 'Assistente']);
const configured = () => Boolean(process.env.DATABASE_URL);
const connect = () => neon(process.env.DATABASE_URL);
const dataOf = row => ({
  id: row.id, name: row.name, sector: row.sector, role: row.role || 'Operador', active: true,
  present: row.present, noGlue: row.no_glue, allowed: row.allowed,
  fixed: row.fixed, initial: row.initial_station,
  supportPreckoff: row.support_preckoff, supportNeedle: row.support_needle,
  registration: row.registration || '', notes: row.notes || ''
});

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Método inválido.' });
  if (!authorize(req, res)) return;
  if (process.env.PILOT_PRESENTATION_MODE === '1') return res.status(503).json({ error: 'Modo de apresentação: dados salvos apenas neste navegador.', mode: 'presentation' });
  if (!configured()) return res.status(503).json({ error: 'Banco SQL ainda não configurado.' });
  try {
    const sql = connect();
    if (req.method === 'GET') {
      const [settings, rows, restrictions, fpRows, fpPositions, scheduleRows] = await Promise.all([
        sql`SELECT config, generated FROM app_settings WHERE id = 1`,
        sql`SELECT * FROM employees ORDER BY name`,
        sql`SELECT employee_id, station_id, reason, expires_on FROM employee_restrictions ORDER BY created_at`,
        sql`SELECT * FROM fps ORDER BY created_at DESC`,
        sql`SELECT * FROM fp_stations ORDER BY position`,
        sql`SELECT * FROM schedules ORDER BY work_date DESC, created_at DESC LIMIT 100`
      ]);
      const config=settings[0]?.config||{};
      if(fpRows.length)config.fps=fpRows.map(f=>({id:f.id,fp:f.code,name:f.name,market:f.market,variation:f.variation,product:f.product,revision:f.revision,notes:f.notes,status:f.status,stations:fpPositions.filter(s=>s.fp_id===f.id).map(s=>({id:s.station_id,name:s.process,requiredCount:s.required_count,notes:s.notes}))}));
      if(scheduleRows.length)config.history=scheduleRows.map(x=>({id:x.id,date:String(x.work_date).slice(0,10),shift:x.shift_name,fpId:x.fp_id,fp:x.fp_code,product:x.product,status:x.status,notes:x.notes,snapshot:x.snapshot,organizers:x.snapshot.organizers?.map(p=>p.name)||[],positions:x.snapshot.positions?.length||0,names:x.snapshot.employees?.map(p=>p.name).join(' ')||'',createdAt:x.created_at,updatedAt:x.updated_at}));
      return res.status(200).json({ config, generated: !!settings[0]?.generated, employees: rows.map(row=>({...dataOf(row),restrictions:restrictions.filter(x=>x.employee_id===row.id).map(x=>({stationId:x.station_id,reason:x.reason,expiresOn:x.expires_on?.toISOString?.().slice(0,10)||x.expires_on||''}))})) });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.employees) || body.employees.length > 100 || !body.config || typeof body.config !== 'object') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    const names = new Set();
    const registrations = new Set();
    const config = body.config;
    if(body.operation!==undefined&&body.operation!=='clearSchedules')return res.status(400).json({error:'Operação inválida.'});
    const shifts=config.shifts||[];
    if(!Array.isArray(shifts)||shifts.length>20||new Set(shifts.map(x=>x?.name)).size!==shifts.length||shifts.some(x=>!x||typeof x.name!=='string'||!x.name.trim()||x.name.length>40||!/^\d{2}:\d{2}$/.test(x.start)||!/^\d{2}:\d{2}$/.test(x.end)||x.end<=x.start))return res.status(400).json({error:'Revise os turnos.'});
    if(config.history!==undefined&&(!Array.isArray(config.history)||config.history.length>100||config.history.some(x=>!x||!/^[0-9a-f-]{36}$/i.test(x.id)||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!['Rascunho','Incompleta','Pronta','Finalizada','Cancelada'].includes(x.status)||!Array.isArray(x.snapshot?.rows)||x.snapshot.rows.length>100||!Array.isArray(x.snapshot?.positions)||x.snapshot.positions.length>18)))return res.status(400).json({error:'Revise o histórico de escalas.'});
    const configuredSectors=Array.isArray(config.sectors)?config.sectors:[...sectors];
    if(configuredSectors.length>30||!configuredSectors.length||configuredSectors.some(x=>typeof x!=='string'||!x.trim()||x.length>60)||new Set(configuredSectors).size!==configuredSectors.length)return res.status(400).json({error:'Revise os setores.'});
    const fps = config.fps;
    const extraPosts = config.extraPosts || [];
    const organizerIds = config.organizerIds || [];
    if (fps !== undefined && (!Array.isArray(fps) || fps.length > 50 || new Set(fps.map(p => p?.id)).size !== fps.length || fps.some(p => !p || !/^[0-9a-f-]{36}$/i.test(p.id) || !['Nacional', 'Internacional'].includes(p.market) || [p.name, p.variation, p.fp, p.revision].some(x => typeof x !== 'string' || !x.trim() || x.length > 120) || p.stations && (!Array.isArray(p.stations)||!p.stations.length||p.stations.reduce((n,s)=>n+Number(s.requiredCount||0),0)>12||new Set(p.stations.map(s=>s.id)).size!==p.stations.length||p.stations.some(s=>!stations.has(s.id)||!Number.isInteger(s.requiredCount)||s.requiredCount<1||s.requiredCount>4))))) {
      return res.status(400).json({ error: 'Revise o catálogo de FPs.' });
    }
    if (!Array.isArray(extraPosts) || extraPosts.length > 8 || extraPosts.reduce((n,p)=>n+Number(p?.requiredCount||1),0)>12 || !Array.isArray(organizerIds) || organizerIds.length > 30 ||
        new Set(extraPosts.map(p => p?.id)).size !== extraPosts.length || new Set(organizerIds).size !== organizerIds.length ||
        extraPosts.some(p => !p || !/^\d{1,3}$/.test(p.id) || stations.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60 || (p.employeeId && !/^[0-9a-f-]{36}$/i.test(p.employeeId)) || p.requiredCount!==undefined&&(!Number.isInteger(p.requiredCount)||p.requiredCount<1||p.requiredCount>4) || p.employeeIds!==undefined&&(!Array.isArray(p.employeeIds)||p.employeeIds.length>4||p.employeeIds.some(id=>id&&!/^[0-9a-f-]{36}$/i.test(id))))) {
      return res.status(400).json({ error: 'Revise os postos adicionais.' });
    }
    for (const p of body.employees) {
      const name = String(p.name || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(p.id) || !name || name.length > 100 || !configuredSectors.includes(p.sector) || !roles.has(p.role || 'Operador') || !Array.isArray(p.allowed) || !p.allowed.length || p.allowed.some(s => !stations.has(s)) || p.fixed && !p.allowed.includes(p.fixed) || p.initial && !p.allowed.includes(p.initial) || p.noGlue && (p.allowed.length !== 1 || p.allowed[0] !== '30') || names.has(name.toLocaleLowerCase('pt-BR')) || typeof(p.registration||'')!=='string' || (p.registration||'').length>40 || typeof(p.notes||'')!=='string' || (p.notes||'').length>500 || !Array.isArray(p.restrictions||[]) || (p.restrictions||[]).some(r=>!r||!stations.has(r.stationId)||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>200||r.expiresOn&&!/^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn))) {
        return res.status(400).json({ error: 'Revise o cadastro de funcionários.' });
      }
      names.add(name.toLocaleLowerCase('pt-BR'));
      if(p.registration){if(registrations.has(p.registration))return res.status(400).json({error:'Matrícula duplicada.'});registrations.add(p.registration);}
    }
    const byId = new Map(body.employees.map(p => [p.id, p]));
    const assigned = extraPosts.flatMap(p=>p.employeeIds?.length?p.employeeIds:[p.employeeId]).filter(Boolean);
    if (new Set(assigned).size !== assigned.length || assigned.some(id => { const p = byId.get(id); return !p || !p.present || (p.role || 'Operador') !== 'Operador' || p.noGlue || p.fixed; }) ||
        organizerIds.some(id => { const p = byId.get(id); return !p || !p.present || p.role !== 'Assistente'; })) {
      return res.status(400).json({ error: 'Revise as pessoas atribuídas aos postos e à organização.' });
    }
    const input = JSON.stringify(body.employees.map(p => ({
      id: p.id, name: p.name.trim(), sector: p.sector, role: p.role || 'Operador', present: !!p.present, registration:p.registration||null,notes:p.notes||'',
      no_glue: !!p.noGlue, allowed: p.allowed, fixed: p.fixed || '',
      initial_station: p.initial || '', support_preckoff: !!p.supportPreckoff,
      support_needle: !!p.supportNeedle
    })));
    const restrictions=JSON.stringify(body.employees.flatMap(p=>(p.restrictions||[]).map(r=>({id:require('node:crypto').randomUUID(),employee_id:p.id,station_id:r.stationId,reason:r.reason,expires_on:r.expiresOn||null}))));
    const sectorRows=JSON.stringify(configuredSectors.map(name=>({id:require('node:crypto').randomUUID(),name})));
    const skills=JSON.stringify(body.employees.flatMap(p=>p.allowed.map(station_id=>({employee_id:p.id,station_id}))));
    const fpInput=JSON.stringify((fps||[]).map(p=>({id:p.id,code:p.fp,name:p.name,market:p.market,variation:p.variation,product:p.product||p.name,revision:p.revision,notes:p.notes||'',status:p.status||'Ativa'})));
    const fpSlots=JSON.stringify((fps||[]).flatMap(p=>(p.stations||[{id:'20',name:'BSD',requiredCount:1},{id:'30',name:'Clampe',requiredCount:1},{id:'40',name:'Preckoff',requiredCount:1},{id:'50',name:'Y',requiredCount:1},{id:'60',name:'Agulha',requiredCount:1},{id:'70',name:'Contagem',requiredCount:1}]).map((s,i)=>({fp_id:p.id,station_id:s.id,process:s.name,required_count:s.requiredCount,notes:s.notes||'',position:i}))));
    const shiftInput=JSON.stringify(shifts);
    const scheduleInput=JSON.stringify((config.history||[]).map(x=>({id:x.id,work_date:x.date,shift_name:x.shift,fp_id:x.fpId,fp_code:x.fp,product:x.product,status:x.status,notes:x.notes||'',snapshot:x.snapshot,created_at:x.createdAt,updated_at:x.updatedAt})));
    const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const schedulePositions=[];const assignments=[];const organizers=[];
    for(const h of config.history||[]){
      const stationIds=new Map();
      for(const p of [...h.snapshot.positions,...(h.snapshot.extraPosts||[])]){
        const stationId=require('node:crypto').randomUUID();stationIds.set(p.key,stationId);
        schedulePositions.push({id:stationId,schedule_id:h.id,station_id:p.key,process:p.name,required_count:1,notes:''});
      }
      for(const r of h.snapshot.rows.filter(r=>r.kind==='work')){
        for(const [index,p] of h.snapshot.positions.entries()){
          const person=h.snapshot.employees.find(x=>x.id===r.assign[index]);
          if(person)assignments.push({id:require('node:crypto').randomUUID(),schedule_id:h.id,station_key:p.key,employee_id:person.id,employee_name:person.name,start_time:clock(r.start),end_time:clock(r.end),fixed:!!h.snapshot.config?.locks?.[p.key]});
        }
        for(const p of h.snapshot.extraPosts||[]){const person=h.snapshot.employees.find(x=>x.id===p.employeeId);if(person)assignments.push({id:require('node:crypto').randomUUID(),schedule_id:h.id,station_key:p.key,employee_id:person.id,employee_name:person.name,start_time:clock(r.start),end_time:clock(r.end),fixed:true});}
      }
      for(const p of h.snapshot.organizers||[])organizers.push({schedule_id:h.id,employee_id:p.id,employee_name:p.name});
    }
    const positionInput=JSON.stringify(schedulePositions),assignmentInput=JSON.stringify(assignments),organizerInput=JSON.stringify(organizers);
    const queries=[
      sql`INSERT INTO sectors(id,name) SELECT id::uuid,name FROM jsonb_to_recordset(${sectorRows}::jsonb) AS x(id text,name text) ON CONFLICT(name) DO NOTHING`,
      sql`INSERT INTO app_settings (id, config, generated) VALUES (1, ${JSON.stringify(body.config)}::jsonb, ${!!body.generated}) ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, generated = EXCLUDED.generated, updated_at = now()`,
      sql`DELETE FROM employee_restrictions`,
      sql`DELETE FROM employee_skills`,
      sql`DELETE FROM employees WHERE id NOT IN (SELECT id::uuid FROM jsonb_to_recordset(${input}::jsonb) AS x(id text))`,
      sql`INSERT INTO employees (id, name, sector, sector_id, role, present, no_glue, allowed, fixed, initial_station, support_preckoff, support_needle, registration, notes)
          SELECT x.id::uuid, x.name, x.sector, s.id, x.role, x.present, x.no_glue, x.allowed, x.fixed, x.initial_station, x.support_preckoff, x.support_needle, x.registration, x.notes
          FROM jsonb_to_recordset(${input}::jsonb) AS x(id text, name text, sector text, role text, present boolean, no_glue boolean, allowed text[], fixed text, initial_station text, support_preckoff boolean, support_needle boolean, registration text, notes text)
          JOIN sectors s ON s.name=x.sector
          ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,sector=EXCLUDED.sector,sector_id=EXCLUDED.sector_id,role=EXCLUDED.role,present=EXCLUDED.present,no_glue=EXCLUDED.no_glue,allowed=EXCLUDED.allowed,fixed=EXCLUDED.fixed,initial_station=EXCLUDED.initial_station,support_preckoff=EXCLUDED.support_preckoff,support_needle=EXCLUDED.support_needle,registration=EXCLUDED.registration,notes=EXCLUDED.notes,updated_at=now()`,
      sql`INSERT INTO employee_skills(employee_id,station_id)
          SELECT employee_id::uuid,station_id FROM jsonb_to_recordset(${skills}::jsonb) AS x(employee_id text,station_id text)`,
      sql`INSERT INTO employee_restrictions(id,employee_id,station_id,reason,expires_on)
          SELECT id::uuid,employee_id::uuid,station_id,reason,expires_on::date FROM jsonb_to_recordset(${restrictions}::jsonb) AS x(id text,employee_id text,station_id text,reason text,expires_on text)`,
      sql`INSERT INTO shifts(id,name,start_time,end_time)
          SELECT id::uuid,name,start::time,"end"::time FROM jsonb_to_recordset(${shiftInput}::jsonb) AS x(id text,name text,start text,"end" text)
          ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,updated_at=now()`,
      sql`INSERT INTO fps(id,code,name,market,variation,product,revision,notes,status)
          SELECT id::uuid,code,name,market,variation,product,revision,notes,status FROM jsonb_to_recordset(${fpInput}::jsonb) AS x(id text,code text,name text,market text,variation text,product text,revision text,notes text,status text)
          ON CONFLICT(id) DO UPDATE SET code=EXCLUDED.code,name=EXCLUDED.name,market=EXCLUDED.market,variation=EXCLUDED.variation,product=EXCLUDED.product,revision=EXCLUDED.revision,notes=EXCLUDED.notes,status=EXCLUDED.status,updated_at=now()`,
      sql`DELETE FROM fp_stations`,
      sql`INSERT INTO fp_stations(fp_id,station_id,process,required_count,notes,position)
          SELECT fp_id::uuid,station_id,process,required_count,notes,position FROM jsonb_to_recordset(${fpSlots}::jsonb) AS x(fp_id text,station_id text,process text,required_count integer,notes text,position integer)`,
      sql`DELETE FROM fps WHERE id NOT IN (SELECT id::uuid FROM jsonb_to_recordset(${fpInput}::jsonb) AS x(id text))`
    ];
    if(body.operation==='clearSchedules')queries.push(sql`DELETE FROM schedules`);
    queries.push(sql`INSERT INTO schedules(id,work_date,shift_id,shift_name,fp_id,fp_code,product,status,notes,snapshot,created_at,updated_at)
      SELECT x.id::uuid,x.work_date::date,sh.id,x.shift_name,x.fp_id::uuid,x.fp_code,x.product,x.status,x.notes,x.snapshot,x.created_at::timestamptz,x.updated_at::timestamptz
      FROM jsonb_to_recordset(${scheduleInput}::jsonb) AS x(id text,work_date text,shift_name text,fp_id text,fp_code text,product text,status text,notes text,snapshot jsonb,created_at text,updated_at text)
      LEFT JOIN shifts sh ON sh.name=x.shift_name
      ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes,updated_at=EXCLUDED.updated_at`);
    queries.push(sql`INSERT INTO schedule_stations(id,schedule_id,station_id,process,required_count,notes)
      SELECT id::uuid,schedule_id::uuid,station_id,process,required_count,notes
      FROM jsonb_to_recordset(${positionInput}::jsonb) AS x(id text,schedule_id text,station_id text,process text,required_count integer,notes text)
      ON CONFLICT(schedule_id,station_id) DO NOTHING`);
    queries.push(sql`INSERT INTO schedule_employees(id,schedule_station_id,employee_id,employee_name,start_time,end_time,fixed)
      SELECT x.id::uuid,s.id,e.id,x.employee_name,x.start_time::time,x.end_time::time,x.fixed
      FROM jsonb_to_recordset(${assignmentInput}::jsonb) AS x(id text,schedule_id text,station_key text,employee_id text,employee_name text,start_time text,end_time text,fixed boolean)
      JOIN schedule_stations s ON s.schedule_id=x.schedule_id::uuid AND s.station_id=x.station_key
      LEFT JOIN employees e ON e.id=x.employee_id::uuid
      ON CONFLICT(schedule_station_id,start_time,end_time,employee_name) DO NOTHING`);
    queries.push(sql`INSERT INTO schedule_organizers(schedule_id,employee_id,employee_name)
      SELECT x.schedule_id::uuid,e.id,x.employee_name
      FROM jsonb_to_recordset(${organizerInput}::jsonb) AS x(schedule_id text,employee_id text,employee_name text)
      LEFT JOIN employees e ON e.id=x.employee_id::uuid
      ON CONFLICT(schedule_id,employee_name) DO NOTHING`);
    await sql.transaction(queries);
    return res.status(200).json({ saved: true });
  } catch (error) {
    console.error('Database request failed:', error);
    return res.status(500).json({ error: 'Não foi possível acessar o banco SQL. Nenhum dado foi confirmado.' });
  }
};
