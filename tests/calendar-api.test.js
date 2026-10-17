'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const auth=require('../api/auth-core'),handler=require('../api/calendar-export');
process.env.AUTH_SESSION_SECRET='calendar-test-only-with-32-characters-long';process.env.PILOT_ADMIN_PASSWORD_HASH=crypto.randomBytes(16).toString('hex')+'$'+crypto.randomBytes(64).toString('hex');
async function request(method,body,headers={}){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};await handler({method,body,headers:{host:'example.com',origin:'https://example.com',cookie:auth.cookieOptions({headers:{}}).split(';')[0],...headers}},res);return res;}
test('calendar API requires session and same origin, and reports missing configuration honestly',async()=>{
 assert.equal((await request('GET',null,{cookie:''})).statusCode,401);
 assert.equal((await request('POST',{action:'authorize'},{origin:'https://attacker.invalid'})).statusCode,403);
 const status=await request('GET');assert.equal(status.statusCode,200);assert.equal(status.data.configured,false);
 assert.equal((await request('POST',{action:'authorize'})).statusCode,503);
});
