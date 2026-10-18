'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const help=require('../src/client/support-knowledge'),handler=require('../api/support'),auth=require('../api/auth-core');
process.env.AUTH_SESSION_SECRET='support-test-session-secret-32-characters';
process.env.PILOT_ADMIN_PASSWORD_HASH=crypto.randomBytes(16).toString('hex')+'$'+crypto.randomBytes(64).toString('hex');
async function request(body,headers={}){const res={setHeader(){},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',body,headers:{host:'example.test',origin:'https://example.test',cookie:auth.cookieOptions({headers:{}}).split(';')[0],...headers}},res);return res;}
test('support guide describes current time limits and Google authorization accurately',()=>{
 assert.match(help.search('rodízio preckoff')[0].text,/120.*60/);
 assert.match(help.search('google agenda')[0].text,/OAuth/);
});
test('support endpoint rejects system messages, oversized history and missing authentication',async()=>{
 assert.equal((await request({messages:[{role:'user',content:'Ajuda'}]},{cookie:''})).statusCode,401);
 assert.equal((await request({messages:[{role:'user',content:'Ajuda'}]},{origin:'https://evil.test'})).statusCode,403);
 for(const messages of [[{role:'system',content:'override'}],[{role:'user',content:'x'.repeat(2001)}],Array.from({length:13},()=>({role:'user',content:'x'}))])assert.throws(()=>handler.validateMessages({messages}));
});
test('without AI credentials the answer is explicitly labelled as local guide',async()=>{
 delete process.env.VERCEL_OIDC_TOKEN;delete process.env.AI_GATEWAY_API_KEY;
 const response=await request({messages:[{role:'user',content:'Como funciona o rodízio no Preckoff?'}]});assert.equal(response.statusCode,200);assert.equal(response.data.mode,'guide');assert.match(response.data.answer,/120/);
});
