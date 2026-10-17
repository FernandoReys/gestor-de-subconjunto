'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-electron-'));
app.setPath('userData', home);
require('../desktop/main.cjs');
const timeout = setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 30000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('did-finish-load', async () => {
    try {
      assert.equal(win.webContents.getURL(), 'gestor://app/');
      const prefs = win.webContents.getLastWebPreferences();
      assert.equal(prefs.contextIsolation, true); assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.sandbox, true);
      const result = await win.webContents.executeJavaScript(`(async () => {
        const response = await window.fetch('/api/auth.js');
        return { status: response.status, bridge: !!window.gestorDesktop, scheduler: !!window.GestorSchedule, node: typeof require, server: !!document.querySelector('input[name=server]'), css: [...document.styleSheets].length };
      })()`);
      assert.equal(result.status, 401); assert.equal(result.bridge, true); assert.equal(result.scheduler, true); assert.equal(result.node, 'undefined'); assert.equal(result.server, true); assert.ok(result.css);
      assert.ok(fs.existsSync(path.join(home, 'gestor.sqlite')));
      const calendar = await win.webContents.executeJavaScript(`(() => {
        authenticated=true; storageMode='loading'; config=S.defaults(); employees=[]; location.hash='#agenda'; agendaPage();
        return {days:document.querySelectorAll('.agenda-day').length, title:document.querySelector('#app h1').textContent, module:!!window.GestorAgenda, button:!!document.querySelector('#agendaConnect')};
      })()`);
      assert.equal(calendar.days,7);assert.equal(calendar.title,'Agenda de produção');assert.equal(calendar.module,true);assert.equal(calendar.button,true);
      fs.mkdirSync(path.join(__dirname,'../verification'),{recursive:true});
      fs.writeFileSync(path.join(__dirname,'../verification/agenda-windows.png'),(await win.webContents.capturePage()).toPNG());
      console.log('Weekly production calendar renders seven days and Google connection controls: OK');
      console.log('Electron isolated renderer, IPC, local assets, SQLite and offline authentication: OK');
      clearTimeout(timeout); app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
