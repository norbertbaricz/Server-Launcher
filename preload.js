const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- Main to Renderer (on) ---
    onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_event, ...args) => callback(...args)),
    onUpdateConsole: (callback) => ipcRenderer.on('update-console', (_event, ...args) => callback(...args)),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, ...args) => callback(...args)),
    onServerStateChange: (callback) => ipcRenderer.on('server-state-change', (_event, ...args) => callback(...args)),
    onRequestStatusCheckForFail: (callback) => ipcRenderer.on('request-status-check-for-fail', (_event, ...args) => callback(...args)),

    // --- Renderer to Main (send) ---
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    setSettings: (settings) => ipcRenderer.send('set-settings', settings),
    openServerFolder: () => ipcRenderer.send('open-server-folder'),
    downloadPaperMC: (options) => ipcRenderer.send('download-papermc', options),
    startServer: () => ipcRenderer.send('start-server'),
    stopServer: () => ipcRenderer.send('stop-server'),
    sendCommand: (command) => ipcRenderer.send('send-command'),
    setServerProperties: (properties) => ipcRenderer.send('set-server-properties', properties),

    // --- Renderer to Main (invoke) ---
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getServerConfig: () => ipcRenderer.invoke('get-server-config'),
    getServerProperties: () => ipcRenderer.invoke('get-server-properties'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    checkInitialSetup: () => ipcRenderer.invoke('check-initial-setup'),
    getAvailablePaperMCVersions: () => ipcRenderer.invoke('get-available-papermc-versions'),
    getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
    getPublicIP: () => ipcRenderer.invoke('get-public-ip'),
});