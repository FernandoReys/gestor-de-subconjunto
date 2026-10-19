'use strict';
const auth = require('./auth-core');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Método inválido.' });
  if (!auth.configured()) return res.status(503).json({ error: 'Acesso ainda não configurado.' });
  if (req.method === 'GET') { const user = await auth.currentUser(req); return user ? res.status(200).json({...user,securityV2:require('./identity').enabled()}) : res.status(401).json({ error: 'Faça login para continuar.',passwordRecovery:require('./identity').enabled() }); }
  if (!auth.sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
  if (req.method === 'DELETE') { if(require('./identity').enabled()){const user=await auth.currentUser(req);if(user)await require('./identity').logout(user);} res.setHeader('Set-Cookie', auth.cookieOptions(req, true)); return res.status(200).json({ signedOut: true }); }
  if (!auth.rateLimit(req)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  let body; try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return res.status(400).json({ error: 'Dados inválidos.' }); }
  if(require('./identity').enabled()&&body.action==='reset'){
   try{if(typeof body.username!=='string'||typeof body.code!=='string'||body.code.length>100)return res.status(400).json({error:'Código inválido.'});const I=require('./identity'),hash=await I.hash(body.password),token=require('node:crypto').createHash('sha256').update(body.code).digest('hex');const ok=(await I.db()`SELECT gestor_reset_password(${body.username},${token},${hash}) AS ok`)[0].ok;return res.status(ok?200:400).json(ok?{reset:true}:{error:'Código inválido ou expirado.'});}catch{return res.status(400).json({error:'Não foi possível redefinir. Verifique o código e a senha (mínimo 12 caracteres).'});}
  }
  if(require('./identity').enabled()){
   try{const user=await require('./identity').login(body.username,body.password,req);if(!user)return res.status(401).json({error:'Usuário ou senha inválidos.'});res.setHeader('Set-Cookie',auth.cookieOptions(req,false,user));return res.status(200).json({...user,securityV2:true});}catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Autenticação indisponível.'});}
  }
  if (body.username !== 'fernando' || !auth.verifyPassword(body.password)) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
  res.setHeader('Set-Cookie', auth.cookieOptions(req));
  return res.status(200).json({ username: 'fernando', role: 'Administrador' });
};
