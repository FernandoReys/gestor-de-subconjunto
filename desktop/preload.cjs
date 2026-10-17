'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gestorDesktop', {
  request: (path, options) => ipcRenderer.invoke('desktop:request', path, options),
  status: () => ipcRenderer.invoke('desktop:status'),
  calendarSync: () => ipcRenderer.invoke('desktop:calendar-sync'),
  retry: () => ipcRenderer.invoke('desktop:retry'),
  resolve: (choice, revision) => ipcRenderer.invoke('desktop:resolve', choice, revision),
  importWeb: () => ipcRenderer.invoke('desktop:import'),
  backup: () => ipcRenderer.invoke('desktop:backup'),
  onStatus: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('desktop:status', listener); return () => ipcRenderer.removeListener('desktop:status', listener); }
});
