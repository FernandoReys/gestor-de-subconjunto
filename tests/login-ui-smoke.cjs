'use strict';
const {app,BrowserWindow}=require('electron'),{PGlite}=require('@electric-sql/pglite'),Module=require('node:module'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
app.disableHardwareAcceleration();
let db,server;const timer=setTimeout(()=>{console.error('LOGIN UI timeout');app.exit(1);},90000);
app.whenReady().then(async()=>{try{
 db=new PGlite();for(const file of ['003_desktop_sync.sql','005_identity_audit.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations',file),'utf8'));
 const original=Module._load;Module._load=function(id,...args){if(id==='@neondatabase/serverless')return {neon:()=>{const sql=async(strings,...values)=>(await db.query(strings.reduce((s,x,i)=>s+(i?'$'+i:'')+x,''),values)).rows;sql.transaction=queries=>Promise.all(queries);return sql;}};return original.call(this,id,...args);};
 Object.assign(process.env,{AUTH_USERS_ENABLED:'1',DESKTOP_SYNC_ENABLED:'1',DESKTOP_DATABASE_URL:'postgres://isolated-login-ui',AUTH_SESSION_SECRET:crypto.randomBytes(40).toString('hex')});delete process.env.DATABASE_URL;delete process.env.OPENAI_API_KEY;
 const identity=require('../api/identity'),password=crypto.randomBytes(24).toString('hex');process.env.PILOT_ADMIN_PASSWORD_HASH=await identity.hash(password);
 server=require('../server');for(const name of ['auth','auth-core','desktop-sync','runtime','users','audit','approvals'])require('../api/'+name);Module._load=original;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const win=new BrowserWindow({width:1920,height:1080,show:false,frame:false,enableLargerThanScreen:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
 const run=code=>win.webContents.executeJavaScript(code),wait=condition=>run(`new Promise((resolve,reject)=>{const until=Date.now()+15000;function tick(){if(${condition})resolve();else if(Date.now()>until)reject(new Error('Condition timed out'));else setTimeout(tick,30);}tick();})`),paint=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const csp=[];win.webContents.on('console-message',(_e,...args)=>{if(args.join(' ').includes('Content Security Policy'))csp.push(args.join(' '));});
 await win.loadURL(origin+'/#history');await wait("!document.querySelector('#loginScreen').hidden&&!document.querySelector('#loginRecovery').hidden");await run('document.fonts.ready');await paint();
 assert.equal(await run('authenticated'),false);assert.equal(await run("document.querySelector('main').getBoundingClientRect().height"),0);assert.equal(await run("document.querySelector('#loginPassword').type"),'password');
 assert.equal((await fetch(origin+'/api/desktop-sync.js')).status,401);
 const mainHeaders=await fetch(origin);assert.match(mainHeaders.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(mainHeaders.headers.get('x-frame-options'),'DENY');
 for(const [width,height,name]of [[1920,1080,'desktop'],[1366,768,'notebook'],[768,1024,'tablet'],[390,844,'mobile'],[320,740,'small']]){
  win.setContentSize(width,height);await paint();assert.equal(await run('innerWidth'),width,'exact viewport');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,'no horizontal overflow at '+width);
  const button=await run("(()=>{const r=document.querySelector('#loginSubmit').getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom}})()");assert.ok(button.left>=0&&button.right<=width);
  fs.mkdirSync(path.join(__dirname,'../verification'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../verification/web-login-'+name+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 win.setContentSize(1920,1080);await paint();
 await run("document.querySelector('#loginPasswordToggle').click()");assert.equal(await run("document.querySelector('#loginPassword').type"),'text');assert.equal(await run("document.querySelector('#loginPasswordToggle').getAttribute('aria-label')"),'Ocultar senha');await run("document.querySelector('#loginPasswordToggle').click()");
 await run("document.querySelector('#loginUsername').focus()");win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await paint();assert.equal(await run('document.activeElement.id'),'loginPassword');
 await run("document.querySelector('#loginUsername').value='fernando';document.querySelector('#loginPassword').value='invalid-ephemeral-password';document.querySelector('#loginForm').requestSubmit()");await wait("document.querySelector('#loginError').textContent.length>0&&document.querySelector('#loginForm').getAttribute('aria-busy')==='false'");assert.match(await run("document.querySelector('#loginError').textContent"),/Usuário ou senha inválidos/);assert.equal(await run('authenticated'),false);
 await run("document.querySelector('#loginRecovery').click()");assert.equal(await run("document.querySelector('#employeeDialog').open"),true);assert.ok(await run("document.querySelector('#employeeDialog').getBoundingClientRect().height>0"),'functional recovery dialog visible before login');await run("document.querySelector('#employeeDialog').close()");
 await run(`document.querySelector('#loginPassword').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit()`);assert.equal(await run("document.querySelector('#loginSubmit').disabled"),true);await wait("authenticated&&storageMode==='sql'&&document.querySelector('#loginScreen').hidden");assert.equal(await run('location.hash'),'#overview');assert.equal(await run('currentUser.role'),'Administrador');
 const cookies=await win.webContents.session.cookies.get({url:origin});assert.ok(cookies.some(x=>x.name==='gestor_session'&&x.httpOnly));
 await win.reload();await wait("authenticated&&storageMode==='sql'");assert.equal(await run("document.querySelector('#loginScreen').hidden"),true,'session persists securely through reload');
 await run("document.querySelector('#logoutButton').click()");await wait("!authenticated&&!document.querySelector('#loginScreen').hidden");assert.equal((await db.query('SELECT count(*)::int AS n FROM gestor_sessions')).rows[0].n,0,'logout revokes session on server');await win.reload();await wait("!document.querySelector('#loginScreen').hidden");assert.equal(await run('authenticated'),false);
 await run("document.body.dataset.theme='dark'");await paint();fs.writeFileSync(path.join(__dirname,'../verification/web-login-dark.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(csp.length,0,'no CSP regression: '+csp.join('\n'));
 console.log('LOGIN UI PASS: actual isolated SQL login, invalid credentials, cookie, reload, logout, protected data, keyboard, recovery, CSP and five viewport sizes');
 clearTimeout(timer);win.destroy();server.close();await db.close();app.exit(0);
}catch(error){console.error(error.stack||error);clearTimeout(timer);server?.close();app.exit(1);}});
