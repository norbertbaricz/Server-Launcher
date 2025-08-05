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
const MINIMUM_JAVA_VERSION = 21;

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
let tpsRequestStartTime;
let manualListCheck = false;

// --- Funcții Helper (neschimbate) ---
async function killStrayServerProcess() { /* ... codul existent ... */ }
async function checkJava() { /* ... codul existent ... */ }
async function downloadAndInstallJava() { /* ... codul existent ... */ }
function getMainWindow() { return mainWindow; }
function sendStatus(fallbackMessage, pulse = false, translationKey = null) { getMainWindow()?.webContents.send('update-status', fallbackMessage, pulse, translationKey); }
function sendConsole(message, type = 'INFO') { getMainWindow()?.webContents.send('update-console', message, type); }
function sendServerStateChange(isRunning) { localIsServerRunningGlobal = isRunning; getMainWindow()?.webContents.send('server-state-change', isRunning); }
function readJsonFile(filePath, fileNameForLog) { try { if (fs.existsSync(filePath)) { const fileData = fs.readFileSync(filePath, 'utf8'); if (fileData.trim() === "") { return {}; } return JSON.parse(fileData); } } catch (error) { sendConsole(`Error reading or parsing ${fileNameForLog}: ${error.message}`, 'ERROR'); } return {}; }
function writeJsonFile(filePath, dataObject, fileNameForLog) { try { fs.writeFileSync(filePath, JSON.stringify(dataObject, null, 2)); } catch (error) { sendConsole(`Error writing ${fileNameForLog}: ${error.message}`, 'ERROR'); } }
function readServerConfig() { return readJsonFile(serverConfigFilePath, serverConfigFileName); }
function writeServerConfig(configObject) { writeJsonFile(serverConfigFilePath, configObject, serverConfigFileName); }
function readLauncherSettings() { return readJsonFile(launcherSettingsFilePath, launcherSettingsFileName); }
function writeLauncherSettings(settingsObject) { writeJsonFile(launcherSettingsFilePath, settingsObject, launcherSettingsFileName); }
function getLocalIPv4() { /* ... codul existent ... */ }
async function getPublicIP() { /* ... codul existent ... */ }

// --- Logica Discord RPC (neschimbată) ---
function setDiscordActivity() { /* ... codul existent ... */ }

// --- Logica Ferestrei Principale (neschimbată) ---
function createWindow() { /* ... codul existent ... */ }
app.whenReady().then(async () => { /* ... codul existent ... */ });
autoUpdater.on('update-downloaded', (info) => { /* ... codul existent ... */ });
app.on('window-all-closed', () => { /* ... codul existent ... */ });
ipcMain.on('minimize-window', () => getMainWindow()?.minimize());
ipcMain.on('maximize-window', () => { /* ... codul existent ... */ });
ipcMain.on('close-window', () => getMainWindow()?.close());
ipcMain.handle('get-icon-path', () => { /* ... codul existent ... */ });
ipcMain.on('app-ready-to-show', () => { mainWindow.show(); });
ipcMain.handle('get-app-version', () => version);
ipcMain.on('open-plugins-folder', () => { /* ... codul existent ... */ });

// --- IPC Handlers MODIFICATE și NOI ---

ipcMain.handle('get-settings', () => readLauncherSettings());
ipcMain.on('set-settings', (event, settings) => {
    const currentSettings = readLauncherSettings();
    const newSettings = { ...currentSettings, ...settings };
    app.setLoginItemSettings({ openAtLogin: newSettings.openAtLogin });
    writeLauncherSettings(newSettings);
});

ipcMain.handle('get-server-config', () => readServerConfig());
ipcMain.handle('get-server-properties', () => { /* ... codul existent ... */ });
ipcMain.on('set-server-properties', (event, newProperties) => { /* ... codul existent ... */ });
ipcMain.on('start-java-install', () => downloadAndInstallJava());
ipcMain.on('restart-app', () => { app.relaunch(); app.quit(); });
ipcMain.handle('get-app-path', () => app.getAppPath());

ipcMain.handle('check-initial-setup', async () => {
    const config = readServerConfig();
    const serverType = config.serverType || 'papermc'; // Default to papermc
    let jarName;
    
    switch(serverType) {
        case 'fabric':
            jarName = 'fabric-server-launch.jar';
            break;
        case 'forge':
            // Forge jar name is dynamic, we need to find it
            const files = fs.readdirSync(serverFilesDir);
            jarName = files.find(file => file.startsWith('forge-') && file.endsWith('.jar') && !file.includes('installer'));
            break;
        case 'papermc':
        default:
            jarName = 'paper.jar';
            break;
    }
    
    const jarExists = jarName ? fs.existsSync(path.join(serverFilesDir, jarName)) : false;
    const configExists = fs.existsSync(serverConfigFilePath);
    
    const needsSetup = !jarExists || !configExists;
    if (!needsSetup) sendConsole(`Setup check OK for ${serverType}.`, 'INFO');
    
    return { needsSetup, config: configExists ? config : {} };
});

// NOU: Funcție generică pentru a obține versiunile
async function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`API Error (Status ${res.statusCode})`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse JSON response.'));
                }
            });
        }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
    });
}

ipcMain.handle('get-available-versions', async (event, serverType) => {
    try {
        switch (serverType) {
            case 'fabric':
                const fabricVersions = await fetchJson('https://meta.fabricmc.net/v2/versions/game');
                return fabricVersions.filter(v => v.stable).map(v => v.version);
            case 'forge':
                const forgeVersions = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                return Object.keys(forgeVersions.promos).filter(v => v.endsWith('-latest')).map(v => v.replace('-latest', ''));
            case 'papermc':
            default:
                const paperProject = await fetchJson('https://api.papermc.io/v2/projects/paper');
                return paperProject.versions.reverse();
        }
    } catch (error) {
        sendConsole(`Could not fetch versions for ${serverType}: ${error.message}`, 'ERROR');
        return [];
    }
});


// NOU: Funcție de descărcare generică
ipcMain.on('configure-server', async (event, { serverType, mcVersion, ramAllocation, javaArgs }) => {
    sendConsole(`Configuring for ${serverType}: Version ${mcVersion}, RAM ${ramAllocation}`, 'INFO');

    // Salvează configurația
    const currentConfig = readServerConfig();
    const oldConfig = { ...currentConfig };
    
    currentConfig.serverType = serverType;
    currentConfig.version = mcVersion;
    currentConfig.javaArgs = javaArgs || 'Default';
    currentConfig.ram = (ramAllocation?.toLowerCase() !== 'auto') ? ramAllocation : undefined;
    
    writeServerConfig(currentConfig);

    // Șterge fișierele vechi dacă tipul de server sau versiunea s-a schimbat
    if (oldConfig.serverType !== serverType || oldConfig.version !== mcVersion) {
        sendConsole('Server type or version changed, cleaning up old files...', 'INFO');
        const files = fs.readdirSync(serverFilesDir);
        files.forEach(file => {
            if (file.endsWith('.jar') || file === 'libraries' || file.startsWith('unix_args') || file.startsWith('win_args')) {
                try {
                    const fullPath = path.join(serverFilesDir, file);
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullPath);
                    }
                } catch (e) {
                    sendConsole(`Could not remove old file/folder: ${file}`, 'WARN');
                }
            }
        });
    }

    sendStatus(`Downloading ${serverType} ${mcVersion}...`, true, 'downloading');

    try {
        let downloadUrl, fileName;

        switch (serverType) {
            case 'papermc':
                const builds = await fetchJson(`https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`);
                const latestBuild = builds.builds.pop();
                fileName = latestBuild.downloads.application.name;
                downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild.build}/downloads/${fileName}`;
                fileName = 'paper.jar'; // Redenumim pentru consistență
                break;
            case 'fabric':
                const loaderData = await fetchJson('https://meta.fabricmc.net/v2/versions/loader');
                const installerData = await fetchJson('https://meta.fabricmc.net/v2/versions/installer');
                const latestLoader = loaderData[0].version;
                const latestInstaller = installerData[0].version;
                fileName = `fabric-server-launch.jar`;
                downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${latestLoader}/${latestInstaller}/server/jar`;
                break;
            case 'forge':
                const promos = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                const forgeVersion = promos.promos[`${mcVersion}-latest`];
                if (!forgeVersion) throw new Error(`Could not find latest Forge for MC ${mcVersion}`);
                fileName = `forge-${mcVersion}-${forgeVersion}-installer.jar`;
                downloadUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/versions/${mcVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
                break;
        }

        const filePath = path.join(serverFilesDir, fileName);
        const fileStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            https.get(downloadUrl, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (res) => {
                if (res.statusCode !== 200) return reject(new Error(`Download failed (Status ${res.statusCode})`));
                res.pipe(fileStream);
                fileStream.on('finish', () => fileStream.close(resolve));
            }).on('error', err => reject(err));
        });

        sendConsole(`Downloaded ${fileName}.`, 'SUCCESS');

        if (serverType === 'forge') {
            sendStatus('Installing Forge server...', true, 'downloading');
            await new Promise((resolve, reject) => {
                const installerProcess = spawn(javaExecutablePath, ['-jar', fileName, '--installServer'], { cwd: serverFilesDir });
                installerProcess.stdout.on('data', data => sendConsole(data.toString(), 'INFO'));
                installerProcess.stderr.on('data', data => sendConsole(data.toString(), 'SERVER_ERROR'));
                installerProcess.on('close', code => {
                    if (code === 0) {
                        sendConsole('Forge server installed successfully.', 'SUCCESS');
                        fs.unlinkSync(filePath); // Șterge installer-ul
                        resolve();
                    } else {
                        reject(new Error(`Forge installer failed with code ${code}.`));
                    }
                });
            });
        }
        
        sendStatus(`${serverType} configured successfully!`, false, 'downloadSuccess');

    } catch (error) {
        sendStatus('Configuration failed.', false, 'downloadFailed');
        sendConsole(`ERROR: ${error.message}`, 'ERROR');
    } finally {
        getMainWindow()?.webContents.send('setup-finished');
    }
});

ipcMain.on('start-server', async () => {
    // ... (restul logicii de start server)
    const serverConfig = readServerConfig();
    const serverType = serverConfig.serverType || 'papermc';
    
    let jarName, startArgs = [];
    
    switch (serverType) {
        case 'fabric':
            jarName = 'fabric-server-launch.jar';
            break;
        case 'forge':
            const files = fs.readdirSync(serverFilesDir);
            jarName = files.find(file => file.startsWith('forge-') && file.endsWith('.jar') && !file.includes('installer'));
            
            // Forge folosește argumente speciale
            const argsFile = os.platform() === 'win32' ? 'win_args.txt' : 'unix_args.txt';
            const argsPath = path.join(serverFilesDir, 'libraries', 'net', 'minecraftforge', 'forge', `${serverConfig.version}-${files.find(f => f.startsWith('forge-')).split('-')[2]}`, argsFile);
            if (fs.existsSync(argsPath)) {
                // Nu folosim direct @, ci citim argumentele
                // startArgs = [`@${argsPath}`]; - poate da erori
            }
            break;
        case 'papermc':
        default:
            jarName = 'paper.jar';
            break;
    }

    const serverJarPath = path.join(serverFilesDir, jarName);
    if (!fs.existsSync(serverJarPath)) { /* ... eroare ... */ return; }

    const eulaPath = path.join(serverFilesDir, 'eula.txt');
    try {
        fs.writeFileSync(eulaPath, 'eula=true\n');
        sendConsole('EULA accepted.', 'INFO');
    } catch (error) { /* ... eroare ... */ return; }
    
    let ramToUseForJava = "";
    //... (logica pentru RAM)

    const javaArgsProfile = serverConfig.javaArgs || 'Default';
    const baseArgs = (javaArgsProfile === 'Performance') ? [/*...*/] : [/*...*/];
    
    // Adaugă argumentele specifice tipului de server
    const finalArgs = [...baseArgs.slice(0, -3), ...startArgs, '-jar', jarName, 'nogui'];
    
    // ... restul funcției `start-server` cu `finalArgs`...
});

ipcMain.on('send-command', (event, command) => {
    const trimmedCommand = command.trim().toLowerCase();
    if (trimmedCommand === 'list' || trimmedCommand === '/list') {
        manualListCheck = true;
    }
    // ... restul funcției ...
});