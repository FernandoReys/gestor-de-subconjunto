'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const auth = require('../api/auth-core');
process.env.AUTH_SESSION_SECRET = 'desktop-api-tests-only-with-32-characters';
process.env.PILOT_ADMIN_PASSWORD_HASH = `${crypto.randomBytes(16).toString('hex')}$${crypto.randomBytes(64).toString('hex')}`;
let database;
const original = Module._load;
Module._load = function(id,...args) {
  if(id==='@neondatabase/serverless')return {neon:()=>async(strings,...values)=>{
    const text=strings.reduce((result,part,index)=>result+(index?'$'+index:'')+part,'');
    return (await database.query(text,values)).rows;
  }};
  return original.call(this,id,...args);
};
const handler = require('../api/desktop-sync'); Module._load=original;
async function request(method, body, headers = {}) {
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.data=value;return this;}};
  await handler({method,url:'/api/desktop-sync.js?cursor=0',body,headers:{host:'example.com',origin:'https://example.com',cookie:auth.cookieOptions({headers:{}}).split(';')[0],...headers}},res);
  return res;
}
test('authenticated endpoint fails closed, validates input, and syncs against PostgreSQL', async () => {
  database=new PGlite();
  try {
    await database.exec(fs.readFileSync('db/migrations/003_desktop_sync.sql','utf8'));
    assert.equal((await request('GET',null,{cookie:''})).statusCode,401);
    assert.equal((await request('POST',{}, {origin:'https://attacker.invalid'})).statusCode,403);
    assert.equal((await request('GET')).statusCode,503);
    process.env.DESKTOP_SYNC_ENABLED='1';process.env.DESKTOP_DATABASE_URL='postgres://test-only';
    assert.equal((await request('POST',{})).statusCode,400);
    const body={id:crypto.randomUUID(),deviceId:crypto.randomUUID(),baseRevision:0,createdAt:new Date().toISOString(),state:{config:{},employees:[]}};
    const first=await request('POST',body);assert.equal(first.statusCode,200);assert.equal(first.data.revision,1);
    assert.equal((await request('POST',body)).data.duplicate,true);
    const conflict=await request('POST',{...body,id:crypto.randomUUID()});assert.equal(conflict.statusCode,409);assert.deepEqual(conflict.data.state,body.state);
    const pull=await request('GET');assert.equal(pull.data.revision,1);assert.equal(pull.data.authorId,'fernando');
    assert.equal(pull.headers['Cache-Control'],'no-store');
  }finally{await database.close();delete process.env.DESKTOP_DATABASE_URL;delete process.env.DESKTOP_SYNC_ENABLED;}
});
