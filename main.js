const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { spawn } = require('node:child_process');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// --- Auto-Updater Configuration ---
// This logger will write updater logs to the main console and a file
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

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

// --- Helper Functions for Linux Auto-Start ---
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
Icon=${path.join(__dirname, 'build', 'icon.png')}
Comment=Minecraft Server Launcher
X-GNOME-Autostart-enabled=true
`;
    
    const autoStartDir = path.dirname(getAutoStartPath());
    if (!fs.existsSync(autoStartDir)) {
        fs.mkdirSync(autoStartDir, { recursive: true });
    }
    fs.writeFileSync(getAutoStartPath(), desktopFileContent);
};

// --- Main Functions ---
function getMainWindow() {
    return mainWindow;
}

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
    return 'N/A';
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
                    resolve(jsonData.ip || 'N/A');
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

  // Check for updates only if the app is packaged (not in development)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow();});
});

// --- Auto-Updater Events ---
autoUpdater.on('checking-for-update', () => {
  sendConsole('Updater: Checking for updates...', 'INFO');
});
autoUpdater.on('update-available', (info) => {
  sendConsole(`Updater: Update available! Version: ${info.version}`, 'SUCCESS');
});
autoUpdater.on('update-not-available', (info) => {
  sendConsole('Updater: No new updates available.', 'INFO');
});
autoUpdater.on('error', (err) => {
  sendConsole('Updater: Error during update. ' + err.message, 'ERROR');
});
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + Math.round(progressObj.bytesPerSecond / 1024) + " KB/s";
  log_message = log_message + ' - Downloaded ' + Math.round(progressObj.percent) + '%';
  log_message = log_message + ' (' + Math.round(progressObj.transferred / 1024) + "/" + Math.round(progressObj.total / 1024) + ' KB)';
  sendStatus(log_message, true);
});
autoUpdater.on('update-downloaded', (info) => {
  sendConsole(`Updater: Update downloaded (${info.version}). It will be installed on restart.`, 'SUCCESS');
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart the application to install the update.',
    buttons: ['Restart Now', 'Later']
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});


app.on('window-all-closed', () => {
  if (serverProcess && typeof serverProcess.kill === 'function' && !serverProcess.killed) {
    serverProcess.killedInternally = true;
    serverProcess.kill('SIGKILL');
    serverProcess = null;
    sendServerStateChange(false);
  }
  if (process.platform !== 'darwin') app.quit();
});

// Window Actions
ipcMain.on('minimize-window', () => getMainWindow()?.minimize());
ipcMain.on('maximize-window', () => {
    const win = getMainWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
});
ipcMain.on('close-window', () => getMainWindow()?.close());

// Settings IPC
ipcMain.handle('get-settings', () => {
    const settings = readLauncherSettings();
    const openAtLogin = settings.startWithWindows || false;
    const openAsHidden = openAtLogin && (settings.startMinimized || false);
    return {
        openAtLogin,
        openAsHidden,
    };
});

ipcMain.on('set-settings', (event, settings) => {
    const { openAtLogin, openAsHidden } = settings;
    
    if (process.platform === 'linux') {
        if (openAtLogin) {
            createDesktopFile(openAsHidden);
        } else {
            if (fs.existsSync(getAutoStartPath())) {
                fs.unlinkSync(getAutoStartPath());
            }
        }
    } else {
        app.setLoginItemSettings({
            openAtLogin: openAtLogin,
            openAsHidden: openAsHidden,
        });
    }
    
    writeLauncherSettings({
        startWithWindows: openAtLogin,
        startMinimized: openAsHidden,
    });
});

ipcMain.handle('get-server-config', () => readServerConfig());
ipcMain.handle('get-server-properties', () => {
    if (!fs.existsSync(serverPropertiesFilePath)) { return null; }
    try {
        const fileContent = fs.readFileSync(serverPropertiesFilePath, 'utf8');
        const properties = {};
        const lines = fileContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.startsWith('#') || !line.includes('=')) continue;
            const [key, ...valueParts] = line.split('=');
            properties[key.trim()] = valueParts.join('=').trim();
        }
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
            if (line.startsWith('#') || !line.includes('=')) { return line; }
            const [key] = line.split('=');
            const trimmedKey = key.trim();
            if (newProperties.hasOwnProperty(trimmedKey)) {
                return `${trimmedKey}=${newProperties[trimmedKey]}`;
            }
            return line;
        });
        fs.writeFileSync(serverPropertiesFilePath, updatedLines.join('\n'));
        sendConsole('server.properties saved successfully.', 'SUCCESS');
    } catch (error) {
        sendConsole(`Error writing to server.properties: ${error.message}`, 'ERROR');
    }
});


ipcMain.handle('get-app-path', () => app.getAppPath());
ipcMain.handle('check-initial-setup', async () => {
    const jarPath = path.join(serverFilesDir, paperJarName);
    const jarExists = fs.existsSync(jarPath);
    const configExists = fs.existsSync(serverConfigFilePath);
    let config = configExists ? readServerConfig() : {};
    const needsSetup = !jarExists || !configExists;
    if (!jarExists) sendConsole(`${paperJarName} not found.`, 'INFO');
    if (!configExists) sendConsole(`${serverConfigFileName} not found.`, 'INFO');
    if (!needsSetup) sendConsole(`Setup check OK: ${paperJarName} and ${serverConfigFileName} exist.`, 'INFO');
    return { needsSetup, config };
});

ipcMain.handle('get-available-papermc-versions', async () => {
    try {
        const projectApiUrl = `https://api.papermc.io/v2/projects/paper`;
        const projectResponseData = await new Promise((resolve, reject) => {
            const req = https.get(projectApiUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (res) => {
                if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Failed to get project info (Status ${res.statusCode})`)); }
                let data = ''; res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Failed to parse project JSON.' + e.message)); }});
            });
            req.on('error', (err) => reject(new Error(`API request error for project versions: ${err.message}`))); req.end();
        });

        if (projectResponseData.versions && projectResponseData.versions.length > 0) {
            return projectResponseData.versions.reverse();
        }
        throw new Error('No versions found for PaperMC project.');
    } catch (error) {
        sendConsole(`Could not fetch available PaperMC versions: ${error.message}`, 'ERROR');
        return [];
    }
});


ipcMain.on('open-server-folder', () => {
  if (!serverFilesDir) { sendConsole('Server directory path not initialized yet.', 'ERROR'); return; }
  if (!fs.existsSync(serverFilesDir)) { sendConsole(`Error: Server directory ${serverFilesDir} does not exist.`, 'WARN'); }
  shell.openPath(serverFilesDir)
    .then(result => {
      if (result !== "") { sendConsole(`Error opening folder ${serverFilesDir}: ${result}`, 'ERROR'); }
      else { sendConsole(`Opened folder: ${serverFilesDir}`, 'INFO'); }
    })
    .catch(err => { sendConsole(`Failed to open folder ${serverFilesDir}: ${err.message}`, 'ERROR');});
});

ipcMain.on('download-papermc', async (event, { mcVersion, ramAllocation, javaArgs }) => {
  sendConsole(`Action 'Download/Configure': Version ${mcVersion}, RAM ${ramAllocation}, Java Args: ${javaArgs}`, 'INFO');
  const currentConfig = readServerConfig();
  const oldVersion = currentConfig.version;
  
  currentConfig.version = mcVersion;
  currentConfig.javaArgs = javaArgs || 'Default';
  if (ramAllocation && ramAllocation.toLowerCase() !== 'auto') { currentConfig.ram = ramAllocation; }
  else { delete currentConfig.ram; }
  writeServerConfig(currentConfig);

  const jarPath = path.join(serverFilesDir, paperJarName);
  if (fs.existsSync(jarPath) && oldVersion === mcVersion) {
      sendConsole(`Configuration updated for version ${mcVersion}.`, 'INFO');
      sendStatus('Configuration saved!', false);
      sendServerStateChange(localIsServerRunningGlobal);
      return;
  }
  
  if (fs.existsSync(jarPath) && oldVersion !== mcVersion) {
      sendConsole(`Version changed from ${oldVersion} to ${mcVersion}. Redownloading server jar.`, 'INFO');
  }

  sendStatus(`Downloading PaperMC ${mcVersion}...`, true);
  try {
    const buildsApiUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`;
    const buildsResponseData = await new Promise((resolve, reject) => {
        const req = https.get(buildsApiUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Failed to get builds list (Status ${res.statusCode})`)); }
            let data = ''; res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Failed to parse builds JSON`)); }});
        });
        req.on('error', (err) => reject(new Error(`API request error: ${err.message}`))); req.end();
    });
    if (!buildsResponseData.builds || buildsResponseData.builds.length === 0) throw new Error(`No builds found for ${mcVersion}.`);
    const latestBuild = buildsResponseData.builds.pop();
    const downloadName = latestBuild.downloads.application.name;
    const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild.build}/downloads/${downloadName}`;
    const destinationPath = path.join(serverFilesDir, paperJarName);
    
    const fileStream = fs.createWriteStream(destinationPath);
    await new Promise((resolve, reject) => {
        https.get(downloadUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              return reject(new Error(`Download failed (Status ${response.statusCode})`));
            }
            response.pipe(fileStream);
            fileStream.on('finish', () => fileStream.close(resolve));
            fileStream.on('error', (err) => reject(new Error(`File stream error: ${err.message}`)));
        }).on('error', (err) => reject(new Error(`Download request error: ${err.message}`)));
    });
    sendStatus('PaperMC downloaded successfully!', false);
    sendConsole(`${paperJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
    sendServerStateChange(localIsServerRunningGlobal);
  } catch (error) {
    sendStatus('Download failed.', false);
    sendConsole(`ERROR: ${error.message}`, 'ERROR');
    sendServerStateChange(localIsServerRunningGlobal);
  }
});

ipcMain.on('start-server', async () => {
  if (serverProcess) { sendConsole('Server is already running.', 'WARN'); return; }
  const serverJarPath = path.join(serverFilesDir, paperJarName);
  if (!fs.existsSync(serverJarPath)) { sendConsole(`${paperJarName} not found.`, 'ERROR'); sendStatus(`${paperJarName} not found.`, false); return; }
  const serverConfig = readServerConfig();
  if (!serverConfig.version) { sendConsole('Server version missing in config.', 'ERROR'); sendStatus('Config error.', false); return; }

  const eulaPath = path.join(serverFilesDir, 'eula.txt');
  try {
    if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
      fs.writeFileSync(eulaPath, 'eula=true\n');
      sendConsole('EULA accepted.', 'INFO');
    }
  } catch (error) { sendConsole(`EULA file error: ${error.message}`, 'ERROR'); sendStatus('EULA error.', false); return; }

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
  let javaArgs = [];

  const performanceArgs = [
      `-Xms${ramToUseForJava}`, `-Xmx${ramToUseForJava}`, 
      '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:+UnlockExperimentalVMOptions',
      '-XX:MaxGCPauseMillis=200', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20', '-XX:InitiatingHeapOccupancyPercent=45',
      '-jar', paperJarName, 'nogui'
  ];

  const defaultArgs = [
      `-Xms${ramToUseForJava}`, `-Xmx${ramToUseForJava}`,
      '-jar', paperJarName, 'nogui'
  ];

  if (javaArgsProfile === 'Performance') {
      javaArgs = performanceArgs;
      sendConsole('Using Performance Java arguments.', 'INFO');
  } else {
      javaArgs = defaultArgs;
      sendConsole('Using Default Java arguments.', 'INFO');
  }

  sendConsole(`Starting server with ${ramToUseForJava} RAM...`, 'INFO');
  sendStatus('Starting server...', true);
  try {
    serverProcess = spawn('java', javaArgs, { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'] });
    
    serverProcess.killedInternally = false;
    sendServerStateChange(true);
    serverProcess.stdout.on('data', (data) => sendConsole(data.toString().trimEnd(), 'SERVER_LOG'));
    serverProcess.stderr.on('data', (data) => sendConsole(data.toString().trimEnd(), 'SERVER_ERROR'));
    serverProcess.on('close', (code) => {
      sendConsole(`Server process exited (code ${code}).`, code === 0 || serverProcess?.killedInternally ? 'INFO' : 'ERROR');
      const wasKilled = serverProcess?.killedInternally;
      serverProcess = null;
      sendServerStateChange(false);
      if (wasKilled) sendStatus('Server stopped.', false);
      else {
          sendStatus('Server stopped unexpectedly.', false);
          getMainWindow()?.webContents.send('request-status-check-for-fail');
      }
    });
    serverProcess.on('error', (err) => {
      sendConsole(`Failed to start process: ${err.message}`, 'ERROR');
      if (err.message.includes('ENOENT')) sendStatus('Java not found!', false);
      else sendStatus('Server start failed.', false);
      serverProcess = null; sendServerStateChange(false);
    });
  } catch (error) {
    sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
    serverProcess = null; sendServerStateChange(false);
    sendStatus('Error starting server.', false);
  }
});

ipcMain.on('stop-server', async () => {
  if (!serverProcess || serverProcess.killed) { sendConsole('Server not running.', 'WARN'); return; }
  sendConsole('Stopping server...', 'INFO');
  sendStatus('Stopping server...', true);
  serverProcess.killedInternally = true;
  try { serverProcess.stdin.write("stop\n"); }
  catch (e) { serverProcess.kill('SIGKILL'); return; }
  setTimeout(() => { if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGKILL'); }, 10000);
});

ipcMain.on('send-command', (event, command) => {
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
        return 'N/A (Error)';
    }
});