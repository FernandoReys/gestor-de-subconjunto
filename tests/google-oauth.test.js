'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),{PGlite}=require('@electric-sql/pglite');
let database;const original=Module._load;Module._load=function(id,...args){if(id==='@neondatabase/serverless')return {neon:()=>async(strings,...values)=>(await database.query(strings.reduce((a,b,i)=>a+(i?'$'+i:'')+b,''),values)).rows};return original.call(this,id,...args);};
const store=require('../api/integration-store'),oauth=require('../api/google-oauth-core'),auth=require('../api/auth-core');Module._load=original;
test('OAuth state + PKCE + browser binding, encrypted refresh, reconnection and revocation preserve calendar',async()=>{
 database=new PGlite();const originalFetch=global.fetch;
 Object.assign(process.env,{AUTH_SESSION_SECRET:'oauth-test-only-signing-secret-longer-than32',PILOT_ADMIN_PASSWORD_HASH:'00'.repeat(16)+'$'+'00'.repeat(64),DESKTOP_SYNC_ENABLED:'1',DESKTOP_DATABASE_URL:'postgres://test-only',GOOGLE_CLIENT_ID:'test-id',GOOGLE_CLIENT_SECRET:'test-secret',APP_ORIGIN:'https://example.test'});delete process.env.AUTH_USERS_ENABLED;
 try{
  for(const name of ['003_desktop_sync.sql','005_identity_audit.sql','006_integrations.sql'])await database.exec(fs.readFileSync('db/migrations/'+name,'utf8'));
  let tokenCalls=0,calendars=0,revoked=0;global.fetch=async(url,options)=>{
   if(url.includes('/token')){tokenCalls++;assert.ok(options.body.get('code_verifier')||options.body.get('refresh_token'));return {ok:true,json:async()=>({access_token:'access-private',refresh_token:'refresh-private',expires_in:3600,scope:oauth.scope})};}
   if(url.includes('/revoke')){revoked++;return {ok:true};}
   calendars++;return {ok:true,json:async()=>({id:'dedicated-calendar'})};
  };
  const user={username:'fernando',role:'Administrador'},req={headers:{cookie:auth.cookieOptions({headers:{}}).split(';')[0]}};
  const start=await oauth.start(req,user),url=new URL(start.url),nonce=start.cookie.split(';')[0];assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),'https://example.test/api/google-callback.js');assert.equal(url.searchParams.get('scope'),oauth.scope);
  const callback={url:'/api/google-callback.js?code=test-code&state='+url.searchParams.get('state'),headers:{cookie:nonce}};
  await assert.rejects(oauth.callback({...callback,headers:{cookie:'gestor_google_nonce=wrong'}}));
  assert.equal(await oauth.callback(callback),'connected');assert.equal(calendars,1);await assert.rejects(oauth.callback(callback),'replay rejected');
  const row=await oauth.connection(user);assert.equal(row.calendar_id,'dedicated-calendar');assert.ok(!row.tokens.includes('refresh-private'));assert.throws(()=>oauth.open(row.tokens,'different-owner'));
  await database.query('UPDATE gestor_google_connections SET tokens=$1',[oauth.seal({access_token:'expired',refresh_token:'refresh-private',expires_at:0},'fernando')]);assert.equal(await oauth.token(user),'access-private');assert.equal(tokenCalls,2);
  await oauth.disconnect(user);assert.equal(revoked,1);assert.equal((await oauth.connection(user)).calendar_id,'dedicated-calendar');assert.equal(oauth.open((await oauth.connection(user)).tokens,'fernando').disconnected,true);
  const again=await oauth.start(req,user);assert.equal(await oauth.callback({url:'/api/google-callback.js?code=again&state='+new URL(again.url).searchParams.get('state'),headers:{cookie:again.cookie.split(';')[0]}}),'connected');assert.equal(calendars,1,'reconnection must not duplicate calendar');
  assert.ok(await store.budget(user));for(let i=0;i<9;i++)assert.ok(await store.budget(user));assert.equal(await store.budget(user),false,'persistent per-minute cap');
  await assert.rejects(database.query('UPDATE gestor_integration_audit SET status=$1',['forged']));
 }finally{global.fetch=originalFetch;await database.close();for(const key of ['DESKTOP_SYNC_ENABLED','DESKTOP_DATABASE_URL','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','APP_ORIGIN'])delete process.env[key];}
});
