const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { version } = require('./package.json');
const https = require('node:https');
const { spawn } = require('node:child_process');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const RPC = require('discord-rpc');
const pidusage = require('pidusage');
const AnsiToHtml = require('ansi-to-html');

const ansiConverter = new AnsiToHtml();

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

const clientId = '1397585400553541682';
let rpc;
let rpcStartTime;

let serverFilesDir;
const paperJarName = 'paper.jar';
let serverProcess = null;

let serverConfigFilePath;
const serverConfigFileName = 'config.json';
let launcherSettingsFilePath;
const launcherSettingsFileName = 'launcher-settings.json';
let serverPropertiesFilePath;
const serverPropertiesFileName = 'server.properties';

let localIsServerRunningGlobal = false;
let mainWindow;
let performanceStatsInterval = null;
let manualTpsCheck = false;

const getAutoStartPath = () => {
    if (process.platform !== 'linux') return '';
    const appName = app.getName();
    return path.join(app.getPath('home'), '.config', 'autostart', `${appName}.desktop`);
};

const createDesktopFile = (startMinimized) => {
    const appName = app.getName();
    const appPath = app.getPath('exe');
    const execPath = `"${appPath}"${startMinimized ? ' --hidden' : ''}`;
    const desktopFileContent = `[Desktop Entry]
    Type=Application
    Name=${appName}
    Exec=${execPath}
    Icon=${path.join(__dirname, 'build', 'icon.ico')}
    Comment=Minecraft Server Launcher
    X-GNOME-Autostart-enabled=true
    `;
    const autoStartDir = path.dirname(getAutoStartPath());
    if (!fs.existsSync(autoStartDir)) {
        fs.mkdirSync(autoStartDir, { recursive: true });
    }
    fs.writeFileSync(getAutoStartPath(), desktopFileContent);
};

function getMainWindow() { return mainWindow; }
function sendStatus(message, pulse = false) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-status', message, pulse);
}
function sendConsole(message, type = 'INFO') {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-console', message, type);
}
function sendServerStateChange(isRunning) {
    localIsServerRunningGlobal = isRunning;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('server-state-change', isRunning);
}

function setDiscordActivity() {
    if (!rpc || !mainWindow) {
        return;
    }
    const serverConfig = readServerConfig();
    const state = serverConfig.version ? `Version: ${serverConfig.version}` : 'Configuring server...';
    const activity = {
        details: localIsServerRunningGlobal ? 'Server is running' : 'Server is stopped',
        state: state,
        startTimestamp: rpcStartTime,
        largeImageKey: 'server_icon_large',
        largeImageText: 'Server Launcher',
        smallImageKey: localIsServerRunningGlobal ? 'play_icon' : 'stop_icon',
        smallImageText: localIsServerRunningGlobal ? 'Running' : 'Stopped',
        instance: false,
    };
    rpc.setActivity(activity).catch(err => {
        if (!err.message.includes('Could not connect')) {
            sendConsole(`Discord RPC Error: ${err.message}`, 'ERROR');
        }
    });
}

function readJsonFile(filePath, fileNameForLog) {
    try {
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            if (fileData.trim() === "") { return {}; }
            return JSON.parse(fileData);
        }
    } catch (error) {
        sendConsole(`Error reading or parsing ${fileNameForLog}: ${error.message}`, 'ERROR');
    }
    return {};
}

function writeJsonFile(filePath, dataObject, fileNameForLog) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(dataObject, null, 2));
        sendConsole(`${fileNameForLog} saved successfully.`, 'SUCCESS');
    } catch (error) {
        sendConsole(`Error writing ${fileNameForLog}: ${error.message}`, 'ERROR');
    }
}

function readServerConfig() { return readJsonFile(serverConfigFilePath, serverConfigFileName); }
function writeServerConfig(configObject) { writeJsonFile(serverConfigFilePath, configObject, serverConfigFileName); }
function readLauncherSettings() { return readJsonFile(launcherSettingsFilePath, launcherSettingsFileName); }
function writeLauncherSettings(settingsObject) { writeJsonFile(launcherSettingsFilePath, settingsObject, launcherSettingsFileName); }

function getLocalIPv4() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        const MynetworkInterface = networkInterfaces[interfaceName];
        for (let i = 0; i < MynetworkInterface.length; i++) {
            const alias = MynetworkInterface[i];
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '-';
}

async function getPublicIP() {
    return new Promise((resolve, reject) => {
        const request = https.get('https://api.ipify.org?format=json', { headers: {'User-Agent': 'MyMinecraftLauncher/1.0'} }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`Failed to get public IP (Status: ${res.statusCode})`));
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve(jsonData.ip || '-');
                } catch (e) {
                    reject(new Error('Failed to parse public IP response.'));
                }
            });
        });
        request.on('error', (err) => {
            reject(new Error(`Error fetching public IP: ${err.message}`));
        });
        request.end();
    });
}

function createWindow () {
  const launcherSettings = readLauncherSettings();
  const loginSettings = app.getLoginItemSettings();
  const startMinimizedSetting = launcherSettings.startWithWindows && launcherSettings.startMinimized;
  const wasOpenedAsHidden = startMinimizedSetting && (loginSettings.wasOpenedAtLogin || process.argv.includes('--hidden'));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    fullscreenable: true,
    frame: false,
    show: !wasOpenedAsHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('did-finish-load', () => {
    sendServerStateChange(localIsServerRunningGlobal);
    mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  serverFilesDir = path.join(userDataPath, 'MinecraftServer');
  serverConfigFilePath = path.join(serverFilesDir, serverConfigFileName);
  launcherSettingsFilePath = path.join(userDataPath, launcherSettingsFileName);
  serverPropertiesFilePath = path.join(serverFilesDir, serverPropertiesFileName);

  if (!fs.existsSync(serverFilesDir)) {
    try {
      fs.mkdirSync(serverFilesDir, { recursive: true });
    } catch (error) {
      log.error(`FATAL: Failed to create directory ${serverFilesDir}:`, error);
      dialog.showErrorBox('Directory Creation Failed', `Failed to create server directory at ${serverFilesDir}:\n${error.message}`);
    }
  }
  createWindow();

  rpc = new RPC.Client({ transport: 'ipc' });
  rpc.on('ready', () => {
    sendConsole('Discord Rich Presence is active.', 'INFO');
    rpcStartTime = new Date();
    setDiscordActivity();
    setInterval(setDiscordActivity, 15000);
  });
  rpc.login({ clientId }).catch(err => {
      if (!err.message.includes('Could not connect')) {
          sendConsole(`Discord RPC login error: ${err.message}`, 'ERROR');
      }
  });
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow();});
});

autoUpdater.on('checking-for-update', () => sendConsole('Updater: Checking for updates...', 'INFO'));
autoUpdater.on('update-available', (info) => sendConsole(`Updater: Update available! Version: ${info.version}`, 'SUCCESS'));
autoUpdater.on('update-not-available', (info) => sendConsole('Updater: No new updates available.', 'INFO'));
autoUpdater.on('error', (err) => sendConsole('Updater: Error during update. ' + err.message, 'ERROR'));
autoUpdater.on('download-progress', (p) => sendStatus(`Download speed: ${Math.round(p.bytesPerSecond / 1024)} KB/s - Downloaded ${Math.round(p.percent)}%`, true));
autoUpdater.on('update-downloaded', (info) => {
  sendConsole(`Updater: Update downloaded (${info.version}). It will be installed on restart.`, 'SUCCESS');
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart the application to install the update.',
    buttons: ['Restart Now', 'Later']
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess && typeof serverProcess.kill === 'function' && !serverProcess.killed) {
    serverProcess.killedInternally = true;
    serverProcess.kill('SIGKILL');
  }
  if (rpc) {
      rpc.destroy().catch(err => {
        if (!err.message.includes('Could not connect')) sendConsole(`Discord RPC destroy error: ${err.message}`, 'ERROR');
      });
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('minimize-window', () => getMainWindow()?.minimize());
ipcMain.on('maximize-window', () => {
    const win = getMainWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
});
ipcMain.on('close-window', () => getMainWindow()?.close());
ipcMain.handle('get-icon-path', () => {
    let iconPath = path.join(process.resourcesPath, 'icon.ico');
    if (!fs.existsSync(iconPath)) iconPath = path.join(__dirname, 'build', 'icon.ico');
    return fs.existsSync(iconPath) ? iconPath : null;
});
ipcMain.handle('get-settings', () => {
    const settings = readLauncherSettings();
    const openAtLogin = settings.startWithWindows || false;
    const openAsHidden = openAtLogin && (settings.startMinimized || false);
    return { openAtLogin, openAsHidden };
});
ipcMain.on('set-settings', (event, settings) => {
    const { openAtLogin, openAsHidden } = settings;
    if (process.platform === 'linux') {
        if (openAtLogin) createDesktopFile(openAsHidden);
        else if (fs.existsSync(getAutoStartPath())) fs.unlinkSync(getAutoStartPath());
    } else {
        app.setLoginItemSettings({ openAtLogin, openAsHidden });
    }
    writeLauncherSettings({ startWithWindows: openAtLogin, startMinimized: openAsHidden });
});
ipcMain.handle('get-app-version', () => version);
ipcMain.handle('get-server-config', () => readServerConfig());
ipcMain.handle('get-server-properties', () => {
    if (!fs.existsSync(serverPropertiesFilePath)) return null;
    try {
        const fileContent = fs.readFileSync(serverPropertiesFilePath, 'utf8');
        const properties = {};
        fileContent.split(/\r?\n/).forEach(line => {
            if (line.startsWith('#') || !line.includes('=')) return;
            const [key, ...valueParts] = line.split('=');
            properties[key.trim()] = valueParts.join('=').trim();
        });
        return properties;
    } catch (error) {
        sendConsole(`Error reading server.properties: ${error.message}`, 'ERROR');
        return null;
    }
});
ipcMain.on('set-server-properties', (event, newProperties) => {
    if (!fs.existsSync(serverPropertiesFilePath)) {
        sendConsole('Cannot save server.properties, file does not exist.', 'ERROR');
        return;
    }
    try {
        const lines = fs.readFileSync(serverPropertiesFilePath, 'utf8').split(/\r?\n/);
        const updatedLines = lines.map(line => {
            if (line.startsWith('#') || !line.includes('=')) return line;
            const [key] = line.split('=');
            const trimmedKey = key.trim();
            return newProperties.hasOwnProperty(trimmedKey) ? `${trimmedKey}=${newProperties[trimmedKey]}` : line;
        });
        fs.writeFileSync(serverPropertiesFilePath, updatedLines.join('\n'));
        sendConsole('server.properties saved successfully.', 'SUCCESS');
    } catch (error) {
        sendConsole(`Error writing to server.properties: ${error.message}`, 'ERROR');
    }
});
ipcMain.handle('get-app-path', () => app.getAppPath());
ipcMain.handle('check-initial-setup', async () => {
    const jarExists = fs.existsSync(path.join(serverFilesDir, paperJarName));
    const configExists = fs.existsSync(serverConfigFilePath);
    const needsSetup = !jarExists || !configExists;
    if (!needsSetup) sendConsole(`Setup check OK.`, 'INFO');
    return { needsSetup, config: configExists ? readServerConfig() : {} };
});
ipcMain.handle('get-available-papermc-versions', async () => {
    try {
        const projectApiUrl = 'https://api.papermc.io/v2/projects/paper';
        const projectResponseData = await new Promise((resolve, reject) => {
            https.get(projectApiUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (res) => {
                if (res.statusCode !== 200) { res.resume(); return reject(new Error(`API Error (Status ${res.statusCode})`)); }
                let data = ''; res.on('data', chunk => data += chunk);
                res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Failed to parse JSON.')); }});
            }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
        });
        if (projectResponseData.versions?.length > 0) return projectResponseData.versions.reverse();
        throw new Error('No versions found.');
    } catch (error) {
        sendConsole(`Could not fetch PaperMC versions: ${error.message}`, 'ERROR');
        return [];
    }
});
ipcMain.on('open-server-folder', () => {
    if (!fs.existsSync(serverFilesDir)) sendConsole(`Error: Server directory ${serverFilesDir} does not exist.`, 'WARN');
    shell.openPath(serverFilesDir).catch(err => sendConsole(`Failed to open folder: ${err.message}`, 'ERROR'));
});
ipcMain.on('download-papermc', async (event, { mcVersion, ramAllocation, javaArgs }) => {
    sendConsole(`Configuring: Version ${mcVersion}, RAM ${ramAllocation}`, 'INFO');
    const currentConfig = readServerConfig();
    currentConfig.version = mcVersion;
    currentConfig.javaArgs = javaArgs || 'Default';
    if (ramAllocation?.toLowerCase() !== 'auto') currentConfig.ram = ramAllocation;
    else delete currentConfig.ram;
    writeServerConfig(currentConfig);

    if (fs.existsSync(path.join(serverFilesDir, paperJarName)) && currentConfig.version === mcVersion) {
        sendStatus('Configuration saved!', false);
        return;
    }
    sendStatus(`Downloading PaperMC ${mcVersion}...`, true);
    try {
        const buildsApiUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`;
        const buildsResponseData = await new Promise((resolve, reject) => {
             https.get(buildsApiUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (res) => {
                if (res.statusCode !== 200) { res.resume(); return reject(new Error(`API Error (Status ${res.statusCode})`)); }
                let data = ''; res.on('data', chunk => data += chunk);
                res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Failed to parse JSON.')); }});
            }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
        });
        if (!buildsResponseData.builds?.length > 0) throw new Error('No builds found.');
        const latestBuild = buildsResponseData.builds.pop();
        const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;
        
        const fileStream = fs.createWriteStream(path.join(serverFilesDir, paperJarName));
        await new Promise((resolve, reject) => {
            https.get(downloadUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (response) => {
                if (response.statusCode !== 200) return reject(new Error(`Download failed (Status ${response.statusCode})`));
                response.pipe(fileStream);
                fileStream.on('finish', () => fileStream.close(resolve));
            }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
        });
        sendStatus('PaperMC downloaded successfully!', false);
        sendConsole(`${paperJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
    } catch (error) {
        sendStatus('Download failed.', false);
        sendConsole(`ERROR: ${error.message}`, 'ERROR');
    }
});

ipcMain.on('start-server', async () => {
    if (serverProcess) {
        sendConsole('Server is already running.', 'WARN');
        return;
    }
    const serverJarPath = path.join(serverFilesDir, paperJarName);
    if (!fs.existsSync(serverJarPath)) {
        sendConsole(`${paperJarName} not found.`, 'ERROR');
        sendStatus(`${paperJarName} not found.`, false);
        return;
    }
    const serverConfig = readServerConfig();
    if (!serverConfig.version) {
        sendConsole('Server version missing in config.', 'ERROR');
        sendStatus('Config error.', false);
        return;
    }
    const eulaPath = path.join(serverFilesDir, 'eula.txt');
    try {
        if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
            fs.writeFileSync(eulaPath, 'eula=true\n');
            sendConsole('EULA accepted.', 'INFO');
        }
    } catch (error) {
        sendConsole(`EULA file error: ${error.message}`, 'ERROR');
        sendStatus('EULA error.', false);
        return;
    }
    let ramToUseForJava = "";
    if (serverConfig.ram && serverConfig.ram.toLowerCase() !== 'auto') {
        ramToUseForJava = serverConfig.ram;
    } else {
        const totalSystemRamMB = Math.floor(os.totalmem() / (1024 * 1024));
        let autoRamMB = Math.floor(totalSystemRamMB / 3);
        if (autoRamMB < 1024) autoRamMB = 1024;
        ramToUseForJava = `${autoRamMB}M`;
    }
    const javaArgsProfile = serverConfig.javaArgs || 'Default';
    const performanceArgs = ['-Xms' + ramToUseForJava, '-Xmx' + ramToUseForJava, '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC', '-XX:+AlwaysPreTouch', '-XX:G1NewSizePercent=40', '-XX:G1MaxNewSizePercent=50', '-XX:G1HeapRegionSize=16M', '-XX:G1ReservePercent=15', '-XX:G1HeapWastePercent=5', '-XX:InitiatingHeapOccupancyPercent=20', '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32', '-XX:MaxTenuringThreshold=1', '-Dusing.aikars.flags=https://mcflags.emc.gs', '-Daikars.new.flags=true', '-jar', paperJarName, 'nogui'];
    const defaultArgs = ['-Xms' + ramToUseForJava, '-Xmx' + ramToUseForJava, '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:+UnlockExperimentalVMOptions', '-XX:MaxGCPauseMillis=200', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20', '-XX:InitiatingHeapOccupancyPercent=45', '-jar', paperJarName, 'nogui'];
    const javaArgs = (javaArgsProfile === 'Performance') ? performanceArgs : defaultArgs;
    sendConsole(`Using ${javaArgsProfile} Java arguments.`, 'INFO');
    sendConsole(`Starting server with ${ramToUseForJava} RAM...`, 'INFO');
    sendStatus('Starting server...', true);

    function parseRamToGB(ramString) {
        if (!ramString) return '-';
        const value = parseInt(ramString.slice(0, -1));
        const unit = ramString.slice(-1).toUpperCase();
        if (unit === 'G') return value.toFixed(1);
        if (unit === 'M') return (value / 1024).toFixed(1);
        return '-';
    }

    const stripAnsiCodes = (str) => str.replace(/\u001b\[(?:\d{1,3}(?:;\d{1,3})*)?[m|K]/g, '');

    try {
        const allocatedRamGB = parseRamToGB(ramToUseForJava);
        getMainWindow()?.webContents.send('update-performance-stats', { allocatedRamGB });

        serverProcess = spawn('java', javaArgs, { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'] });
        serverProcess.killedInternally = false;
        let serverIsFullyStarted = false;
        
    if (performanceStatsInterval) clearInterval(performanceStatsInterval);

    performanceStatsInterval = setInterval(async () => {
        if (!serverProcess || !serverProcess.pid) {
            clearInterval(performanceStatsInterval);
            return;
        }

        try {
            // Trimite comanda pentru TPS la fiecare 4 secunde (mai rar)
            serverProcess.stdin.write("tps\n");

            // Folosește pidusage pentru a obține statisticile procesului
            const stats = await pidusage(serverProcess.pid);

            // stats.memory este direct în Bytes, deci convertim în GB
            const memoryGB = stats.memory / (1024 * 1024 * 1024);

            // Trimite datele către interfață
            getMainWindow()?.webContents.send('update-performance-stats', { memoryGB });

            } catch (e) {
                // Oprește intervalul dacă procesul nu mai există
                if (e.message.includes('No matching pid found')) {
                    clearInterval(performanceStatsInterval);
                }
                // Ignorăm alte erori minore
            }
        }, 2000); // Verificăm la fiecare 2 secunde

        serverProcess.stdout.on('data', (data) => {
            const rawOutput = data.toString();
            const cleanOutput = stripAnsiCodes(rawOutput).trimEnd();
            const tpsMatch = cleanOutput.match(/TPS from last 1m, 5m, 15m:.*?(\d+\.?\d*)/);

            if (tpsMatch && tpsMatch[1]) {
                const tps = tpsMatch[1];
                getMainWindow()?.webContents.send('update-performance-stats', { tps });
                if (manualTpsCheck) {
                    sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
                    manualTpsCheck = false;
                }
            } else {
                sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
            }

            if (!serverIsFullyStarted && /Done \([^)]+\)! For help, type "help"/.test(cleanOutput)) {
                serverIsFullyStarted = true;
                sendServerStateChange(true);
                sendStatus('Server is running.', false);
                setDiscordActivity();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            sendConsole(ansiConverter.toHtml(data.toString()), 'SERVER_LOG_HTML');
        });

        serverProcess.on('close', (code) => {
            if (performanceStatsInterval) clearInterval(performanceStatsInterval);
            sendConsole(`Server process exited (code ${code}).`, code === 0 || serverProcess?.killedInternally ? 'INFO' : 'ERROR');
            serverProcess = null;
            sendServerStateChange(false);
            sendStatus(serverProcess?.killedInternally ? 'Server stopped.' : 'Server stopped unexpectedly.');
            setDiscordActivity();
        });

        serverProcess.on('error', (err) => {
            if (performanceStatsInterval) clearInterval(performanceStatsInterval);
            sendConsole(`Failed to start process: ${err.message}`, 'ERROR');
            sendStatus(err.message.includes('ENOENT') ? 'Java not found!' : 'Server start failed.');
            serverProcess = null;
            sendServerStateChange(false);
        });
    } catch (error) {
        if (performanceStatsInterval) clearInterval(performanceStatsInterval);
        sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
        serverProcess = null;
        sendServerStateChange(false);
        sendStatus('Error starting server.', false);
    }
});

ipcMain.on('stop-server', async () => {
    if (!serverProcess || serverProcess.killed) { sendConsole('Server not running.', 'WARN'); return; }
    if (performanceStatsInterval) clearInterval(performanceStatsInterval);
    sendConsole('Stopping server...', 'INFO');
    sendStatus('Stopping server...', true);
    serverProcess.killedInternally = true;
    try { serverProcess.stdin.write("stop\n"); } catch (e) {
        serverProcess.kill('SIGKILL');
    }
    setTimeout(() => { if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGKILL'); }, 10000);
});

ipcMain.on('send-command', (event, command) => {
    const trimmedCommand = command.trim().toLowerCase();
    if (trimmedCommand === 'tps' || trimmedCommand === '/tps') {
        manualTpsCheck = true;
    }
    if (serverProcess && !serverProcess.killed) {
        try { serverProcess.stdin.write(command + '\n'); }
        catch (error) { sendConsole(`Error writing to stdin: ${error.message}`, 'ERROR'); }
    } else { sendConsole('Cannot send command: Server not running.', 'ERROR'); }
});

ipcMain.handle('get-local-ip', () => getLocalIPv4());
ipcMain.handle('get-public-ip', async () => {
    try { return await getPublicIP(); }
    catch (error) {
        sendConsole(`Could not fetch Public IP: ${error.message}`, 'ERROR');
        return '- (Error)';
    }
});
