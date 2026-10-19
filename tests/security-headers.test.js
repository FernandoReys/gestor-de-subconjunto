'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{headers,csp}=require('../shared/security-headers.cjs');
test('web security policy protects scripts, framing and browser capabilities without disrupting OAuth navigation',()=>{
 assert.match(csp,/script-src 'self';/);assert.doesNotMatch(csp,/script-src[^;]*(unsafe-inline|unsafe-eval)/);assert.match(csp,/frame-ancestors 'none'/);assert.equal(headers['X-Frame-Options'],'DENY');assert.equal(headers['Referrer-Policy'],'no-referrer');
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));const deployed=Object.fromEntries(config.headers[0].headers.map(x=>[x.key,x.value]));assert.equal(deployed['Content-Security-Policy'],csp+'; upgrade-insecure-requests');assert.equal(config.git.deploymentEnabled['feature/login-profissional'],false);
 for(const file of ['src/client/index.html','src/client/login.css','src/client/login-ui.js']){const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/(?:src|href)=["']http:\/\//);assert.doesNotMatch(text,/sk-[a-zA-Z0-9]{20,}/);}
});
