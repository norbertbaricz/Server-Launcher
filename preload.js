const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- Main to Renderer (on) ---
    onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_event, ...args) => callback(...args)),
    onUpdateConsole: (callback) => ipcRenderer.on('update-console', (_event, ...args) => callback(...args)),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (_event, ...args) => callback(...args)),
    onServerStateChange: (callback) => ipcRenderer.on('server-state-change', (_event, ...args) => callback(...args)),
    onRequestStatusCheckForFail: (callback) => ipcRenderer.on('request-status-check-for-fail', (_event, ...args) => callback(...args)),
    onUpdatePerformanceStats: (callback) => ipcRenderer.on('update-performance-stats', (_event, ...args) => callback(...args)),
    onStartCountdown: (callback) => ipcRenderer.on('start-countdown', (_event, ...args) => callback(...args)),
    onJavaInstallRequired: (callback) => ipcRenderer.on('java-install-required', (_event, ...args) => callback(...args)),
    onJavaInstallStatus: (callback) => ipcRenderer.on('java-install-status', (_event, ...args) => callback(...args)),
    onSetupFinished: (callback) => ipcRenderer.on('setup-finished', (_event, ...args) => callback(...args)),


    // --- Renderer to Main (send) ---
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    appReadyToShow: () => ipcRenderer.send('app-ready-to-show'),
    setSettings: (settings) => ipcRenderer.send('set-settings', settings),
    openPluginsFolder: () => ipcRenderer.send('open-plugins-folder'),
    configureServer: (options) => ipcRenderer.send('configure-server', options),
    startServer: () => ipcRenderer.send('start-server'),
    stopServer: () => ipcRenderer.send('stop-server'),
    sendCommand: (command) => ipcRenderer.send('send-command', command),
    setServerProperties: (properties) => ipcRenderer.send('set-server-properties', properties),
    startJavaInstall: () => ipcRenderer.send('start-java-install'),
    restartApp: () => ipcRenderer.send('restart-app'),

    // --- Renderer to Main (invoke) ---
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getServerConfig: () => ipcRenderer.invoke('get-server-config'),
    getServerProperties: () => ipcRenderer.invoke('get-server-properties'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    checkInitialSetup: () => ipcRenderer.invoke('check-initial-setup'),
    getAvailableVersions: (serverType) => ipcRenderer.invoke('get-available-versions', serverType),
    getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
    getPublicIP: () => ipcRenderer.invoke('get-public-ip'),
    getIconPath: () => ipcRenderer.invoke('get-icon-path'),
    getTranslations: (lang) => ipcRenderer.invoke('get-translations', lang),
    getAvailableLanguages: () => ipcRenderer.invoke('get-available-languages')
});