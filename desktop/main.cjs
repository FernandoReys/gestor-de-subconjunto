'use strict';
const { app, BrowserWindow, protocol, net, ipcMain, safeStorage, dialog, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Store } = require('./store.cjs');
const { Sync } = require('./sync.cjs');
const { validateServer } = require('./config.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'gestor', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
let win, store, sync, server, credential, calendarSync, calendarTimer;
const reply = (status, data) => ({ status, data });
function active() { return credential && credential.expires > Date.now() && credential.server === server; }
function saveCredential(value) {
  const file = path.join(app.getPath('userData'), 'session.bin');
  if (!value) { fs.rmSync(file, { force: true }); credential = null; return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Proteção de credenciais do Windows indisponível.');
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 }); credential = value;
}
async function remote(endpoint, method = 'GET', body) {
  if (!server) throw new Error('Configure o servidor HTTPS para autenticar e sincronizar.');
  const response = await fetch(server + endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Origin: server, 'Content-Type': 'application/json', ...(credential ? { Cookie: credential.cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  return { response, data };
}
async function request(endpoint, options = {}) {
  const method = options.method || 'GET';
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) throw new Error('Método inválido.');
  if (endpoint === '/api/auth.js') {
    if (method === 'DELETE') { saveCredential(null); return reply(200, { signedOut: true }); }
    if (method === 'GET') return active() ? reply(200, credential.user) : reply(401, { error: 'Entre online para autorizar este computador por até 8 horas.' });
    if (method !== 'POST') return reply(405, {});
    const body = JSON.parse(options.body);
    server = validateServer(body.server || server);
    const oldServer = store.get('server');
    if (oldServer && oldServer !== server && store.get('state')) throw new Error('Este banco pertence a outro servidor. Use outro perfil do Windows.');
    const { response, data } = await remote('/api/auth.js', 'POST', { username: body.username, password: body.password });
    if (!response.ok) return reply(response.status, data);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    if (!cookie?.startsWith('gestor_session=')) throw new Error('Servidor não retornou uma sessão válida.');
    const payload = JSON.parse(Buffer.from(cookie.slice('gestor_session='.length).split('.')[0], 'base64url').toString());
    saveCredential({ cookie, user: data, server, expires: payload.exp * 1000 });
    store.set('server', server);
    await sync.run();
    return reply(200, data);
  }
  if(endpoint==='/api/calendar-export.js'){
    if(!active())return reply(401,{error:'Entre no Gestor para conectar o Google Agenda.'});
    if(!['GET','POST'].includes(method))return reply(405,{});
    const body=options.body?JSON.parse(options.body):undefined;
    if(['publish','resolve'].includes(body?.action)){
      await sync.run();if(store.head()||store.get('conflict'))return reply(409,{error:'Sincronize e resolva as versões do Gestor antes de enviar ao Google.'});
    }
    const {response,data}=await remote(endpoint,method,body);
    if(response.ok&&data.url){const target=new URL(data.url);if(target.protocol!=='https:'||!['connect.vercel.com','accounts.google.com','vercel.com'].includes(target.hostname))throw new Error('Endereço de autorização não permitido.');await shell.openExternal(target.href);}
    return reply(response.status,data);
  }
  if (endpoint !== '/api/state.js') throw new Error('Endpoint não permitido.');
  if (!active()) return reply(401, { error: 'Sessão expirada. Autentique novamente online.' });
  if (method === 'GET') return reply(200, store.get('state') || { config: {}, employees: [], generated: false });
  if (method !== 'PUT') return reply(405, {});
  const body = JSON.parse(options.body);
  require('../shared/state-contract.cjs').validateState(body);
  store.save(body); publish(); void sync.run();
  return reply(200, { saved: true });
}
function visibleStatus() { const value=sync.status(); if(!active()) value.conflict=value.conflict?{revision:value.conflict.revision}:null; return value; }
function publish() { if (win && !win.isDestroyed()) win.webContents.send('desktop:status', visibleStatus()); }
function guard(event) { if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame || !event.senderFrame.url.startsWith('gestor://app/')) throw new Error('Origem IPC inválida.'); }
function handle(channel, fn) { ipcMain.handle(channel, async (event, ...args) => { guard(event); return fn(...args); }); }
app.whenReady().then(async () => {
  const home = app.getPath('userData'); fs.mkdirSync(home, { recursive: true });
  store = new Store(path.join(home, 'gestor.sqlite'));
  server = store.get('server');
  try { credential = JSON.parse(safeStorage.decryptString(fs.readFileSync(path.join(home, 'session.bin')))); } catch { credential = null; }
  sync = new Sync(store, async (method, body, cursor) => {
    if (!active()) { const e = new Error('Autenticação online necessária.'); e.status = 401; throw e; }
    const { response, data } = await remote('/api/desktop-sync.js' + (method === 'GET' ? '?cursor=' + cursor : ''), method, body);
    if (!response.ok && !(response.status === 409 && data.conflict && data.state)) { const e = new Error(data.error || 'Falha na sincronização.'); e.status = response.status; throw e; }
    return data;
  }, value=>{publish();if(value.connection==='online'&&active())void calendarSync?.run();});
  calendarSync=new (require('./calendar-sync.cjs').CalendarSync)(store,remote);
  protocol.handle('gestor', async request => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const root = path.resolve(__dirname, '../dist');
    const file = path.resolve(root, '.' + relative);
    if (url.host !== 'app' || !file.startsWith(root + path.sep)) return new Response('', { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'");
    return new Response(response.body, { status: response.status, headers });
  });
  handle('desktop:request', request);
  handle('desktop:calendar-sync',async()=>{if(!active())throw new Error('Entre novamente no Gestor.');await sync.run();if(store.head()||store.get('conflict'))throw new Error('Há alterações pendentes ou conflito no Gestor.');await calendarSync.run();if(calendarSync.error)throw new Error(calendarSync.error);return true;});
  handle('desktop:status', () => ({ ...visibleStatus(), server }));
  handle('desktop:retry', async () => { await sync.run(); return visibleStatus(); });
  handle('desktop:resolve', (choice, revision) => { if (!active()) throw new Error('Sessão expirada.'); store.resolve(choice, revision); publish(); return true; });
  handle('desktop:import', async () => {
    if(!active()) throw new Error('Entre online antes de importar.');
    await sync.run();
    const current=store.get('state');
    if(sync.network!=='online'||store.revision()!==0||store.head()||store.get('conflict')||current?.employees?.length||current?.config?.fps?.length||current?.config?.history?.length) throw new Error('Importação permitida somente em um espaço desktop vazio, conectado e sem pendências.');
    const {response,data}=await remote('/api/state.js');
    if(!response.ok) throw new Error(data.error||'Não foi possível ler os dados web.');
    require('../shared/state-contract.cjs').validateState(data);
    store.archive('antes da importação web',current); store.save(data); publish(); return true;
  });
  handle('desktop:backup', async () => {
    if (!active()) throw new Error('Sessão expirada.');
    const { filePath } = await dialog.showSaveDialog(win, { defaultPath: 'gestor-backup.sqlite', filters: [{ name: 'SQLite', extensions: ['sqlite'] }] });
    if (filePath) await store.backup(filePath);
    return Boolean(filePath);
  });
  win = new BrowserWindow({ width: 1440, height: 960, minWidth: 850, minHeight: 640, title: 'Gestor de Subconjunto', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  let closing = false;
  win.on('close', event => {
    if (closing) return;
    event.preventDefault();
    win.webContents.executeJavaScript('window.desktopFlush ? window.desktopFlush() : Promise.resolve()').then(() => { closing = true; win.close(); }).catch(async () => {
      await dialog.showMessageBox(win, { type: 'error', message: 'Não foi possível salvar. Mantenha o aplicativo aberto e faça um backup antes de sair.' });
    });
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, target) => { if (!target.startsWith('gestor://app/')) event.preventDefault(); });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await win.loadURL('gestor://app/');
  sync.start();
  calendarTimer=setInterval(()=>{if(active())void calendarSync.run();},30000);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { sync?.stop();clearInterval(calendarTimer); });
