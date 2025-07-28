const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { version } = require('./package.json');
const https = require('node:https');
const { spawn, exec } = require('node:child_process');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const RPC = require('discord-rpc');
const pidusage = require('pidusage');
const AnsiToHtml = require('ansi-to-html');
const find = require('find-process');

let javaExecutablePath = 'java';

process.on('uncaughtException', (error) => {
  log.error('UNCAUGHT EXCEPTION:', error);
  sendConsole(`An uncaught exception was prevented: ${error.message}`, 'ERROR');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('UNHANDLED REJECTION:', reason);
  sendConsole(`An unhandled promise rejection was caught: ${reason}`, 'ERROR');
});

const ansiConverter = new AnsiToHtml({
  newline: true,
  escapeXML: true,
  fg: '#E5E9F0',
  bg: '#1F2937'
});

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

async function killStrayServerProcess() {
    try {
        const processes = await find('name', 'java', true);
        const serverJarPath = path.join(serverFilesDir, paperJarName);

        for (const p of processes) {
            if (p.cmd.includes(serverJarPath)) {
                log.warn(`Found a stray server process with PID ${p.pid}. Attempting to kill it.`);
                sendConsole(`Found a stray server process (PID: ${p.pid}). Terminating...`, 'WARN');
                process.kill(p.pid);
            }
        }
    } catch (err) {
        log.error('Error while trying to find and kill stray server processes:', err);
        sendConsole('Error checking for stray server processes.', 'ERROR');
    }
}

async function checkJava() {
    return new Promise((resolve) => {
        const verifyJavaVersion = (javaPath, callback) => {
            const command = `"${javaPath}" -version`;
            exec(command, (error, stdout, stderr) => {
                const output = stderr || stdout;
                if (!error && output.includes('version "21.')) {
                    log.info(`Java 21 verified at: ${javaPath}`);
                    javaExecutablePath = javaPath;
                    callback(true);
                } else {
                    callback(false);
                }
            });
        };

        const checkRegistry = (onComplete) => {
            if (process.platform !== 'win32') {
                return onComplete(null);
            }

            const keysToQuery = [
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Eclipse Adoptium\\JDK',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\JavaSoft\\JDK',
                'HKEY_LOCAL_MACHINE\\SOFTWARE\\Amazon Corretto\\JDK'
            ];
            let keysProcessed = 0;
            let foundPath = null;

            const processKey = (key) => {
                const query = `reg query "${key}" /s /f "21." /k`;
                exec(query, (error, stdout) => {
                    if (!foundPath && !error && stdout) {
                        const lines = stdout.trim().split(/[\r\n]+/).filter(Boolean);
                        const jdkKey = lines.find(line => line.trim().startsWith('HKEY_'));

                        if (jdkKey) {
                            const homeQuery = `reg query "${jdkKey.trim()}" /v JavaHome`;
                            exec(homeQuery, (homeError, homeStdout) => {
                                if (!homeError && homeStdout) {
                                    const match = homeStdout.match(/JavaHome\s+REG_SZ\s+(.*)/);
                                    if (match && match[1]) {
                                        const javaHome = match[1].trim();
                                        const javaExe = path.join(javaHome, 'bin', 'java.exe');
                                        if (fs.existsSync(javaExe)) {
                                            foundPath = javaExe;
                                        }
                                    }
                                }
                                finish();
                            });
                            return;
                        }
                    }
                    finish();
                });
            };

            const finish = () => {
                keysProcessed++;
                if (foundPath || keysProcessed === keysToQuery.length) {
                    onComplete(foundPath);
                }
            };

            keysToQuery.forEach(processKey);
        };

        const checkPath = () => {
            exec('java -version', (error, stdout, stderr) => {
                const output = stderr || stdout;
                if (!error && output.includes('version "21.')) {
                    log.info('Java 21 found in system PATH.');
                    javaExecutablePath = 'java';
                    resolve(true);
                } else {
                    log.warn('Java not found via registry or PATH. All checks failed.');
                    resolve(false);
                }
            });
        };

        log.info('Checking for Java 21...');
        checkRegistry(registryPath => {
            if (registryPath) {
                log.info(`Found potential Java path in registry: ${registryPath}`);
                verifyJavaVersion(registryPath, (isValid) => {
                    if (isValid) {
                        resolve(true);
                    } else {
                        log.warn('Registry path was not a valid Java 21 installation. Checking PATH.');
                        checkPath();
                    }
                });
            } else {
                log.info('Java not found in registry. Checking system PATH.');
                checkPath();
            }
        });
    });
}

async function downloadAndInstallJava() {
    const win = getMainWindow();
    if (!win) return;

    try {
        win.webContents.send('java-install-status', 'Finding the latest Java version for your system...');

        if (process.platform !== 'win32') {
            throw new Error('Automated Java installation is currently supported only on Windows.');
        }

        const arch = process.arch === 'ia32' ? 'x86' : 'x64';
        
        const apiUrl = `https://api.adoptium.net/v3/assets/latest/21/hotspot?vendor=eclipse&os=windows&architecture=${arch}&image_type=jdk`;
        
        const apiResponse = await new Promise((resolve, reject) => {
            https.get(apiUrl, { headers: { 'User-Agent': 'Server-Launcher-Electron' } }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`Failed to query Adoptium API (Status: ${res.statusCode})`));
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data)));
            }).on('error', reject);
        });

        const installerPackage = apiResponse.find(p => p.binary.installer?.name?.endsWith('.msi'));
        if (!installerPackage) {
            throw new Error(`Could not find a valid MSI installer for your system (${arch}). Please install Java manually.`);
        }
        
        const downloadUrl = installerPackage.binary.installer.link;
        const totalBytes = installerPackage.binary.installer.size;
        const fileName = installerPackage.binary.installer.name;
        
        const tempDir = app.getPath('temp');
        const filePath = path.join(tempDir, fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        win.webContents.send('java-install-status', `Downloading ${fileName}...`, 0);

        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            let downloadedBytes = 0;

            const followRedirect = (url, callback) => {
                https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        const redirectUrl = response.headers.location;
                        if (!redirectUrl) {
                            return reject(new Error('Redirect failed: No Location header'));
                        }
                        followRedirect(redirectUrl, callback);
                    } else if (response.statusCode !== 200) {
                        return reject(new Error(`Download failed with status code ${response.statusCode}`));
                    } else {
                        callback(response);
                    }
                }).on('error', err => reject(err));
            };

            followRedirect(downloadUrl, (response) => {
                response.on('data', chunk => {
                    downloadedBytes += chunk.length;
                    const progress = totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                    win.webContents.send('java-install-status', `Downloading... ${progress}%`, progress);
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => fileStream.close(resolve));
            });

            fileStream.on('error', err => fs.unlink(filePath, () => reject(err)));
        });
        
        win.webContents.send('java-install-status', 'Download complete. Launching installer...');

        shell.openPath(filePath).then(errorMessage => {
            if (errorMessage) {
                throw new Error(`Failed to open installer: ${errorMessage}`);
            }
            win.webContents.send('java-install-status', 'Installer launched. Please complete the installation, then restart the launcher. The application will now close.');
            log.info('Java installer launched. Closing the launcher.');
            
            setTimeout(() => {
                app.quit();
            }, 4000);
        });

    } catch (error) {
        log.error('Java install error:', error);
        win.webContents.send(
            'java-install-status',
            `Error: ${error.message}. Please try again or install Java manually.`
        );
    }
}

function getMainWindow() { return mainWindow; }
function sendStatus(fallbackMessage, pulse = false, translationKey = null) {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-status', fallbackMessage, pulse, translationKey);
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    fullscreenable: true,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('did-finish-load', async () => {
      const hasJava = await checkJava();
      if (!hasJava && app.isPackaged) {
          mainWindow.webContents.send('java-install-required');
          return;
      }
      
      sendServerStateChange(localIsServerRunningGlobal);
      mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());

      const launcherSettings = readLauncherSettings();
      if (launcherSettings.autoStartServer) {
          const delay = launcherSettings.autoStartDelay || 5;
          mainWindow.webContents.send('start-countdown', 'initial', delay);
      }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

app.whenReady().then(async () => {
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
  await killStrayServerProcess();
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

ipcMain.on('app-ready-to-show', () => {
    mainWindow.show();
});

ipcMain.handle('get-settings', () => {
    const settings = readLauncherSettings();
    return {
        openAtLogin: settings.startWithWindows || false,
        autoStartServer: settings.autoStartServer || false,
        autoStartDelay: settings.autoStartDelay || 5,
        language: settings.language || 'en'
    };
});

ipcMain.on('set-settings', (event, settings) => {
    const currentSettings = readLauncherSettings();
    const newSettings = { ...currentSettings, ...settings };
    app.setLoginItemSettings({ openAtLogin: newSettings.openAtLogin });
    writeJsonFile(launcherSettingsFilePath, newSettings, launcherSettingsFileName);
});

ipcMain.on('start-java-install', () => {
    downloadAndInstallJava();
});
ipcMain.on('restart-app', () => {
    app.relaunch();
    app.quit();
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
ipcMain.on('open-plugins-folder', () => {
    const pluginsDir = path.join(serverFilesDir, 'plugins');
    if (!fs.existsSync(pluginsDir)) {
        try {
            fs.mkdirSync(pluginsDir, { recursive: true });
            sendConsole('Plugins directory created.', 'INFO');
        } catch (error) {
            sendConsole(`Failed to create plugins directory: ${error.message}`, 'ERROR');
            return;
        }
    }
    shell.openPath(pluginsDir).catch(err => sendConsole(`Failed to open plugins folder: ${err.message}`, 'ERROR'));
});

ipcMain.handle('get-available-languages', () => {
    const langDir = path.join(__dirname, 'lang');
    const languages = [];
    try {
        const files = fs.readdirSync(langDir);
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(langDir, file);
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const langData = JSON.parse(fileContent);
                    if (langData.languageName) {
                        languages.push({
                            code: path.basename(file, '.json'),
                            name: langData.languageName
                        });
                    }
                } catch (e) {
                    log.error(`Could not parse language file ${file}:`, e);
                }
            }
        }
        return languages;
    } catch (error) {
        log.error('Could not read languages directory:', error);
        return [{ code: 'en', name: 'English' }]; // Fallback
    }
});

ipcMain.handle('get-translations', async (event, lang) => {
  const langPath = path.join(__dirname, 'lang', `${lang}.json`);
  try {
    if (fs.existsSync(langPath)) {
      const data = fs.readFileSync(langPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    log.error(`Could not load language file for ${lang}:`, error);
  }
  return null;
});

ipcMain.on('download-papermc', async (event, { mcVersion, ramAllocation, javaArgs }) => {
    sendConsole(`Configuring: Version ${mcVersion}, RAM ${ramAllocation}`, 'INFO');
    const currentConfig = readServerConfig();
    const oldVersion = currentConfig.version;
    currentConfig.version = mcVersion;
    currentConfig.javaArgs = javaArgs || 'Default';
    if (ramAllocation?.toLowerCase() !== 'auto') {
        currentConfig.ram = ramAllocation;
    } else {
        delete currentConfig.ram;
    }
    writeServerConfig(currentConfig);

    const paperJarPath = path.join(serverFilesDir, paperJarName);

    if (fs.existsSync(paperJarPath) && oldVersion !== mcVersion) {
        sendConsole(`Removing old paper.jar for version ${oldVersion}...`, 'INFO');
        try {
            fs.unlinkSync(paperJarPath);
            sendConsole('Old paper.jar removed successfully.', 'SUCCESS');
        } catch (error) {
            sendConsole(`Error removing old paper.jar: ${error.message}`, 'ERROR');
            sendStatus('Error updating version.', false, 'error');
            getMainWindow()?.webContents.send('setup-finished');
            return;
        }
    } else if (fs.existsSync(paperJarPath) && oldVersion === mcVersion) {
        sendStatus('Configuration saved! Version is already up to date.', false, 'configSaved');
        getMainWindow()?.webContents.send('setup-finished');
        
        setTimeout(async () => {
            const hasJava = await checkJava();
            if (!hasJava && app.isPackaged) {
                getMainWindow()?.webContents.send('java-install-required');
            }
        }, 2000);
        return;
    }
    
    sendStatus(`Downloading PaperMC ${mcVersion}...`, true, 'downloading');
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
        
        sendStatus('PaperMC downloaded successfully!', false, 'downloadSuccess');
        sendConsole(`${paperJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
        getMainWindow()?.webContents.send('setup-finished');
        
        setTimeout(async () => {
            const hasJava = await checkJava();
            if (!hasJava && app.isPackaged) {
                const win = getMainWindow();
                if (win && !win.isDestroyed()) {
                    win.webContents.send('java-install-required');
                }
            }
        }, 2000);

    } catch (error) {
        sendStatus('Download failed.', false, 'downloadFailed');
        sendConsole(`ERROR: ${error.message}`, 'ERROR');
        getMainWindow()?.webContents.send('setup-finished');
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
        sendStatus(`${paperJarName} not found.`, false, 'paperJarNotFound');
        return;
    }
    const serverConfig = readServerConfig();
    if (!serverConfig.version) {
        sendConsole('Server version missing in config.', 'ERROR');
        sendStatus('Config error.', false, 'configError');
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
        sendStatus('EULA error.', false, 'eulaError');
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
    sendStatus('Starting server...', true, 'serverStarting');

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

        serverProcess = spawn(javaExecutablePath, javaArgs, { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'] });
        serverProcess.killedInternally = false;
        let serverIsFullyStarted = false;

        if (performanceStatsInterval) clearInterval(performanceStatsInterval);

        performanceStatsInterval = setInterval(async () => {
            if (!serverProcess || serverProcess.killed) {
                clearInterval(performanceStatsInterval);
                return;
            }
            try {
                const stats = await pidusage(serverProcess.pid);
                const memoryGB = stats.memory / (1024 * 1024 * 1024);
                getMainWindow()?.webContents.send('update-performance-stats', { memoryGB });
                if (serverProcess && serverProcess.stdin && serverProcess.stdin.writable) {
                    serverProcess.stdin.write("tps\n");
                }
            } catch (e) {
                clearInterval(performanceStatsInterval);
                if (localIsServerRunningGlobal) {
                    log.error('Lost connection to server process (pidusage failed).', e);
                    sendConsole('Lost connection to the server process.', 'ERROR');
                    sendStatus('Server stopped unexpectedly.', false, 'serverStoppedUnexpectedly');
                    sendServerStateChange(false);
                    setDiscordActivity();
                    serverProcess = null;

                    const launcherSettings = readLauncherSettings();
                    if (launcherSettings.autoStartServer) {
                        sendConsole('Attempting to auto-restart server...', 'WARN');
                        const delay = launcherSettings.autoStartDelay || 5;
                        mainWindow.webContents.send('start-countdown', 'restart', delay);
                    }
                }
            }
        }, 2000);

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
                setDiscordActivity();
            }
        });

        serverProcess.stderr.on('data', (data) => {
            sendConsole(ansiConverter.toHtml(data.toString()), 'SERVER_LOG_HTML');
        });

        serverProcess.on('close', (code) => {
            if (performanceStatsInterval) clearInterval(performanceStatsInterval); 
            const killedInternally = serverProcess?.killedInternally;
            serverProcess = null;
            sendServerStateChange(false);
            setDiscordActivity();
    
            if (killedInternally) {
                sendConsole('Server process stopped normally.', 'INFO');
            } else {
                sendStatus('Server stopped unexpectedly.', false, 'serverStoppedUnexpectedly');
                sendConsole(`Server process exited unexpectedly with code ${code}.`, 'ERROR');
                
                const launcherSettings = readLauncherSettings();
                if (launcherSettings.autoStartServer) {
                    sendConsole('Attempting to auto-restart server...', 'WARN');
                    const delay = launcherSettings.autoStartDelay || 5;
                    mainWindow.webContents.send('start-countdown', 'restart', delay);
                }
            }
        });

        serverProcess.on('error', (err) => {
            if (performanceStatsInterval) clearInterval(performanceStatsInterval); 
            sendConsole(`Failed to start process: ${err.message}`, 'ERROR');
            sendStatus(err.message.includes('ENOENT') ? 'Java not found!' : 'Server start failed.', false, err.message.includes('ENOENT') ? 'javaNotFound' : 'serverStartFailed');
            serverProcess = null;
            sendServerStateChange(false);
        });
    } catch (error) {
        if (performanceStatsInterval) clearInterval(performanceStatsInterval);
        sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
        serverProcess = null;
        sendServerStateChange(false);
        sendStatus('Error starting server.', false, 'error');
    }
});

ipcMain.on('stop-server', async () => {
    if (!serverProcess || serverProcess.killed) { sendConsole('Server not running.', 'WARN'); return; }
    if (performanceStatsInterval) clearInterval(performanceStatsInterval);
    sendConsole('Stopping server...', 'INFO');
    sendStatus('Stopping server...', true, 'serverStopping');
    serverProcess.killedInternally = true;
    try {
        if (serverProcess.stdin.writable) {
            serverProcess.stdin.write("stop\n");
        }
    } catch (e) {
        serverProcess.kill('SIGKILL');
    }
    setTimeout(() => { if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGKILL'); }, 10000);
});

ipcMain.on('send-command', (event, command) => {
    const trimmedCommand = command.trim().toLowerCase();
    if (trimmedCommand === 'tps' || trimmedCommand === '/tps') {
        manualTpsCheck = true;
    }
    if (serverProcess && serverProcess.stdin.writable) {
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