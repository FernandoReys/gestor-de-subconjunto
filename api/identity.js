'use strict';
const crypto=require('node:crypto');
const {neon}=require('@neondatabase/serverless');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const enabled=()=>process.env.AUTH_USERS_ENABLED==='1';
const db=()=>{if(!process.env.DESKTOP_DATABASE_URL)throw new Error('Banco de identidades não configurado.');return neon(process.env.DESKTOP_DATABASE_URL);};
async function hash(password){if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('A senha deve ter de 12 a 256 caracteres.');const salt=crypto.randomBytes(16);return 'scrypt$131072$8$1$'+salt.toString('hex')+'$'+(await scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024})).toString('hex');}
async function verify(password,encoded){if(typeof password!=='string'||password.length>256)return false;let salt,key,options;if(/^scrypt\$131072\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded||'')){const parts=encoded.split('$');salt=parts[4];key=parts[5];options={N:131072,r:8,p:1,maxmem:256*1024*1024};}else if(/^[0-9a-f]{32}\$[0-9a-f]{128}$/.test(encoded||'')){[salt,key]=encoded.split('$');}else return false;const actual=await scrypt(password,Buffer.from(salt,'hex'),64,options);return crypto.timingSafeEqual(actual,Buffer.from(key,'hex'));}

const publicUser=u=>({id:u.id,username:u.username,fullName:u.full_name,role:u.role,version:u.session_version,active:u.active});
async function bootstrap(){const sql=db();await sql`INSERT INTO gestor_users(username,full_name,password_hash,role) SELECT 'fernando','Administrador inicial',${process.env.PILOT_ADMIN_PASSWORD_HASH},'Administrador' WHERE NOT EXISTS(SELECT 1 FROM gestor_users) ON CONFLICT DO NOTHING`;}
async function resolve(payload){const sql=db();if(payload.sub==='fernando'&&!payload.uid){await bootstrap();const rows=await sql`SELECT * FROM gestor_users WHERE username='fernando' AND active AND session_version=0`;return rows[0]?publicUser(rows[0]):null;}if(!payload.uid||!payload.sid)return null;const rows=await sql`SELECT u.* FROM gestor_users u JOIN gestor_sessions s ON s.user_id=u.id WHERE u.id=${payload.uid}::uuid AND s.id=${payload.sid}::uuid AND u.active AND s.expires_at>now() AND s.version=u.session_version AND u.session_version=${payload.ver}`;return rows[0]?{...publicUser(rows[0]),sid:payload.sid}:null;}
async function login(username,password,req){
 if(typeof username!=='string'||!/^[a-z0-9_.-]{3,60}$/.test(username))return null;
 const sql=db(),key=crypto.createHash('sha256').update(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0]+'|'+username).digest('hex');
 const limits=await sql`INSERT INTO gestor_login_limits(key,count,until_time) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN gestor_login_limits.until_time<now() THEN 1 ELSE gestor_login_limits.count+1 END,until_time=CASE WHEN gestor_login_limits.until_time<now() THEN now()+interval '15 minutes' ELSE gestor_login_limits.until_time END RETURNING count`;
 if(limits[0].count>5){const error=new Error('Muitas tentativas. Aguarde 15 minutos.');error.status=429;throw error;}
 await bootstrap();const rows=await sql`SELECT * FROM gestor_users WHERE username=${username} AND active`;
 const user=rows[0];const good=await verify(password,user?.password_hash||process.env.PILOT_ADMIN_PASSWORD_HASH);
 if(!user||!good){await sql`INSERT INTO gestor_audit(actor_id,action,module,source,status) VALUES(${user?.id||null}::uuid,'login','auth','web','failure')`;return null;}
 const upgrade=user.password_hash.startsWith('scrypt$')?null:await hash(password);
 const sid=crypto.randomUUID();await sql.transaction([...(upgrade?[sql`UPDATE gestor_users SET password_hash=${upgrade},updated_at=now() WHERE id=${user.id}::uuid`]:[]),sql`INSERT INTO gestor_sessions(id,user_id,version,expires_at) VALUES(${sid}::uuid,${user.id}::uuid,${user.session_version},now()+interval '8 hours')`,sql`INSERT INTO gestor_audit(actor_id,action,module,source,status) VALUES(${user.id}::uuid,'login','auth','web','success')`]);return {...publicUser(user),sid};
}
async function logout(user){const sql=db();await sql.transaction([user.sid?sql`DELETE FROM gestor_sessions WHERE id=${user.sid}::uuid`:sql`UPDATE gestor_users SET session_version=session_version+1 WHERE id=${user.id}::uuid`,sql`INSERT INTO gestor_audit(actor_id,action,module,source,status) VALUES(${user.id}::uuid,'logout','auth','web','success')`]);}
module.exports={enabled,db,hash,verify,publicUser,bootstrap,resolve,login,logout};
