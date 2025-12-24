const fs = require('node:fs');
const path = require('node:path');
const find = require('find-process');
const { promisify } = require('node:util');
const { exec, spawn } = require('node:child_process');
const execAsync = promisify(exec);
const https = require('node:https');
const { shell, app, ipcMain, dialog } = require('electron');
const { getMainWindow } = require('./windowManager');

let javaExecutablePath = 'java';
let MINIMUM_JAVA_VERSION = 17;

// Legacy globals mirrored from the packaged entrypoint
let serverFilesDir;
const purpurJarName = 'purpur.jar';
const fabricJarName = 'fabric-server-launch.jar';
let serverConfigFilePath;
const serverConfigFileName = 'config.json';
let launcherSettingsFilePath;
const launcherSettingsFileName = 'launcher-settings.json';
let serverPropertiesFilePath;
const serverPropertiesFileName = 'server.properties';

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

function cleanServerLocks(serverDir) {
    if (!fs.existsSync(serverDir)) return;
    const files = fs.readdirSync(serverDir);
    files.forEach(file => {
        if (file.endsWith('.lock') || file.endsWith('.pid') || file.endsWith('.tmp')) {
            try {
                fs.unlinkSync(path.join(serverDir, file));
            } catch (_) {}
        }
    });
}

const SERVER_TYPES = {
    PAPER: 'purpur',
    FABRIC: 'fabric',
    BEDROCK: 'bedrock'
};

function normalizeServerType(type) {
    if (type === 'papermc' || type === 'paper') return SERVER_TYPES.PAPER;
    if (type === 'purpur') return SERVER_TYPES.PAPER;
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

async function killStrayServerProcess() {
    try {
        const processes = await find('name', 'java', true);
        const serverJarPurpur = path.join(serverFilesDir, purpurJarName);
        const serverJarFabric = path.join(serverFilesDir, fabricJarName);
        const bedrockExecutableName = getBedrockExecutableName();
        const bedrockExecutablePath = path.join(serverFilesDir, bedrockExecutableName);

        for (const p of processes) {
            if (p.cmd.includes(serverJarPurpur) || p.cmd.includes(serverJarFabric)) {
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
            const versionMatch = output.match(/version \"(\d+)/);
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
            'HKEY_LOCAL_MACHINE\SOFTWARE\Eclipse Adoptium\JDK',
            'HKEY_LOCAL_MACHINE\SOFTWARE\JavaSoft\JDK',
            'HKEY_LOCAL_MACHINE\SOFTWARE\Amazon Corretto\JDK'
        ];
        for (const key of keysToQuery) {
            let stdout;
            try {
                ({ stdout } = await execAsync(`reg query "${key}" /s`));
            } catch (_) {
                continue;
            }
            const lines = stdout.trim().split(/[
]+/)).filter(line => line.trim().startsWith('HKEY_'));
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

    if (process.platform === 'linux') {
        const installed = await ensureBundledJavaLinux();
        if (installed) {
            log.info(`Java >= ${MINIMUM_JAVA_VERSION} verified at: ${javaExecutablePath}`);
            return true;
        }
    }

    if (process.platform === 'darwin') {
        const installed = await ensureBundledJavaMac();
        if (installed) {
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
        safeSend(win, 'java-install-status', 'Finding the latest Java version for your system...');

        // Handle Linux and macOS
        if (process.platform === 'linux') {
            const installed = await ensureBundledJavaLinux();
            if (installed) {
                safeSend(win, 'java-install-status', 'Java installation complete! Please restart the launcher.');
                log.info('Java successfully installed on Linux.');
                setTimeout(() => {
                    app.quit();
                }, 4000);
                return;
            } else {
                throw new Error('Failed to install Java on Linux. Please install Java 21+ manually from your package manager (e.g., sudo apt install openjdk-21-jdk).');
            }
        }

        if (process.platform === 'darwin') {
            const installed = await ensureBundledJavaMac();
            if (installed) {
                safeSend(win, 'java-install-status', 'Java installation complete! Please restart the launcher.');
                log.info('Java successfully installed on macOS.');
                setTimeout(() => {
                    app.quit();
                }, 4000);
                return;
            } else {
                throw new Error('Failed to install Java on macOS. Please install Java 21+ manually using Homebrew: brew install openjdk@21');
            }
        }

        // Windows installation (existing code)
        if (process.platform !== 'win32') {
            throw new Error('Automated Java installation is currently supported only on Windows and Linux.');
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

        safeSend(win, 'java-install-status', `Downloading ${fileName}...`, 0);

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
                    safeSend(win, 'java-install-status', `Downloading... ${progress}%`, progress);
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => fileStream.close(resolve));
            });

            fileStream.on('error', err => fs.unlink(filePath, () => reject(err)));
        });
        
        safeSend(win, 'java-install-status', 'Download complete. Launching installer...');

        shell.openPath(filePath).then(errorMessage => {
            if (errorMessage) {
                throw new Error(`Failed to open installer: ${errorMessage}`);
            }
            safeSend(win, 'java-install-status', 'Installer launched. Please complete the installation, then restart the launcher. The application will now close.');
            log.info('Java installer launched. Closing the launcher.');
            
            setTimeout(() => {
                app.quit();
            }, 4000);
        });

    } catch (error) {
        log.error('Java install error:', error);
        safeSend(
            win,
            'java-install-status',
            `Error: ${error.message}. Please try again or install Java manually.`
        );
    }
}

function getConfiguredServerType() {
  try {
    const cfg = readServerConfig();
    return normalizeServerType(cfg?.serverType);
  } catch (_) { return SERVER_TYPES.PAPER; }
}

function getServerJarNameForType(serverType) {
    return serverType === SERVER_TYPES.FABRIC ? fabricJarName : purpurJarName;
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

async function startBedrockServer(serverConfig) {
    const execName = getBedrockExecutableName();
    const execPath = path.join(serverFilesDir, execName);
    if (!fs.existsSync(execPath)) {
        sendConsole(`${execName} not found.`, 'ERROR');
        sendStatus('Server executable not found.', false, 'serverJarNotFound');
        showDesktopNotification('Server Files Missing', 'Bedrock executable not found. Run Configure first.');
        return;
    }
    if (!serverConfig.version) {
        sendConsole('Server version missing in config.', 'ERROR');
        sendStatus('Config error.', false, 'configError');
        showDesktopNotification('Configuration Needed', 'Select a Bedrock version before starting the server.');
        return;
    }

    if (performanceStatsInterval) clearInterval(performanceStatsInterval);
    manualListCheck = false;

    sendConsole('Starting Bedrock server...', 'INFO');
    sendStatus('Starting server...', true, 'serverStarting');
    safeSend(getMainWindow(), 'update-performance-stats', { allocatedRamGB: '-' });

    const spawnOptions = {
        cwd: serverFilesDir,
        stdio: ['pipe', 'pipe', 'pipe']
    };
    if (process.platform !== 'win32') {
        spawnOptions.env = { ...process.env, LD_LIBRARY_PATH: '.', ...spawnOptions.env };
    }

    try {
        serverProcess = spawn(execPath, [], spawnOptions);
        if (serverProcess.stdin) {
            serverProcess.stdin.on('error', (err) => {
                if (err && err.code === 'EPIPE') {
                    if (commandLatencyInterval) { clearInterval(commandLatencyInterval); commandLatencyInterval = null; }
                    if (listProbeTimeout) { clearTimeout(listProbeTimeout); listProbeTimeout = null; }
                    awaitingListProbe = false;
                    // Do not log EPIPE to avoid noisy warnings when process exits
                    return;
                }
                try { sendConsole(`STDIN error: ${err.message}`, 'WARN'); } catch (_) {}
            });
        }
    } catch (error) {
        sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
        serverProcess = null;
        sendServerStateChange(false);
        sendStatus('Error starting server.', false, 'error');
        showDesktopNotification('Server Start Failed', error.message);
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
            safeSend(getMainWindow(), 'update-performance-stats', { memoryGB });
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

        // Detect /list output for latency probe
        let isListLine = false;
        let isAutomaticProbe = false;
        try {
            isListLine = /players online:?/i.test(cleanOutput) || /there are \d+.*players online/i.test(cleanOutput);
            if (isListLine && awaitingListProbe) {
                const now = Date.now();
                if (now - lastManualListAt > 2000) {
                    isAutomaticProbe = true;
                    const latency = Math.max(0, now - listProbeSentAt);
                    awaitingListProbe = false;
                    if (listProbeTimeout) { clearTimeout(listProbeTimeout); listProbeTimeout = null; }
                    safeSend(getMainWindow(), 'update-performance-stats', { cmdLatencyMs: latency });
                } else {
                    awaitingListProbe = false;
                }
            }
        } catch (_) {}

        // Only send to console if NOT an automatic list probe output
        if (!isAutomaticProbe) {
            sendConsole(ansiConverter.toHtml(rawOutput), 'SERVER_LOG_HTML');
        }

        if (!serverIsFullyStarted && startedRegex.test(cleanOutput)) {
            serverIsFullyStarted = true;
            sendServerStateChange(true);
            try {
                const cfg = readServerConfig();
                const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                const ver = cfg.version || '';
                const serverLabel = formatServerLabel(type, ver);
                showDesktopNotification('Server Started', `${serverLabel} is now running.`);
                playSoundEffect('success');
            } catch (_) {}
            // Start periodic /list latency probe (Bedrock)
            try {
                if (commandLatencyInterval) clearInterval(commandLatencyInterval);
                commandLatencyInterval = setInterval(() => {
                    // Skip probe if manual /list was sent recently (within last 3 seconds)
                    const timeSinceManual = Date.now() - lastManualListAt;
                    if (
                        !awaitingListProbe &&
                        timeSinceManual > 3000 &&
                        serverProcess &&
                        serverProcess.stdin &&
                        !serverProcess.killed &&
                        serverProcess.exitCode === null &&
                        !serverProcess.stdin.destroyed &&
                        !serverProcess.stdin.writableEnded &&
                        serverProcess.stdin.writable
                    ) {
                        try {
                            awaitingListProbe = true;
                            listProbeSentAt = Date.now();
                            serverProcess.stdin.write('list\n');
                            if (listProbeTimeout) clearTimeout(listProbeTimeout); 
                            listProbeTimeout = setTimeout(() => { awaitingListProbe = false; }, 3000);
                        } catch (_) { awaitingListProbe = false; }
                    }
                }, 1500);
            } catch (_) {}
        }
    });

    serverProcess.stderr.on('data', (data) => {
        sendConsole(ansiConverter.toHtml(data.toString()), 'SERVER_LOG_HTML');
    });

    serverProcess.on('close', function (code, signal) {
        if (performanceStatsInterval) clearInterval(performanceStatsInterval);
        if (commandLatencyInterval) { clearInterval(commandLatencyInterval); commandLatencyInterval = null; }
        if (listProbeTimeout) { clearTimeout(listProbeTimeout); listProbeTimeout = null; }
        awaitingListProbe = false;
        const childProcess = this;
        const killedInternally = !!childProcess?.killedInternally;
        const shouldAffectUi = !serverProcess || serverProcess === childProcess;
        if (serverProcess === childProcess) {
            serverProcess = null;
        }

        if (!shouldAffectUi) {
            log.debug('Ignoring stale Bedrock server process close event.');
            return;
        }

        if (killedInternally) {
            sendConsole('Server process stopped normally.', 'INFO');
            sendStatus('Server stopped.', false, 'serverStopped', 'success');
            sendServerStateChange(false);
            try {
                const cfg = readServerConfig();
                const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                const ver = cfg.version || '';
                const serverLabel = formatServerLabel(type, ver);
                showDesktopNotification('Server Stopped', `${serverLabel} was stopped manually.`);
            } catch (_) {}
        } else {
            const exitDetails = describeServerShutdown(code, signal);
            const launcherSettings = readLauncherSettings();
            if (launcherSettings.autoStartServer) {
                sendConsole('Server stopped unexpectedly. Attempting to auto-restart...', 'WARN');
                sendConsole(`Crash diagnostics: ${exitDetails.hint} (${exitDetails.technical}).`, 'WARN');
                const delay = launcherSettings.autoStartDelay || 5;
                safeSend(getMainWindow(), 'start-countdown', 'restart', delay);
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    const serverLabel = formatServerLabel(type, ver);
                    showDesktopNotification('Server Crashed', `${serverLabel} crashed (${exitDetails.technical}). ${exitDetails.hint} Auto-restarting in ${delay}s...`);
                    playSoundEffect('error');
                } catch (_) {}
            } else {
                sendStatus('Server stopped unexpectedly.', false, 'serverStoppedUnexpectedly');
                sendConsole(`Server process exited unexpectedly (${exitDetails.technical}). ${exitDetails.hint}`, 'ERROR');
                try {
                    const cfg = readServerConfig();
                    const type = getServerFlavorLabel(normalizeServerType(cfg.serverType));
                    const ver = cfg.version || '';
                    const serverLabel = formatServerLabel(type, ver);
                    showDesktopNotification('Server Crashed', `${serverLabel} exited unexpectedly (${exitDetails.technical}). ${exitDetails.hint}`);
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

function setupIpcHandlers() {
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
            fileContent.split(/[
]+/).forEach(line => {
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
            const lines = fs.readFileSync(serverPropertiesFilePath, 'utf8').split(/[
]+/);
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
        // Show setup ONLY if the MinecraftServer folder does not exist at all
        const needsSetup = !fs.existsSync(serverFilesDir);
        if (!needsSetup) {
            try {
                const now = Date.now();
                if (now - lastSetupCheckAt > 1500) {
                    sendConsole(`Setup check OK.`, 'INFO');
                    lastSetupCheckAt = now;
                }
            } catch (_) {
                sendConsole(`Setup check OK.`, 'INFO');
            }
        }
        return { needsSetup, config: readServerConfig() };
    });
    ipcMain.handle('get-available-versions', async (_event, serverType) => {
        const type = normalizeServerType(serverType);
        try {
            if (type === SERVER_TYPES.PAPER) {
                const projectApiUrl = 'https://api.purpurmc.org/v2/purpur';
                const projectResponseData = await fetchJson(projectApiUrl, 'Purpur versions');
                const versions = projectResponseData?.versions || projectResponseData?.all || [];
                if (Array.isArray(versions) && versions.length > 0) {
                    return sortVersionsDesc(versions);
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
                const manifest = await fetchJson(manifestUrl, 'Bedrock version manifest');
                const platformData = manifest?.[platformFolder];
                const versions = Array.isArray(platformData?.versions) ? platformData.versions : [];
                if (!versions.length) throw new Error('No Bedrock versions found.');
                const sorted = sortVersionsDesc(versions);
                return sorted;
            }
            return [];
        } catch (error) {
            const label = type === SERVER_TYPES.FABRIC ? 'Fabric' : (type === SERVER_TYPES.BEDROCK ? 'Bedrock' : 'Purpur');
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
            if (typeof name !== 'string' || !name || name.includes('..') || name.includes('/') || name.includes('\') || !name.toLowerCase().endsWith('.jar')) {
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
            const lines = fs.readFileSync(serverPropertiesFilePath, 'utf8').split(/[
]+/);
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

    // Server path management IPC
    ipcMain.handle('get-server-path-info', () => {
        const ls = readLauncherSettings();
        return {
            path: serverFilesDir,
            basePath: ls.customServerPath || app.getPath('documents'),
            locked: !!ls.serverPathLocked
        };
    });

    ipcMain.on('set-server-path-lock', (_event, locked) => {
        const ls = readLauncherSettings();
        ls.serverPathLocked = !!locked;
        writeLauncherSettings(ls);
    });


    ipcMain.handle('select-server-location', async () => {
        const ls = readLauncherSettings();
        if (ls.serverPathLocked) {
            return { ok: false, error: 'Path is locked.' };
        }
        if (localIsServerRunningGlobal) {
            return { ok: false, error: 'Stop server before changing location.' };
        }
        const win = getMainWindow();
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select Base Folder for MinecraftServer',
            properties: ['openDirectory','createDirectory']
        });
        if (canceled || !filePaths || !filePaths.length) {
            return { ok: false, cancelled: true };
        }
        const base = filePaths[0];
        try {
            // Update settings
            ls.customServerPath = base;
            writeLauncherSettings(ls);
            // Recompute paths
            serverFilesDir = path.join(base, 'MinecraftServer');
            // Keep server config in userData regardless of server folder
            serverConfigFilePath = path.join(app.getPath('userData'), serverConfigFileName);
            serverPropertiesFilePath = path.join(serverFilesDir, serverPropertiesFileName);
            if (!fs.existsSync(serverFilesDir)) fs.mkdirSync(serverFilesDir, { recursive: true });
            sendConsole(`Server base location set to: ${serverFilesDir}`, 'INFO');
            return { ok: true, path: serverFilesDir, locked: !!ls.serverPathLocked };
        } catch (e) {
            return { ok: false, error: e.message };
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



    ipcMain.on('configure-server', async (event, { serverType, mcVersion, ramAllocation, javaArgs }) => {
        resetIdleTimer();
        const chosenType = normalizeServerType(serverType);
        const typeLabel = chosenType === SERVER_TYPES.FABRIC ? 'Fabric' : (chosenType === SERVER_TYPES.BEDROCK ? 'Bedrock' : 'Purpur');
        sendConsole(`Configuring: Type ${typeLabel}, Version ${mcVersion || 'N/A'}, RAM ${ramAllocation || 'Auto'}`, 'INFO');

        // Ensure the MinecraftServer folder exists only when configuring
        try {
            if (!fs.existsSync(serverFilesDir)) {
                fs.mkdirSync(serverFilesDir, { recursive: true });
            }
        } catch (e) {
            sendConsole(`Failed to create server directory: ${e.message}`, 'ERROR');
            sendStatus('Error', false, 'error');
            return;
        }

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
                sendStatus(`Downloading Purpur ${mcVersion}...`, true, 'downloading');
                const buildsApiUrl = `https://api.purpurmc.org/v2/purpur/${mcVersion}`;
                const buildsResponseData = await fetchJson(buildsApiUrl, 'Purpur builds list');
                const buildsList = Array.isArray(buildsResponseData?.builds?.all)
                    ? buildsResponseData.builds.all
                    : (Array.isArray(buildsResponseData?.builds) ? buildsResponseData.builds : []);
                let latestBuild = buildsResponseData?.builds?.latest ?? (buildsList.length ? buildsList[buildsList.length - 1] : null);
                if (latestBuild && typeof latestBuild === 'object' && latestBuild.build) {
                    latestBuild = latestBuild.build;
                }
                if (latestBuild === null || latestBuild === undefined) {
                    throw new Error('No builds found for this Purpur version.');
                }
                const downloadUrl = `https://api.purpurmc.org/v2/purpur/${mcVersion}/${latestBuild}/download`;
                sendStatus(`Downloading (0%)`, true, 'downloading');

                const purpurDest = path.join(serverFilesDir, purpurJarName);
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
                            const fileStream = fs.createWriteStream(purpurDest);
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

                sendStatus('Vanilla downloaded successfully!', false, 'downloadSuccessPaper');
                sendConsole(`${purpurJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
                showDesktopNotification('Download Complete', `Purpur ${mcVersion} is ready. Press Start to launch.`);
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
                                downloadedBytes += chunk.length;
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

                sendStatus('Modded download successfully', false, 'downloadSuccessFabric');
                sendConsole(`${fabricJarName} for ${mcVersion} downloaded.`, 'SUCCESS');
                showDesktopNotification('Download Complete', `Fabric ${mcVersion} is ready. Press Start to launch.`);
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

                sendStatus('Bedrock installed successfully', false, 'downloadSuccess');
                sendConsole(`Bedrock server ${mcVersion} downloaded and extracted.`, 'SUCCESS');
                showDesktopNotification('Download Complete', `Bedrock ${mcVersion} is ready. Press Start to launch.`);
            }

            safeSend(getMainWindow(), 'setup-finished');
            if (isJavaServer(chosenType)) {
                setTimeout(async () => {
                    const hasJava2 = await checkJava();
                    if (!hasJava2 && app.isPackaged) {
                        const win = getMainWindow();
                        if (win && !win.isDestroyed()) {
                            safeSend(win, 'java-install-required');
                        }
                    }
                }, 2000);
            }

        } catch (error) {
            sendStatus('Download failed.', false, 'downloadFailed');
            sendConsole(`ERROR: ${error.message}`, 'ERROR');
            showDesktopNotification('Download Failed', error.message || 'The download was interrupted.');
            safeSend(getMainWindow(), 'setup-finished');
        }
    });
}


module.exports = {
  cleanServerLocks,
  normalizeServerType,
  isJavaServer,
  getBedrockExecutableName,
  getBedrockPlatformFolder,
  killStrayServerProcess,
  checkJava,
  downloadAndInstallJava,
  getCleanEnvForJava,
  getConfiguredServerType,
  getServerJarNameForType,
  readServerConfig,
  writeServerConfig,
  readLauncherSettings,
  writeLauncherSettings,
  refreshMinimumJavaRequirementFromConfig,
  requiredJavaForVersion,
  startBedrockServer,
  setupIpcHandlers,
  SERVER_TYPES
};