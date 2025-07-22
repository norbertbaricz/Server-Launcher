const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window actions
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_event, isMaximized) => callback(isMaximized)),

  // App events
  onUpdateConsole: (callback) => ipcRenderer.on('update-console', (_event, message, type) => callback(message, type)),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, message, pulse) => callback(message, pulse)),
  onServerStateChange: (callback) => ipcRenderer.on('server-state-change', (_event, isRunning) => callback(isRunning)),
  onRequestStatusCheckForFail: (callback) => ipcRenderer.on('request-status-check-for-fail', () => callback()),

  // App functionality
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  downloadPaperMC: (details) => ipcRenderer.send('download-papermc', details),
  startServer: () => ipcRenderer.send('start-server'),
  stopServer: () => ipcRenderer.send('stop-server'),
  sendCommand: (command) => ipcRenderer.send('send-command', command),
  openServerFolder: () => ipcRenderer.send('open-server-folder'),

  // Setup and config
  checkInitialSetup: () => ipcRenderer.invoke('check-initial-setup'),
  getServerConfig: () => ipcRenderer.invoke('get-server-config'),
  getLatestPaperMCVersion: () => ipcRenderer.invoke('get-latest-papermc-version'),
  getAvailablePaperMCVersions: () => ipcRenderer.invoke('get-available-papermc-versions'),

  // IP utilities
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  getPublicIP: () => ipcRenderer.invoke('get-public-ip'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.send('set-settings', settings),
  getServerProperties: () => ipcRenderer.invoke('get-server-properties'),
  setServerProperties: (properties) => ipcRenderer.send('set-server-properties', properties),
});