'use strict';
const {app,BrowserWindow,session}=require('electron');
const crypto=require('node:crypto'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const salt=crypto.randomBytes(16),password=crypto.randomBytes(24).toString('hex');
process.env.AUTH_SESSION_SECRET=crypto.randomBytes(40).toString('hex');
process.env.PILOT_ADMIN_PASSWORD_HASH=salt.toString('hex')+'$'+crypto.scryptSync(password,salt,64).toString('hex');
delete process.env.DATABASE_URL;delete process.env.DESKTOP_DATABASE_URL;delete process.env.DESKTOP_SYNC_ENABLED;delete process.env.VERCEL_OIDC_TOKEN;delete process.env.AI_GATEWAY_API_KEY;
const server=require('../server');
const timer=setTimeout(()=>{console.error('Web UI check timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const cookie=require('../api/auth-core').cookieOptions({headers:{}}).split(';')[0].split('=');
  await session.defaultSession.cookies.set({url:origin,name:cookie[0],value:cookie[1],httpOnly:true,path:'/'});
  const win=new BrowserWindow({width:1440,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
  await win.loadURL(origin);
  const run=code=>win.webContents.executeJavaScript(code);
  const paint=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await run(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(document.querySelector('#nav a[href="#agenda"]')&&storageMode!=='loading')resolve();else if(Date.now()>end)reject(new Error('Web bootstrap failed'));else setTimeout(check,25);};check();})`);
  assert.equal(await run(`!!document.querySelector('#nav a[href="#support"]')`),true);
  const directory=path.join(__dirname,'../verification');fs.mkdirSync(directory,{recursive:true});
  async function capture(name){await paint();fs.writeFileSync(path.join(directory,name),(await win.webContents.capturePage()).toPNG());}
  await run(`location.hash='#agenda'`);await paint();
  assert.equal(await run(`document.querySelectorAll('.agenda-day').length`),7);
  assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`),true);
  await capture('web-agenda-light.png');
  await run(`document.querySelector('#sidebarToggle').click()`);await paint();
  assert.equal(await run(`document.body.classList.contains('sidebar-collapsed')`),true);
  await capture('web-sidebar-collapsed.png');
  await run(`document.querySelector('#sidebarToggle').click();document.querySelector('[data-action="theme"]').click();location.hash='#support'`);await paint();
  assert.equal(await run(`document.body.dataset.theme`),'dark');
  await run(`document.querySelector('#supportQuestion').value='Como funciona o rodízio no Preckoff?';document.querySelector('#supportForm').requestSubmit()`);
  await run(`new Promise((resolve,reject)=>{const end=Date.now()+10000;const check=()=>{if(!supportBusy&&supportConversation.length===2)resolve();else if(Date.now()>end)reject(new Error('Support failed'));else setTimeout(check,25);};check();})`);
  assert.equal(await run(`supportConversation.at(-1).mode`),'guide');
  await capture('web-support-dark.png');
  win.setSize(390,844);await paint();
  assert.equal(await run(`document.documentElement.scrollWidth<=innerWidth`),true);
  await run(`document.querySelector('#menuButton').click()`);await paint();
  assert.equal(await run(`document.querySelector('#sidebar').classList.contains('open')`),true);
  await capture('web-mobile-menu.png');
  console.log('WEB UI: authenticated bootstrap, weekly agenda, collapse/expand, dark theme, support fallback, mobile menu and no horizontal page overflow: OK');
  clearTimeout(timer);server.close();app.exit(0);
 }catch(error){console.error(error);clearTimeout(timer);server.close();app.exit(1);}
});
