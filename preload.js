const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdateConsole: (callback) => ipcRenderer.on('update-console', (_event, message, type) => callback(message, type)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, message, pulse) => callback(message, pulse)),
  onServerStateChange: (callback) => ipcRenderer.on('server-state-change', (_event, isRunning) => callback(isRunning)),

  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  downloadPaperMC: (version) => ipcRenderer.send('download-papermc', version),
  startServer: (version, ram) => ipcRenderer.send('start-server', { version, ram }),
  stopServer: () => ipcRenderer.send('stop-server'),
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  openServerFolder: () => ipcRenderer.send('open-server-folder'),
  getPaperMCVersions: () => ipcRenderer.invoke('get-papermc-versions'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getPublicIP: () => ipcRenderer.invoke('get-public-ip')
});