const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateConsole: (callback) => ipcRenderer.on('update-console', (_event, message, type) => callback(message, type)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, message, pulse) => callback(message, pulse)),
  onServerStateChange: (callback) => ipcRenderer.on('server-state-change', (_event, isRunning) => callback(isRunning)),
  onRequestStatusCheckForFail: (callback) => ipcRenderer.on('request-status-check-for-fail', () => callback()),

  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  downloadPaperMC: (details) => ipcRenderer.send('download-papermc', details),
  startServer: () => ipcRenderer.send('start-server'),
  stopServer: () => ipcRenderer.send('stop-server'),
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  openServerFolder: () => ipcRenderer.send('open-server-folder'),

  checkInitialSetup: () => ipcRenderer.invoke('check-initial-setup'),
  getLatestPaperMCVersion: () => ipcRenderer.invoke('get-latest-papermc-version'),
  getAvailablePaperMCVersions: () => ipcRenderer.invoke('get-available-papermc-versions'),

  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getPublicIP: () => ipcRenderer.invoke('get-public-ip')
});