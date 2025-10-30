const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { version } = require('./package.json');
const https = require('node:https');
const http = require('node:http');
const { spawn, exec } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const RPC = require('discord-rpc');
const pidusage = require('pidusage');
const AnsiToHtml = require('ansi-to-html');
const find = require('find-process');
const AdmZip = require('adm-zip');

const SOUND_CANDIDATES = {
  error: ['error.mp3', 'error.wav'],
  startup: ['startup.mp3', 'startup.wav'],
  status: ['status.mp3', 'status.wav'],
  success: ['success.mp3', 'success.wav']
};
const DEFAULT_SOUND_TYPE = 'status';
const SOUND_SEARCH_DIRS = ['', 'sounds'];
const ERROR_SOUND_KEYWORDS = ['error', 'failed', 'fail', 'not found', 'crash', 'stopped unexpectedly', 'timed out', 'unavailable', 'unable'];
const SUCCESS_SOUND_KEYWORDS = ['success', 'successfully', 'ready', 'completed', 'installed', 'configured', 'downloaded', 'server started', 'server ready', 'done'];
const NGROK_API_ENDPOINT = 'http://127.0.0.1:4040/api/tunnels';
const PUBLIC_IP_USER_AGENT = 'MyMinecraftLauncher/1.0';
const DEFAULT_JAVA_SERVER_PORT = 25565;

const SERVER_TYPES = {
  PAPER: 'papermc',
  FABRIC: 'fabric',
  BEDROCK: 'bedrock'
};

function normalizeServerType(type) {
  if (type === SERVER_TYPES.FABRIC) return SERVER_TYPES.FABRIC;
  if (type === SERVER_TYPES.BEDROCK) return SERVER_TYPES.BEDROCK;
  return SERVER_TYPES.PAPER;
}

function isJavaServer(type) {
  return type === SERVER_TYPES.PAPER || type === SERVER_TYPES.FABRIC;
}

function getBedrockExecutableName() {
  return process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server';
}

function getBedrockPlatformFolder() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'linux') return 'linux';
  return null;
}

function fetchJson(url, description = 'request') {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchJson(res.headers.location, description).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${description} failed (${res.statusCode})`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON from ${description}: ${e.message}`)); }
      });
    }).on('error', err => reject(new Error(`${description} error: ${err.message}`)));
  });
}

function sortVersionsDesc(list) {
  const copy = Array.isArray(list) ? [...list] : [];
  copy.sort((a, b) => {
    const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da !== db) return db - da;
    }
    return 0;
  });
  return copy;
}

function getServerFlavorLabel(type) {
  if (type === SERVER_TYPES.FABRIC) return 'Modded';
  if (type === SERVER_TYPES.BEDROCK) return 'Bedrock';
  return 'Vanilla';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let javaExecutablePath = 'java';
let MINIMUM_JAVA_VERSION = 17;
let lastPublicAddressSource = null;
let ngrokProcess = null;
let ngrokTargetPort = null;
let ngrokUnavailablePermanently = false;
let ngrokStopRequested = false;
let lastNgrokDiagnosticCode = null;
const execAsync = promisify(exec);

try { app.setName('Server Launcher'); } catch (_) {}

function getCleanEnvForJava() {
  const env = { ...process.env };
  delete env.LD_LIBRARY_PATH;
  delete env.SNAP;
  delete env.SNAP_NAME;
  delete env.SNAP_VERSION;
  delete env.SNAP_REVISION;
  delete env.SNAP_ARCH;
  delete env.SNAP_LIBRARY_PATH;
  return env;
}

async function ensureBundledJavaLinux() {
  if (process.platform !== 'linux' || !app.isPackaged) return false;
  try {
    const userDataPath = app.getPath('userData');
    const jdkBaseDir = path.join(userDataPath, 'embedded-jdk-21');
    if (!fs.existsSync(jdkBaseDir)) fs.mkdirSync(jdkBaseDir, { recursive: true });

    const findJava = (base) => {
      try {
        const entries = fs.readdirSync(base, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const p = path.join(base, e.name, 'bin', 'java');
          if (fs.existsSync(p)) return p;
        }
      } catch (_) {}
      return null;
    };

    let existingJava = findJava(jdkBaseDir);
    if (existingJava) {
      javaExecutablePath = existingJava;
      return true;
    }

    const archMap = { x64: 'x64', arm64: 'aarch64' };
    const arch = archMap[process.arch] || 'x64';
    const apiUrl = `https://api.adoptium.net/v3/assets/latest/21/hotspot?os=linux&architecture=${arch}&image_type=jdk`;
    const win = getMainWindow();
    if (win) win.webContents.send('java-install-status', 'Downloading embedded Java for Linux...', 0);

    const apiResponse = await new Promise((resolve, reject) => {
      https.get(apiUrl, { headers: { 'User-Agent': 'Server-Launcher-Electron' } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Adoptium API error ${res.statusCode}`)); }
        let data=''; res.on('data', c=>data+=c); res.on('end', ()=>{ try { resolve(JSON.parse(data)); } catch(e){ reject(e);} });
      }).on('error', reject);
    });
    const asset = Array.isArray(apiResponse) ? apiResponse[0] : null;
    const pkg = asset?.binary?.package;
    if (!pkg?.link || !pkg?.name || !pkg.name.endsWith('.tar.gz')) {
      throw new Error('No suitable Linux JDK tar.gz found from Adoptium.');
    }
    const tmpPath = path.join(app.getPath('temp'), pkg.name);
    await new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(tmpPath);
      https.get(pkg.link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
        if (response.statusCode !== 200) return reject(new Error(`JDK download failed ${response.statusCode}`));
        response.pipe(fileStream);
        fileStream.on('finish', () => fileStream.close(resolve));
      }).on('error', err => fs.unlink(tmpPath, () => reject(err)));
    });

    await new Promise((resolve, reject) => {
      const args = ['-xzf', tmpPath, '-C', jdkBaseDir];
      const proc = spawn('tar', args, { stdio: ['ignore','ignore','pipe'] });
      let err = '';
      proc.stderr.on('data', d => err += d.toString());
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tar failed: ${err || code}`)));
      proc.on('error', reject);
    });

    existingJava = findJava(jdkBaseDir);
    if (!existingJava) throw new Error('Embedded JDK extraction: java binary not found.');
    javaExecutablePath = existingJava;
    return true;
  } catch (e) {
    sendConsole(`Embedded Java install (Linux) failed: ${e.message}`, 'ERROR');
    return false;
  }
}

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
let startupSoundPlayed = false;
let lastStatusSoundSignature = null;
let lastStatusSoundAt = 0;

let serverFilesDir;
const paperJarName = 'paper.jar';
let serverProcess = null;
const fabricJarName = 'fabric-server-launch.jar';
const fabricInstallerJarName = 'fabric-installer.jar';

function getConfiguredServerType() {
  try {
    const cfg = readServerConfig();
    return normalizeServerType(cfg?.serverType);
  } catch (_) { return SERVER_TYPES.PAPER; }
}

function getServerJarNameForType(serverType) {
  return serverType === SERVER_TYPES.FABRIC ? fabricJarName : paperJarName;
}

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
let manualListCheck = false; 
let latencyProbeActive = false;
let latencyProbeStart = 0;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = getMainWindow();
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

async function killStrayServerProcess() {
    try {
        const processes = await find('name', 'java', true);
        const serverJarPaper = path.join(serverFilesDir, paperJarName);
        const serverJarFabric = path.join(serverFilesDir, fabricJarName);
        const bedrockExecutableName = getBedrockExecutableName();
        const bedrockExecutablePath = path.join(serverFilesDir, bedrockExecutableName);

        for (const p of processes) {
            if (p.cmd.includes(serverJarPaper) || p.cmd.includes(serverJarFabric)) {
                log.warn(`Found a stray server process with PID ${p.pid}. Attempting to kill it.`);
                sendConsole(`Found a stray server process (PID: ${p.pid}). Terminating...`, 'WARN');
                process.kill(p.pid);
            }
        }
        if (bedrockExecutableName) {
            const allProcesses = await find('name', bedrockExecutableName.replace('.exe', ''), true);
            for (const proc of allProcesses) {
                const cmd = (proc.cmd || '').toLowerCase();
                if (cmd.includes('bedrock_server') || (bedrockExecutablePath && cmd.includes(path.basename(bedrockExecutablePath).toLowerCase()))) {
                    log.warn(`Found a stray Bedrock server process with PID ${proc.pid}. Attempting to kill it.`);
                    sendConsole(`Found a stray Bedrock server process (PID: ${proc.pid}). Terminating...`, 'WARN');
                    process.kill(proc.pid);
                }
            }
        }
    } catch (err) {
        log.error('Error while trying to find and kill stray server processes:', err);
        sendConsole('Error checking for stray server processes.', 'ERROR');
    }
}

async function checkJava() {
    const verifyJavaVersion = async (javaPath) => {
        try {
            const { stdout, stderr } = await execAsync(`"${javaPath}" -version`, { env: getCleanEnvForJava() });
            const output = (stderr || stdout || '').toString();
            const versionMatch = output.match(/version "(\d+)/);
            if (versionMatch && parseInt(versionMatch[1], 10) >= MINIMUM_JAVA_VERSION) {
                javaExecutablePath = javaPath;
                return true;
            }
        } catch (_) {
            return false;
        }
        return false;
    };

    const checkWindowsRegistry = async () => {
        if (process.platform !== 'win32') return null;
        const keysToQuery = [
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\Eclipse Adoptium\\JDK',
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\JavaSoft\\JDK',
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\Amazon Corretto\\JDK'
        ];
        for (const key of keysToQuery) {
            let stdout;
            try {
                ({ stdout } = await execAsync(`reg query "${key}" /s`));
            } catch (_) {
                continue;
            }
            const lines = stdout.trim().split(/[\r\n]+/).filter(line => line.trim().startsWith('HKEY_'));
            for (const line of lines) {
                try {
                    const { stdout: homeStdout } = await execAsync(`reg query "${line.trim()}" /v JavaHome`);
                    const match = homeStdout.match(/JavaHome\s+REG_SZ\s+(.*)/);
                    if (match && match[1]) {
                        const javaExe = path.join(match[1].trim(), 'bin', 'java.exe');
                        if (fs.existsSync(javaExe) && await verifyJavaVersion(javaExe)) {
                            return javaExe;
                        }
                    }
                } catch (_) {
                    continue;
                }
            }
        }
        return null;
    };

    const checkMacJavaHome = async () => {
        if (process.platform !== 'darwin') return null;
        try {
            const { stdout } = await execAsync(`/usr/libexec/java_home -v ${MINIMUM_JAVA_VERSION}`);
            const home = stdout.toString().trim();
            if (!home) return null;
            const javaExe = path.join(home, 'bin', 'java');
            if (fs.existsSync(javaExe) && await verifyJavaVersion(javaExe)) {
                return javaExe;
            }
        } catch (_) {}
        return null;
    };

    log.info(`Checking for Java >= ${MINIMUM_JAVA_VERSION}...`);

    const registryPath = await checkWindowsRegistry();
    if (registryPath) {
        log.info(`Java >= ${MINIMUM_JAVA_VERSION} verified at: ${registryPath}`);
        return true;
    }

    const macPath = await checkMacJavaHome();
    if (macPath) {
        log.info(`Java >= ${MINIMUM_JAVA_VERSION} verified at: ${macPath}`);
        return true;
    }

    if (await verifyJavaVersion('java')) {
        log.info(`Java >= ${MINIMUM_JAVA_VERSION} found in system PATH.`);
        javaExecutablePath = 'java';
        return true;
    }

    if (process.platform === 'linux' && app.isPackaged) {
        const installed = await ensureBundledJavaLinux();
        if (installed && await verifyJavaVersion(javaExecutablePath)) {
            log.info(`Java >= ${MINIMUM_JAVA_VERSION} verified at: ${javaExecutablePath}`);
            return true;
        }
    }

    log.warn(`No compatible Java version found (requires ${MINIMUM_JAVA_VERSION}).`);
    return false;
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
    handleStatusSound(fallbackMessage, translationKey, pulse);
}
function sendConsole(message, type = 'INFO') {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update-console', message, type);
}
function sendServerStateChange(isRunning) {
    localIsServerRunningGlobal = isRunning;
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('server-state-change', isRunning);
    if (isRunning) {
        ensureNgrokTunnelForCurrentServerPort().catch((err) => {
            if (err && typeof log.debug === 'function') log.debug(`Ngrok ensure failed: ${err.message}`);
        });
    } else {
        stopNgrokTunnel();
    }
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

function refreshMinimumJavaRequirementFromConfig() {
    try {
        if (!serverConfigFilePath || !fs.existsSync(serverConfigFilePath)) {
            MINIMUM_JAVA_VERSION = 17;
            return;
        }
        const cfg = readServerConfig();
        const type = normalizeServerType(cfg?.serverType);
        if (isJavaServer(type)) {
            MINIMUM_JAVA_VERSION = cfg?.version ? requiredJavaForVersion(cfg.version) : 17;
        } else {
            MINIMUM_JAVA_VERSION = 0;
        }
    } catch (_) {
        MINIMUM_JAVA_VERSION = 17;
    }
}

function shouldCheckForUpdates() {
    if (!app.isPackaged) return false;
    if (process.platform === 'win32' || process.platform === 'darwin') return true;
    if (process.platform === 'linux') return Boolean(process.env.APPIMAGE);
    return false;
}

function requiredJavaForVersion(mcVersion) {
    try {
        if (!mcVersion) return 17;
        const parts = mcVersion.split('.').map(x => parseInt(x, 10));
        const major = parts[0] || 1;
        const minor = parts[1] || 0;
        const patch = parts[2] || 0;
        if (major === 1 && (minor > 20 || (minor === 20 && patch >= 5))) return 21;
        return 17;
    } catch { return 21; }
}

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

function getNotificationIconPath() {
    try {
        const platform = process.platform;
        const resources = process.resourcesPath;
        const buildDir = path.join(__dirname, 'build');
        if (platform === 'win32') {
            const icoRes = path.join(resources, 'icon.ico');
            const icoBuild = path.join(buildDir, 'icon.ico');
            return fs.existsSync(icoRes) ? icoRes : (fs.existsSync(icoBuild) ? icoBuild : undefined);
        } else if (platform === 'darwin') {
            const icnsRes = path.join(resources, 'icon.icns');
            const icnsBuild = path.join(buildDir, 'icon.icns');
            return fs.existsSync(icnsRes) ? icnsRes : (fs.existsSync(icnsBuild) ? icnsBuild : undefined);
        } else {
            const pngRes = path.join(resources, 'icon.png');
            const pngBuild = path.join(buildDir, 'icon.png');
            return fs.existsSync(pngRes) ? pngRes : (fs.existsSync(pngBuild) ? pngBuild : undefined);
        }
    } catch (_) { return undefined; }
}

function showDesktopNotification(title, body) {
    try {
        if (!Notification || !Notification.isSupported()) return;
        const settings = readLauncherSettings();
        if (settings && settings.notificationsEnabled === false) return;
        const iconPath = getNotificationIconPath();
        const notif = new Notification({ title, body, icon: iconPath, silent: false });
        notif.show();
    } catch (_) { /* ignore notification errors */ }
}

function resolveAssetFile(relativePath) {
    try {
        const resources = process.resourcesPath;
        const buildDir = path.join(__dirname, 'build');
        const candidateFromResources = path.join(resources, relativePath);
        if (fs.existsSync(candidateFromResources)) return candidateFromResources;
        const candidateFromBuild = path.join(buildDir, relativePath);
        if (fs.existsSync(candidateFromBuild)) return candidateFromBuild;
    } catch (_) {}
    return null;
}

function getSoundFilePath(type) {
    const canonicalType = SOUND_CANDIDATES[type] ? type : DEFAULT_SOUND_TYPE;
    const candidates = SOUND_CANDIDATES[canonicalType] || [];
    for (const candidate of candidates) {
        for (const dir of SOUND_SEARCH_DIRS) {
            const relativePath = dir ? path.join(dir, candidate) : candidate;
            const resolved = resolveAssetFile(relativePath);
            if (resolved) return resolved;
        }
    }
    if (canonicalType !== DEFAULT_SOUND_TYPE) {
        return getSoundFilePath(DEFAULT_SOUND_TYPE);
    }
    return null;
}

function playSoundEffect(requestedType = DEFAULT_SOUND_TYPE) {
    const type = SOUND_CANDIDATES[requestedType] ? requestedType : DEFAULT_SOUND_TYPE;
    let win = null;
    try {
        const settings = readLauncherSettings();
        if (settings && settings.notificationsEnabled === false) return;
        const soundPath = getSoundFilePath(type);
        win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        const payload = soundPath ? pathToFileURL(soundPath).href : null;
        win.webContents.send('play-sound', payload);
    } catch (_) {
        if (!win) win = getMainWindow();
        if (win && !win.isDestroyed()) win.webContents.send('play-sound', null);
    }
}

function stringContainsKeyword(text, keywords) {
    if (!text) return false;
    return keywords.some(keyword => text.includes(keyword));
}

function isProgressStatusMessage(message, key) {
    if (!message && !key) return false;
    if (message && /\d{1,3}%/.test(message)) return true;
    if (message && /\b\d+(\.\d+)?\s?(kb|mb|gb)(\/s)?\b/.test(message)) return true;
    if (message && message.includes('download speed')) return true;
    return false;
}

function handleStatusSound(fallbackMessage, translationKey, pulse) {
    try {
        const message = (fallbackMessage || '').toLowerCase();
        const key = (translationKey || '').toLowerCase();
        if (!message && !key) return;
        if (isProgressStatusMessage(message, key)) return;

        const signature = key || message;
        const now = Date.now();
        if (signature && signature === lastStatusSoundSignature && (now - lastStatusSoundAt) < 1500) {
            return;
        }

        if (stringContainsKeyword(key, ERROR_SOUND_KEYWORDS) || stringContainsKeyword(message, ERROR_SOUND_KEYWORDS)) {
            playSoundEffect('error');
        } else if (stringContainsKeyword(key, SUCCESS_SOUND_KEYWORDS) || stringContainsKeyword(message, SUCCESS_SOUND_KEYWORDS)) {
            playSoundEffect('success');
        } else {
            playSoundEffect('status');
        }

        if (signature) {
            lastStatusSoundSignature = signature;
            lastStatusSoundAt = now;
        }
    } catch (_) {}
}

function fetchNgrokTunnels() {
    return new Promise((resolve, reject) => {
        const request = http.get(NGROK_API_ENDPOINT, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                const error = new Error(`Ngrok API responded with status ${res.statusCode}`);
                error.code = 'NGROK_BAD_STATUS';
                return reject(error);
            }
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (err) {
                    err.code = 'NGROK_BAD_JSON';
                    reject(err);
                }
            });
        });
        request.setTimeout(2000, () => {
            const timeoutError = new Error('Ngrok API request timed out');
            timeoutError.code = 'NGROK_TIMEOUT';
            request.destroy(timeoutError);
        });
        request.on('error', (err) => reject(err));
    });
}

function extractPortFromAddress(addr) {
    if (typeof addr !== 'string') return null;
    const match = addr.trim().match(/:(\d{1,5})$/);
    if (!match) return null;
    const parsed = parseInt(match[1], 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return null;
    return parsed;
}

async function getNgrokTcpTunnelInfo() {
    try {
        const payload = await fetchNgrokTunnels();
        const tunnels = Array.isArray(payload?.tunnels) ? payload.tunnels : [];
        if (!tunnels.length) return null;

        const tcpTunnels = tunnels.filter((tunnel) => {
            if (!tunnel || typeof tunnel !== 'object') return false;
            if (typeof tunnel.public_url !== 'string') return false;
            if (!tunnel.public_url.startsWith('tcp://')) return false;
            if (tunnel.proto && tunnel.proto !== 'tcp') return false;
            return true;
        });
        if (!tcpTunnels.length) return null;

        const preferredTunnel = tcpTunnels.find((tunnel) => {
            const addr = tunnel.config?.addr;
            if (typeof addr !== 'string') return false;
            return addr.includes('25565') || addr.includes('25575');
        });
        const selectedTunnel = preferredTunnel || tcpTunnels[0];
        const publicUrl = typeof selectedTunnel.public_url === 'string' ? selectedTunnel.public_url : null;
        if (!publicUrl) return null;
        lastNgrokDiagnosticCode = null;
        return {
            publicUrl,
            configAddr: typeof selectedTunnel.config?.addr === 'string' ? selectedTunnel.config.addr : null
        };
    } catch (error) {
        const ignorableCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'NGROK_BAD_STATUS', 'NGROK_TIMEOUT', 'NGROK_BAD_JSON']);
        const code = error.code || 'UNKNOWN';
        if (ignorableCodes.has(code)) {
            const shouldLog = (code !== 'ECONNREFUSED') || !!ngrokProcess;
            if (shouldLog && typeof log.debug === 'function') {
                if (code !== lastNgrokDiagnosticCode) {
                    log.debug(`Ngrok tunnel not available: ${error.message}`);
                    lastNgrokDiagnosticCode = code;
                }
            }
        } else {
            if (code !== lastNgrokDiagnosticCode) {
                log.warn(`Ngrok tunnel check failed: ${error.message}`);
                lastNgrokDiagnosticCode = code;
            }
        }
        return null;
    }
}

async function fetchPublicIPFromIpify() {
    return new Promise((resolve, reject) => {
        const request = https.get(
            'https://api.ipify.org?format=json',
            { headers: { 'User-Agent': PUBLIC_IP_USER_AGENT } },
            (res) => {
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
            }
        );
        request.setTimeout(5000, () => {
            request.destroy(new Error('Timeout while fetching public IP'));
        });
        request.on('error', (err) => {
            reject(new Error(`Error fetching public IP: ${err.message}`));
        });
    });
}

async function resolvePublicAddress() {
    let ngrokInfo = await getNgrokTcpTunnelInfo();
    if ((!ngrokInfo || !ngrokInfo.publicUrl) && localIsServerRunningGlobal) {
        const started = await ensureNgrokTunnelForCurrentServerPort(ngrokInfo);
        if (started) {
            await delay(800);
            ngrokInfo = await getNgrokTcpTunnelInfo();
        }
    }
    if (ngrokInfo?.publicUrl) {
        const ngrokAddress = ngrokInfo.publicUrl.replace(/^tcp:\/\//, '');
        if (lastPublicAddressSource !== 'ngrok') {
            log.info('Using ngrok TCP tunnel for public address.');
        }
        lastPublicAddressSource = 'ngrok';
        return { address: ngrokAddress, includeServerPort: false, source: 'ngrok' };
    }
    const directIp = await fetchPublicIPFromIpify();
    if (lastPublicAddressSource !== 'direct') {
        log.info('Using direct public IP fallback.');
    }
    lastPublicAddressSource = 'direct';
    return { address: directIp, includeServerPort: true, source: 'direct' };
}

function getConfiguredJavaServerPort() {
    const props = readServerPropertiesObject();
    const raw = props['server-port'];
    const parsed = parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
    return DEFAULT_JAVA_SERVER_PORT;
}

function handleNgrokProcessOutput(data) {
    const text = data.toString().trim();
    if (!text) return;
    const lower = text.toLowerCase();
    if (lower.includes('error') || lower.includes('fail') || lower.includes('failed')) {
        sendConsole(`[ngrok] ${text}`, 'ERROR');
    } else if (lower.includes('warn')) {
        sendConsole(`[ngrok] ${text}`, 'WARN');
    } else if (lower.includes('url') || lower.includes('forwarding')) {
        sendConsole(`[ngrok] ${text}`, 'INFO');
    } else {
        log.info(`[ngrok] ${text}`);
    }
}

function startNgrokTunnel(port) {
    if (ngrokUnavailablePermanently) return false;
    try {
        if (ngrokProcess && !ngrokProcess.killed) {
            if (ngrokTargetPort === port) return true;
            stopNgrokTunnel();
        }
        const args = ['tcp', String(port)];
        ngrokStopRequested = false;
        sendConsole(`Attempting to start ngrok TCP tunnel on port ${port}...`, 'INFO');
        log.info(`Attempting to start ngrok TCP tunnel on port ${port}`);
        const proc = spawn('ngrok', args, { cwd: serverFilesDir, stdio: ['ignore', 'pipe', 'pipe'] });
        ngrokProcess = proc;
        ngrokTargetPort = port;

        proc.stdout.on('data', handleNgrokProcessOutput);
        proc.stderr.on('data', handleNgrokProcessOutput);

        proc.once('error', (err) => {
            if (err.code === 'ENOENT') {
                ngrokUnavailablePermanently = true;
                sendConsole('Ngrok executable not found. Install ngrok and ensure it is available in PATH.', 'WARN');
            } else {
                sendConsole(`Ngrok failed to start: ${err.message}`, 'ERROR');
            }
            if (ngrokProcess === proc) {
                ngrokProcess = null;
                ngrokTargetPort = null;
                lastNgrokDiagnosticCode = null;
            }
        });

        proc.once('exit', (code, signal) => {
            const manual = ngrokStopRequested;
            if (ngrokProcess === proc) {
                ngrokProcess = null;
                ngrokTargetPort = null;
                lastNgrokDiagnosticCode = null;
            }
            ngrokStopRequested = false;
            if (manual) {
                sendConsole('Ngrok tunnel stopped.', 'INFO');
            } else {
                const reason = code !== null ? `code ${code}` : `signal ${signal || 'unknown'}`;
                sendConsole(`Ngrok process exited (${reason}).`, code === 0 ? 'INFO' : 'WARN');
            }
        });
        return true;
    } catch (error) {
        sendConsole(`Failed to launch ngrok: ${error.message}`, 'ERROR');
        log.warn(`Failed to launch ngrok: ${error.message}`);
        ngrokProcess = null;
        ngrokTargetPort = null;
        return false;
    }
}

function stopNgrokTunnel() {
    if (!ngrokProcess) return;
    try {
        if (ngrokProcess.killed) {
            ngrokProcess = null;
            ngrokTargetPort = null;
            ngrokStopRequested = false;
            lastNgrokDiagnosticCode = null;
            return;
        }
        ngrokStopRequested = true;
        const killed = ngrokProcess.kill();
        if (!killed && process.platform === 'win32') {
            const killer = spawn('taskkill', ['/pid', String(ngrokProcess.pid), '/f', '/t'], { stdio: 'ignore' });
            killer.on('error', (err) => log.warn(`Failed to taskkill ngrok process: ${err.message}`));
            killer.unref();
        }
    } catch (error) {
        log.warn(`Failed to stop ngrok process: ${error.message}`);
        ngrokProcess = null;
        ngrokTargetPort = null;
        ngrokStopRequested = false;
        lastNgrokDiagnosticCode = null;
    }
}

async function ensureNgrokTunnelForCurrentServerPort(existingInfo = null) {
    if (ngrokUnavailablePermanently) return false;
    if (!localIsServerRunningGlobal) return false;

    const serverConfig = readServerConfig();
    const serverType = normalizeServerType(serverConfig.serverType);
    if (!isJavaServer(serverType)) return false;

    const desiredPort = getConfiguredJavaServerPort();
    if (!desiredPort) return false;

    const tunnelInfo = existingInfo ?? await getNgrokTcpTunnelInfo();
    if (tunnelInfo?.configAddr) {
        const activePort = extractPortFromAddress(tunnelInfo.configAddr);
        if (activePort === desiredPort) {
            return true;
        }
    }

    return startNgrokTunnel(desiredPort);
}

function createWindow () {
  const resolveIconForWindow = () => {
    try {
      const resBase = process.resourcesPath;
      const buildBase = path.join(__dirname, 'build');
      if (process.platform === 'win32') {
        const icoRes = path.join(resBase, 'icon.ico');
        const icoBuild = path.join(buildBase, 'icon.ico');
        return fs.existsSync(icoRes) ? icoRes : (fs.existsSync(icoBuild) ? icoBuild : undefined);
      } else if (process.platform === 'darwin') {
        const icnsRes = path.join(resBase, 'icon.icns');
        const icnsBuild = path.join(buildBase, 'icon.icns');
        return fs.existsSync(icnsRes) ? icnsRes : (fs.existsSync(icnsBuild) ? icnsBuild : undefined);
      } else {
        const pngRes = path.join(resBase, 'icon.png');
        const pngBuild = path.join(buildBase, 'icon.png');
        return fs.existsSync(pngRes) ? pngRes : (fs.existsSync(pngBuild) ? pngBuild : undefined);
      }
    } catch (_) { return undefined; }
  };

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: true,
    fullscreenable: true,
    frame: false,
    show: false,
    icon: resolveIconForWindow(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch (_) {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl) {
      e.preventDefault();
      try { shell.openExternal(url); } catch (_) {}
    }
  });
  mainWindow.webContents.on('did-finish-load', async () => {
      const cfg = readServerConfig();
      const type = normalizeServerType(cfg?.serverType);
      let hasJava = true;
      if (isJavaServer(type)) {
          hasJava = await checkJava();
          if (!hasJava && app.isPackaged) {
              mainWindow.webContents.send('java-install-required');
              return;
          }
      }
      
      sendServerStateChange(localIsServerRunningGlobal);
      mainWindow.webContents.send('window-maximized', mainWindow.isMaximized());

      const launcherSettings = readLauncherSettings();
      if (launcherSettings.autoStartServer) {
          const delay = launcherSettings.autoStartDelay || 5;
          mainWindow.webContents.send('start-countdown', 'initial', delay);
      }
      if (!startupSoundPlayed) {
          startupSoundPlayed = true;
          playSoundEffect('startup');
      }
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  try { if (typeof app.setDesktopName === 'function') app.setDesktopName('server-launcher.desktop'); } catch (_) {}
  serverFilesDir = path.join(userDataPath, 'MinecraftServer');
  serverConfigFilePath = path.join(serverFilesDir, serverConfigFileName);
  launcherSettingsFilePath = path.join(userDataPath, launcherSettingsFileName);
  serverPropertiesFilePath = path.join(serverFilesDir, serverPropertiesFileName);
  refreshMinimumJavaRequirementFromConfig();

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

  try { if (process.platform === 'win32') app.setAppUserModelId('com.server.launcher'); } catch (_) {}

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
  if (shouldCheckForUpdates()) {
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

app.on('before-quit', () => {
    stopNgrokTunnel();
});

app.on('window-all-closed', () => {
    if (serverProcess && typeof serverProcess.kill === 'function' && !serverProcess.killed) {
        try {
            serverProcess.killedInternally = true;
            if (serverProcess.stdin && serverProcess.stdin.writable) {
                serverProcess.stdin.write('stop\n');
            }
            setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    serverProcess.kill('SIGKILL');
                }
            }, 7000);
        } catch (_) {
            try { serverProcess.kill('SIGKILL'); } catch (_) {}
        }
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
        openAtLogin: settings.openAtLogin || false,
        autoStartServer: settings.autoStartServer || false,
        autoStartDelay: settings.autoStartDelay || 5,
        language: settings.language || 'en',
        theme: settings.theme || 'default',
        notificationsEnabled: (settings.notificationsEnabled !== false)
    };
});

ipcMain.on('set-settings', (event, settings) => {
    const currentSettings = readLauncherSettings();
    const newSettings = { ...currentSettings, ...settings };
    app.setLoginItemSettings({ openAtLogin: newSettings.openAtLogin });
    writeJsonFile(launcherSettingsFilePath, newSettings, launcherSettingsFileName);

    if (process.platform === 'linux') {
        try {
            const homeDir = os.homedir();
            const autostartDir = path.join(homeDir, '.config', 'autostart');
            const desktopFilePath = path.join(autostartDir, 'server-launcher.desktop');
            if (!fs.existsSync(autostartDir)) {
                fs.mkdirSync(autostartDir, { recursive: true });
            }
            if (newSettings.openAtLogin) {
                const execPath = app.isPackaged ? process.execPath : process.execPath;
                const name = 'Server Launcher';
                const desktopContent = [
                    '[Desktop Entry]',
                    'Type=Application',
                    `Name=${name}`,
                    `Exec="${execPath}"${app.isPackaged ? '' : ' .'}`,
                    'X-GNOME-Autostart-enabled=true',
                    'NoDisplay=false',
                    'Terminal=false',
                    `Comment=${name}`
                ].join('\n');
                fs.writeFileSync(desktopFilePath, desktopContent, 'utf8');
            } else if (fs.existsSync(desktopFilePath)) {
                fs.unlinkSync(desktopFilePath);
            }
        } catch (e) {
            log.warn('Failed to manage Linux autostart entry:', e);
        }
    }
});

ipcMain.on('start-java-install', () => {
    downloadAndInstallJava();
});
ipcMain.on('restart-app', () => {
    app.relaunch();
    app.quit();
});

ipcMain.handle('get-app-version', () => version);
ipcMain.handle('is-dev', () => !app.isPackaged);
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
    const configExists = fs.existsSync(serverConfigFilePath);
    let installExists = false;
    if (configExists) {
        const cfg = readServerConfig();
        const t = normalizeServerType(cfg.serverType);
        if (t === SERVER_TYPES.BEDROCK) {
            installExists = fs.existsSync(path.join(serverFilesDir, getBedrockExecutableName()));
        } else {
            installExists = fs.existsSync(path.join(serverFilesDir, getServerJarNameForType(t)));
        }
    }
    const needsSetup = !installExists || !configExists;
    if (!needsSetup) sendConsole(`Setup check OK.`, 'INFO');
    return { needsSetup, config: configExists ? readServerConfig() : {} };
});
ipcMain.handle('get-available-versions', async (_event, serverType) => {
    const type = normalizeServerType(serverType);
    try {
        if (type === SERVER_TYPES.PAPER) {
            const projectApiUrl = 'https://api.papermc.io/v2/projects/paper';
            const projectResponseData = await fetchJson(projectApiUrl, 'PaperMC versions');
            if (projectResponseData.versions?.length > 0) {
                return sortVersionsDesc(projectResponseData.versions);
            }
            throw new Error('No versions found.');
        } else if (type === SERVER_TYPES.FABRIC) {
            const fabricGameUrl = 'https://meta.fabricmc.net/v2/versions/game';
            const response = await fetchJson(fabricGameUrl, 'Fabric game versions');
            const stable = Array.isArray(response) ? response.filter(v => v && v.version && v.stable) : [];
            const versions = stable.map(v => v.version);
            return sortVersionsDesc(versions);
        } else if (type === SERVER_TYPES.BEDROCK) {
            const platformFolder = getBedrockPlatformFolder();
            if (!platformFolder) throw new Error('Bedrock server downloads are available only on Windows and Linux.');
            const manifestUrl = 'https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/versions.json';
            const manifest = await fetchJson(manifestUrl, 'Bedrock versions manifest');
            const platformData = manifest?.[platformFolder];
            const versions = Array.isArray(platformData?.versions) ? platformData.versions : [];
            if (!versions.length) throw new Error('No Bedrock versions found.');
            const sorted = sortVersionsDesc(versions);
            return sorted;
        }
        return [];
    } catch (error) {
        const label = type === SERVER_TYPES.FABRIC ? 'Fabric' : (type === SERVER_TYPES.BEDROCK ? 'Bedrock' : 'PaperMC');
        sendConsole(`Could not fetch ${label} versions: ${error.message}`, 'ERROR');
        return [];
    }
});
ipcMain.handle('get-plugins', async () => {
    try {
        const cfg = readServerConfig();
        const type = normalizeServerType(cfg.serverType);
        if (type === SERVER_TYPES.BEDROCK) {
            return [];
        }
        const isFabric = (type === SERVER_TYPES.FABRIC);
        const baseDir = path.join(serverFilesDir, isFabric ? 'mods' : 'plugins');
        if (!fs.existsSync(baseDir)) return [];
        const files = fs.readdirSync(baseDir).filter(f => f.toLowerCase().endsWith('.jar'));
        return files.map(name => {
            const stat = fs.statSync(path.join(baseDir, name));
            return { name, size: stat.size, mtime: stat.mtimeMs };
        }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        sendConsole(`Failed to list add-ons: ${e.message}`, 'ERROR');
        return [];
    }
});

ipcMain.handle('delete-plugin', async (_event, name) => {
    try {
        if (localIsServerRunningGlobal) {
            return { ok: false, error: 'Stop the server before deleting plugins.' };
        }
        const cfg = readServerConfig();
        const type = normalizeServerType(cfg.serverType);
        if (type === SERVER_TYPES.BEDROCK) {
            return { ok: false, error: 'Bedrock servers do not support add-on management via this launcher yet.' };
        }
        if (typeof name !== 'string' || !name || name.includes('..') || name.includes('/') || name.includes('\\') || !name.toLowerCase().endsWith('.jar')) {
            return { ok: false, error: 'Invalid plugin name.' };
        }
        const isFabric = (type === SERVER_TYPES.FABRIC);
        const baseDir = path.join(serverFilesDir, isFabric ? 'mods' : 'plugins');
        const resolvedBase = path.resolve(baseDir) + path.sep;
        const target = path.resolve(baseDir, name);
        if (!target.startsWith(resolvedBase)) return { ok: false, error: 'Invalid path.' };
        if (fs.existsSync(target)) fs.unlinkSync(target);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});

ipcMain.handle('upload-plugins', async () => {
    try {
        const win = getMainWindow();
        if (!win) return { ok: false, error: 'No window' };
        const cfg = readServerConfig();
        const type = normalizeServerType(cfg.serverType);
        if (type === SERVER_TYPES.BEDROCK) {
            return { ok: false, error: 'Bedrock servers do not support add-on uploads yet.' };
        }
        const isFabric = (type === SERVER_TYPES.FABRIC);
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: isFabric ? 'Select mod JAR files' : 'Select plugin JAR files',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: isFabric ? 'Mods' : 'Plugins', extensions: ['jar'] }]
        });
        if (canceled || !filePaths?.length) return { ok: true, added: [] };
        const baseDir = path.join(serverFilesDir, isFabric ? 'mods' : 'plugins');
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        const added = [];
        for (const src of filePaths) {
            const base = path.basename(src);
            if (!base.toLowerCase().endsWith('.jar')) continue;
            const dest = path.join(baseDir, base);
            fs.copyFileSync(src, dest);
            added.push(base);
        }
        return { ok: true, added };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
function readServerPropertiesObject() {
    if (!fs.existsSync(serverPropertiesFilePath)) return {};
    try {
        const fileContent = fs.readFileSync(serverPropertiesFilePath, 'utf8');
        const props = {};
        fileContent.split(/\r?\n/).forEach(line => {
            if (line.startsWith('#') || !line.includes('=')) return;
            const [k, ...rest] = line.split('=');
            props[k.trim()] = rest.join('=').trim();
        });
        return props;
    } catch (e) {
        return {};
    }
}

ipcMain.handle('get-worlds-info', async () => {
    try {
        const props = readServerPropertiesObject();
        const levelName = props['level-name'] || 'world';
        const entries = fs.readdirSync(serverFilesDir, { withFileTypes: true });
        const candidates = entries.filter(e => e.isDirectory()).map(e => e.name).filter(name => {
            return fs.existsSync(path.join(serverFilesDir, name, 'level.dat'));
        });
        const exists = {
            overworld: fs.existsSync(path.join(serverFilesDir, levelName)),
            nether: fs.existsSync(path.join(serverFilesDir, `${levelName}_nether`)),
            the_end: fs.existsSync(path.join(serverFilesDir, `${levelName}_the_end`))
        };
        return { levelName, candidates, exists };
    } catch (e) {
        return { levelName: 'world', candidates: [], exists: {} };
    }
});

ipcMain.handle('set-level-name', async (_event, newName) => {
    try {
        if (!newName || /[\\/:*?"<>|]/.test(newName)) {
            return { ok: false, error: 'Invalid world name.' };
        }
        if (!fs.existsSync(serverPropertiesFilePath)) {
            return { ok: false, error: 'server.properties not found. Run server once.' };
        }
        const lines = fs.readFileSync(serverPropertiesFilePath, 'utf8').split(/\r?\n/);
        let changed = false;
        const updated = lines.map(line => {
            if (line.startsWith('#') || !line.includes('=')) return line;
            const [key] = line.split('=');
            if (key.trim() === 'level-name') {
                changed = true;
                return `level-name=${newName}`;
            }
            return line;
        });
        if (!changed) updated.push(`level-name=${newName}`);
        fs.writeFileSync(serverPropertiesFilePath, updated.join('\n'));
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
});
ipcMain.on('open-plugins-folder', () => {
    const cfg = readServerConfig();
    const type = normalizeServerType(cfg.serverType);
    if (type === SERVER_TYPES.BEDROCK) {
        shell.openPath(serverFilesDir).catch(err => sendConsole(`Failed to open folder: ${err.message}`, 'ERROR'));
        return;
    }
    const isFabric = (type === SERVER_TYPES.FABRIC);
    const baseDir = path.join(serverFilesDir, isFabric ? 'mods' : 'plugins');
    if (!fs.existsSync(baseDir)) {
        try {
            fs.mkdirSync(baseDir, { recursive: true });
            sendConsole(`${isFabric ? 'Mods' : 'Plugins'} directory created.`, 'INFO');
        } catch (error) {
            sendConsole(`Failed to create plugins directory: ${error.message}`, 'ERROR');
            return;
        }
    }
    shell.openPath(baseDir).catch(err => sendConsole(`Failed to open folder: ${err.message}`, 'ERROR'));
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
        return [{ code: 'en', name: 'English' }];
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

async function startBedrockServer(serverConfig) {
    const execName = getBedrockExecutableName();
    const execPath = path.join(serverFilesDir, execName);
    if (!fs.existsSync(execPath)) {
        sendConsole(`${execName} not found.`, 'ERROR');
        sendStatus('Server executable not found.', false, 'serverJarNotFound');
        return;
    }
    if (!serverConfig.version) {
        sendConsole('Server version missing in config.', 'ERROR');
        sendStatus('Config error.', false, 'configError');
        return;
    }

    if (performanceStatsInterval) clearInterval(performanceStatsInterval);
    latencyProbeActive = false; latencyProbeStart = 0; manualListCheck = false;

    sendConsole('Starting Bedrock server...', 'INFO');
    sendStatus('Starting server...', true, 'serverStarting');
    getMainWindow()?.webContents.send('update-performance-stats', { allocatedRamGB: '-' });

    const spawnOptions = {
        cwd: serverFilesDir,
        stdio: ['pipe', 'pipe', 'pipe']
    };
    if (process.platform !== 'win32') {
        spawnOptions.env = { ...process.env, LD_LIBRARY_PATH: '.', ...spawnOptions.env };
    }

    try {
        serverProcess = spawn(execPath, [], spawnOptions);
    } catch (error) {
        sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
        serverProcess = null;
        sendServerStateChange(false);
        sendStatus('Error starting server.', false, 'error');
        return;
    }

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
        } catch (e) {
            clearInterval(performanceStatsInterval);
            if (localIsServerRunningGlobal) {
                log.error('Lost connection to server process (pidusage failed).', e);
                sendConsole('Lost connection to the server process.', 'ERROR');
                sendServerStateChange(false);
            }
        }
    }, 2000);

    const startedRegex = /server started\b/i;

    serverProcess.stdout.on('data', (data) => {
        const rawOutput = data.toString();
        const cleanOutput = rawOutput.trimEnd();
        sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');

        if (!serverIsFullyStarted && startedRegex.test(cleanOutput)) {
            serverIsFullyStarted = true;
            sendServerStateChange(true);
            setDiscordActivity();
            try {
                const cfg = readServerConfig();
                const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                const ver = cfg.version || '';
                showDesktopNotification('Server Started', `${type} ${ver} is now running.`);
                playSoundEffect('success');
            } catch (_) {}
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
            sendStatus('Server stopped.', false, 'serverStopped');
            try {
                const cfg = readServerConfig();
                const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                const ver = cfg.version || '';
                showDesktopNotification('Server Stopped', `${type} ${ver} was stopped manually.`);
            } catch (_) {}
        } else {
            const launcherSettings = readLauncherSettings();
            if (launcherSettings.autoStartServer) {
                sendConsole('Server stopped unexpectedly. Attempting to auto-restart...', 'WARN');
                const delay = launcherSettings.autoStartDelay || 5;
                mainWindow.webContents.send('start-countdown', 'restart', delay);
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    showDesktopNotification('Server Crashed', `${type} ${ver} crashed. Auto-restarting in ${delay}s...`);
                    playSoundEffect('error');
                } catch (_) {}
            } else {
                sendStatus('Server stopped unexpectedly.', false, 'serverStoppedUnexpectedly');
                sendConsole(`Server process exited unexpectedly with code ${code}.`, 'ERROR');
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    showDesktopNotification('Server Crashed', `${type} ${ver} exited unexpectedly (code ${code ?? 'unknown'}).`);
                    playSoundEffect('error');
                } catch (_) {}
            }
        }
    });

    serverProcess.on('error', (err) => {
        if (performanceStatsInterval) clearInterval(performanceStatsInterval);
        sendConsole(`Failed to start process: ${err.message}`, 'ERROR');
        const isNotFound = err.message.includes('ENOENT');
        const fallbackMsg = isNotFound ? 'Executable not found!' : 'Server start failed.';
        sendStatus(fallbackMsg, false, isNotFound ? null : 'serverStartFailed');
        serverProcess = null;
        sendServerStateChange(false);
    });
}

ipcMain.on('configure-server', async (event, { serverType, mcVersion, ramAllocation, javaArgs }) => {
    const chosenType = normalizeServerType(serverType);
    const typeLabel = chosenType === SERVER_TYPES.FABRIC ? 'Fabric' : (chosenType === SERVER_TYPES.BEDROCK ? 'Bedrock' : 'PaperMC');
    sendConsole(`Configuring: Type ${typeLabel}, Version ${mcVersion || 'N/A'}, RAM ${ramAllocation || 'Auto'}`, 'INFO');

    const currentConfig = readServerConfig();
    if (isJavaServer(chosenType)) {
        currentConfig.javaArgs = javaArgs || 'Default';
        if (ramAllocation?.toLowerCase() !== 'auto') {
            currentConfig.ram = ramAllocation;
        } else {
            delete currentConfig.ram;
        }
    } else {
        delete currentConfig.javaArgs;
        delete currentConfig.ram;
    }
    writeServerConfig(currentConfig);
    MINIMUM_JAVA_VERSION = isJavaServer(chosenType) ? requiredJavaForVersion(mcVersion) : 0;

    try {
        if (chosenType === SERVER_TYPES.PAPER) {
            sendStatus(`Downloading PaperMC ${mcVersion}...`, true, 'downloading');
            const buildsApiUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`;
            const buildsResponseData = await fetchJson(buildsApiUrl, 'PaperMC builds list');
            if (!Array.isArray(buildsResponseData.builds) || buildsResponseData.builds.length === 0) {
                throw new Error('No builds found for this PaperMC version.');
            }
            const latestBuild = buildsResponseData.builds[buildsResponseData.builds.length - 1];
            const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild.build}/downloads/${latestBuild.downloads.application.name}`;
            sendStatus(`Downloading (0%)`, true, 'downloading');

            const paperDest = path.join(serverFilesDir, paperJarName);
            await new Promise((resolve, reject) => {
                const doDownload = (url) => {
                    https.get(url, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (response) => {
                        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                            response.resume();
                            return doDownload(response.headers.location);
                        }
                        if (response.statusCode !== 200) return reject(new Error(`Download failed (Status ${response.statusCode})`));
                        const total = parseInt(response.headers['content-length'] || '0', 10);
                        let downloaded = 0;
                        let lastPercent = -1, lastMB = -1;
                        const fileStream = fs.createWriteStream(paperDest);
                        response.on('data', chunk => {
                            downloaded += chunk.length;
                            if (total > 0) {
                                const percent = Math.round((downloaded / total) * 100);
                                if (percent !== lastPercent) {
                                    lastPercent = percent;
                                    sendStatus(`Downloading (${percent}%)`, true, 'downloading');
                                }
                            } else {
                                const mb = Math.floor(downloaded / (1024 * 1024));
                                if (mb !== lastMB) {
                                    lastMB = mb;
                                    sendStatus(`Downloading (${mb} MB)`, true, 'downloading');
                                }
                            }
                        });
                        response.pipe(fileStream);
                        fileStream.on('finish', () => fileStream.close(resolve));
                    }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
                };
                doDownload(downloadUrl);
            });

            sendStatus('PaperMC downloaded successfully!', false, 'downloadSuccess');
            sendConsole(`${paperJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
            const updated = readServerConfig();
            updated.serverType = chosenType;
            updated.version = mcVersion;
            writeServerConfig(updated);
        } else if (chosenType === SERVER_TYPES.FABRIC) {
            sendStatus(`Preparing Fabric ${mcVersion}...`, true, 'downloading');

            const loaderListUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
            const loaderData = await fetchJson(loaderListUrl, 'Fabric loader versions');
            if (!Array.isArray(loaderData) || loaderData.length === 0) throw new Error('No Fabric loader found for this version.');
            const pick = loaderData.find(x => x?.loader?.stable) || loaderData[0];
            const loaderVersion = pick?.loader?.version;
            if (!loaderVersion) throw new Error('Fabric loader version missing.');

            const installerMetaUrl = 'https://meta.fabricmc.net/v2/versions/installer';
            const installers = await fetchJson(installerMetaUrl, 'Fabric installer list');
            if (!Array.isArray(installers) || installers.length === 0) throw new Error('No Fabric installers found.');
            const pickedInstaller = installers.find(x => x.stable) || installers[0];
            const installerVersion = pickedInstaller?.version;
            if (!installerVersion) throw new Error('Fabric installer version missing.');

            const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installerVersion}/server/jar`;
            sendStatus(`Downloading (0%)`, true, 'downloading');
            const fabricDest = path.join(serverFilesDir, fabricJarName);
            await new Promise((resolve, reject) => {
                const doDownload = (url) => {
                    https.get(url, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (response) => {
                        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                            response.resume();
                            return doDownload(response.headers.location);
                        }
                        if (response.statusCode !== 200) return reject(new Error(`Download failed (Status ${response.statusCode})`));
                        const total = parseInt(response.headers['content-length'] || '0', 10);
                        let downloaded = 0;
                        let lastPercent = -1, lastMB = -1;
                        const fileStream = fs.createWriteStream(fabricDest);
                        response.on('data', chunk => {
                            downloaded += chunk.length;
                            if (total > 0) {
                                const percent = Math.round((downloaded / total) * 100);
                                if (percent !== lastPercent) {
                                    lastPercent = percent;
                                    sendStatus(`Downloading (${percent}%)`, true, 'downloading');
                                }
                            } else {
                                const mb = Math.floor(downloaded / (1024 * 1024));
                                if (mb !== lastMB) {
                                    lastMB = mb;
                                    sendStatus(`Downloading (${mb} MB)`, true, 'downloading');
                                }
                            }
                        });
                        response.pipe(fileStream);
                        fileStream.on('finish', () => fileStream.close(resolve));
                    }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
                };
                doDownload(downloadUrl);
            });

            sendStatus('Fabric Server installed successfully!', false, 'downloadSuccessFabric');
            sendConsole(`${fabricJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
            const updated = readServerConfig();
            updated.serverType = chosenType;
            updated.version = mcVersion;
            writeServerConfig(updated);
        } else if (chosenType === SERVER_TYPES.BEDROCK) {
            if (!mcVersion) throw new Error('Please select a Bedrock version.');
            const platformFolder = getBedrockPlatformFolder();
            if (!platformFolder) throw new Error('Bedrock server downloads are only supported on Windows and Linux.');
            sendStatus(`Downloading Bedrock ${mcVersion}...`, true, 'downloading');

            const manifestUrl = `https://raw.githubusercontent.com/Bedrock-OSS/BDS-Versions/main/${platformFolder}/${mcVersion}.json`;
            const manifest = await fetchJson(manifestUrl, 'Bedrock version manifest');
            const downloadUrl = manifest?.download_url;
            if (!downloadUrl) throw new Error('Download URL not found for this Bedrock version.');

            const zipDest = path.join(serverFilesDir, `bedrock-${mcVersion}.zip`);
            await new Promise((resolve, reject) => {
                const doDownload = (url) => {
                    https.get(url, { headers: { 'User-Agent': 'Server-Launcher/1.0' } }, (response) => {
                        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                            response.resume();
                            return doDownload(response.headers.location);
                        }
                        if (response.statusCode !== 200) return reject(new Error(`Download failed (Status ${response.statusCode})`));
                        const total = parseInt(response.headers['content-length'] || '0', 10);
                        let downloaded = 0;
                        let lastPercent = -1, lastMB = -1;
                        const fileStream = fs.createWriteStream(zipDest);
                        response.on('data', chunk => {
                            downloaded += chunk.length;
                            if (total > 0) {
                                const percent = Math.round((downloaded / total) * 100);
                                if (percent !== lastPercent) {
                                    lastPercent = percent;
                                    sendStatus(`Downloading (${percent}%)`, true, 'downloading');
                                }
                            } else {
                                const mb = Math.floor(downloaded / (1024 * 1024));
                                if (mb !== lastMB) {
                                    lastMB = mb;
                                    sendStatus(`Downloading (${mb} MB)`, true, 'downloading');
                                }
                            }
                        });
                        response.pipe(fileStream);
                        fileStream.on('finish', () => fileStream.close(resolve));
                    }).on('error', err => reject(new Error(`Request error: ${err.message}`)));
                };
                doDownload(downloadUrl);
            });

            const preservedFiles = {};
            const filesToPreserve = ['server.properties', 'permissions.json', 'allowlist.json', 'whitelist.json'];
            for (const rel of filesToPreserve) {
                const abs = path.join(serverFilesDir, rel);
                if (fs.existsSync(abs)) {
                    try {
                        preservedFiles[rel] = fs.readFileSync(abs);
                    } catch (err) {
                        log.warn(`Failed to back up ${rel}: ${err.message}`);
                    }
                }
            }

            const worldsDir = path.join(serverFilesDir, 'worlds');
            let worldsBackupPath = null;
            if (fs.existsSync(worldsDir)) {
                worldsBackupPath = path.join(serverFilesDir, '__worlds_backup__');
                try {
                    if (fs.existsSync(worldsBackupPath)) fs.rmSync(worldsBackupPath, { recursive: true, force: true });
                    fs.renameSync(worldsDir, worldsBackupPath);
                } catch (err) {
                    log.warn(`Failed to back up existing Bedrock worlds: ${err.message}`);
                    worldsBackupPath = null;
                }
            }

            let extractionSucceeded = false;
            try {
                const zip = new AdmZip(zipDest);
                zip.extractAllTo(serverFilesDir, true);
                extractionSucceeded = true;
            } finally {
                try { fs.unlinkSync(zipDest); } catch (_) {}
                if (worldsBackupPath && fs.existsSync(worldsBackupPath)) {
                    try {
                        if (extractionSucceeded) {
                            const extractedWorlds = path.join(serverFilesDir, 'worlds');
                            if (fs.existsSync(extractedWorlds)) {
                                fs.rmSync(extractedWorlds, { recursive: true, force: true });
                            }
                        }
                        fs.renameSync(worldsBackupPath, path.join(serverFilesDir, 'worlds'));
                    } catch (err) {
                        log.warn(`Failed to restore Bedrock worlds: ${err.message}`);
                    }
                }
                for (const [rel, content] of Object.entries(preservedFiles)) {
                    try {
                        fs.writeFileSync(path.join(serverFilesDir, rel), content);
                    } catch (err) {
                        log.warn(`Failed to restore ${rel}: ${err.message}`);
                    }
                }
            }

            if (process.platform !== 'win32') {
                const execPath = path.join(serverFilesDir, getBedrockExecutableName());
                if (fs.existsSync(execPath)) {
                    try {
                        fs.chmodSync(execPath, 0o755);
                    } catch (err) {
                        log.warn(`Failed to set execute permissions on Bedrock server: ${err.message}`);
                    }
                }
            }

            const updated = readServerConfig();
            updated.serverType = chosenType;
            updated.version = mcVersion;
            writeServerConfig(updated);

            sendStatus('Bedrock server ready!', false, 'downloadSuccess');
            sendConsole(`Bedrock server ${mcVersion} downloaded and extracted.`, 'SUCCESS');
        }

        getMainWindow()?.webContents.send('setup-finished');
        if (isJavaServer(chosenType)) {
            setTimeout(async () => {
                const hasJava2 = await checkJava();
                if (!hasJava2 && app.isPackaged) {
                    const win = getMainWindow();
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('java-install-required');
                    }
                }
            }, 2000);
        }

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
    const serverConfig = readServerConfig();
    const serverType = normalizeServerType(serverConfig.serverType);
    if (serverType === SERVER_TYPES.BEDROCK) {
        await startBedrockServer(serverConfig);
        return;
    }
    const jarName = getServerJarNameForType(serverType);
    const serverJarPath = path.join(serverFilesDir, jarName);
    if (!fs.existsSync(serverJarPath)) {
        sendConsole(`${jarName} not found.`, 'ERROR');
        sendStatus('Server JAR not found.', false, 'serverJarNotFound');
        return;
    }
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
    const performanceArgs = ['-Xms' + ramToUseForJava, '-Xmx' + ramToUseForJava, '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200', '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC', '-XX:+AlwaysPreTouch', '-XX:G1NewSizePercent=40', '-XX:G1MaxNewSizePercent=50', '-XX:G1HeapRegionSize=16M', '-XX:G1ReservePercent=15', '-XX:G1HeapWastePercent=5', '-XX:InitiatingHeapOccupancyPercent=20', '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32', '-XX:MaxTenuringThreshold=1', '-Dusing.aikars.flags=https://mcflags.emc.gs', '-Daikars.new.flags=true', '-jar', jarName, 'nogui'];
    const defaultArgs = ['-Xms' + ramToUseForJava, '-Xmx' + ramToUseForJava, '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:+UnlockExperimentalVMOptions', '-XX:MaxGCPauseMillis=200', '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=8M', '-XX:G1ReservePercent=20', '-XX:InitiatingHeapOccupancyPercent=45', '-jar', jarName, 'nogui'];
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

        serverProcess = spawn(javaExecutablePath, javaArgs, { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'], env: getCleanEnvForJava() });
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
                if (serverIsFullyStarted && serverProcess && serverProcess.stdin && serverProcess.stdin.writable) {
                    if (latencyProbeActive && Date.now() - latencyProbeStart > 5000) {
                        latencyProbeActive = false;
                    }
                    if (!latencyProbeActive && !manualListCheck) {
                        latencyProbeActive = true;
                        latencyProbeStart = Date.now();
                        serverProcess.stdin.write("list\n");
                    }
                }
            } catch (e) {
                clearInterval(performanceStatsInterval);
                if (localIsServerRunningGlobal) {
                    log.error('Lost connection to server process (pidusage failed).', e);
                    sendConsole('Lost connection to the server process.', 'ERROR');
                    sendServerStateChange(false);
                }
            }
        }, 2000);

        serverProcess.stdout.on('data', (data) => {
            const rawOutput = data.toString();
            const cleanOutput = stripAnsiCodes(rawOutput).trimEnd();
            
            const playersRegex = /players online:?/i;
            if (playersRegex.test(cleanOutput)) {
                if (manualListCheck) {
                    sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
                    manualListCheck = false;
                } else if (latencyProbeActive) {
                    const latencyMs = Math.max(0, Date.now() - latencyProbeStart);
                    getMainWindow()?.webContents.send('update-performance-stats', { latencyMs });
                    latencyProbeActive = false;
                } else {
                    sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
                }
            } else {
                sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
            }

            if (!serverIsFullyStarted && /Done \([^)]+\)! For help, type "help"/.test(cleanOutput)) {
                latencyProbeActive = false; latencyProbeStart = 0;
                serverIsFullyStarted = true;
                sendServerStateChange(true);
                setDiscordActivity();
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    showDesktopNotification('Server Started', `${type} ${ver} is now running.`);
                    playSoundEffect('success');
                } catch (_) {}
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
                sendStatus('Server stopped.', false, 'serverStopped');
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    showDesktopNotification('Server Stopped', `${type} ${ver} was stopped manually.`);
                } catch (_) {}
            } else {
                const launcherSettings = readLauncherSettings();
                if (launcherSettings.autoStartServer) {
                    sendConsole('Server stopped unexpectedly. Attempting to auto-restart...', 'WARN');
                    const delay = launcherSettings.autoStartDelay || 5;
                    mainWindow.webContents.send('start-countdown', 'restart', delay);
                    try {
                        const cfg = readServerConfig();
                        const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                        const ver = cfg.version || '';
                        showDesktopNotification('Server Crashed', `${type} ${ver} crashed. Auto-restarting in ${delay}s...`);
                        playSoundEffect('error');
                    } catch (_) {}
                } else {
                    sendStatus('Server stopped unexpectedly.', false, 'serverStoppedUnexpectedly');
                    sendConsole(`Server process exited unexpectedly with code ${code}.`, 'ERROR');
                    try {
                        const cfg = readServerConfig();
                        const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                        const ver = cfg.version || '';
                        showDesktopNotification('Server Crashed', `${type} ${ver} exited unexpectedly (code ${code ?? 'unknown'}).`);
                        playSoundEffect('error');
                    } catch (_) {}
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
    latencyProbeActive = false; latencyProbeStart = 0;
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
    if (typeof command !== 'string') return;
    if (command.length > 1000) return;
    const trimmedCommand = command.trim().toLowerCase();
    if (trimmedCommand === 'list' || trimmedCommand === '/list') {
        manualListCheck = true;
        latencyProbeActive = false; latencyProbeStart = 0;
    }
    let outgoing = command;
    if (outgoing.startsWith('/')) outgoing = outgoing.slice(1);
    if (serverProcess && serverProcess.stdin.writable) {
        try { serverProcess.stdin.write(outgoing + '\n'); }
        catch (error) { sendConsole(`Error writing to stdin: ${error.message}`, 'ERROR'); }
    } else { sendConsole('Cannot send command: Server not running.', 'ERROR'); }
});

ipcMain.handle('get-local-ip', () => getLocalIPv4());
ipcMain.handle('get-public-ip', async () => {
    try {
        return await resolvePublicAddress();
    } catch (error) {
        sendConsole(`Could not fetch Public IP: ${error.message}`, 'ERROR');
        return { address: '- (Error)', includeServerPort: true, source: 'error' };
    }
});
