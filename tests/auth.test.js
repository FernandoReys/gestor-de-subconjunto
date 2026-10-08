'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const auth=require('../api/auth'),state=require('../api/state');
const salt=crypto.randomBytes(16);
process.env.PILOT_ADMIN_PASSWORD_HASH=`${salt.toString('hex')}$${crypto.scryptSync('example-test-password',salt,64).toString('hex')}`;
process.env.AUTH_SESSION_SECRET='test-secret-with-at-least-thirty-two-characters';
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(x){this.data=x;return this}}}
function request(method,body,cookie='',origin='http://localhost:3000'){return {method,body,headers:{host:'localhost:3000',origin,cookie}}}
test('login protects state and uses a signed HttpOnly cookie',async()=>{
 const denied=response();await state(request('GET'),denied);assert.equal(denied.statusCode,401);
 const invalid=response();await auth(request('POST',{username:'fernando',password:'wrong'}),invalid);assert.equal(invalid.statusCode,401);
 const login=response();await auth(request('POST',{username:'fernando',password:'example-test-password'}),login);assert.equal(login.statusCode,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
 const cookie=login.headers['Set-Cookie'].split(';')[0];
 const valid=response();await auth(request('GET',null,cookie),valid);assert.equal(valid.statusCode,200);
 const tampered=response();await auth(request('GET',null,cookie+'x'),tampered);assert.equal(tampered.statusCode,401);
 const crossOrigin=response();await state(request('PUT',{},cookie,'https://attacker.example'),crossOrigin);assert.equal(crossOrigin.statusCode,403);
 const logout=response();await auth(request('DELETE',null,cookie),logout);assert.match(logout.headers['Set-Cookie'],/Max-Age=0/);
});
