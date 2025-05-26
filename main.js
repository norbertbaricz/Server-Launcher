const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { spawn } = require('node:child_process');
const os = require('node:os');

let serverFilesDir;
const paperJarName = 'paper.jar';
let serverProcess = null;
let configFilePath;
const configFileName = 'config.json';
let localIsServerRunningGlobal = false;

function getMainWindow() {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
}

function sendStatus(message, pulse = false) {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', message, pulse);
}

function sendConsole(message, type = 'INFO') {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-console', message, type);
}

function sendServerStateChange(isRunning) {
    localIsServerRunningGlobal = isRunning;
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('server-state-change', isRunning);
}

function readServerConfig() {
    if (!configFilePath) {
        console.error('ERROR: configFilePath not initialized before reading.');
        sendConsole(`Internal Error: Config path not set before read.`, 'ERROR');
        return {};
    }
    try {
        if (fs.existsSync(configFilePath)) {
            const configData = fs.readFileSync(configFilePath, 'utf8');
            if (configData.trim() === "") {
                sendConsole(`${configFileName} is empty. Using defaults.`, 'WARN');
                return {};
            }
            return JSON.parse(configData);
        }
    } catch (error) {
        sendConsole(`Error reading or parsing ${configFileName}: ${error.message}`, 'ERROR');
    }
    return {};
}

function writeServerConfig(configObject) {
    if (!configFilePath) {
        console.error('ERROR: configFilePath not initialized before writing.');
        sendConsole(`Internal Error: Config path not set before write.`, 'ERROR');
        return;
    }
    try {
        fs.writeFileSync(configFilePath, JSON.stringify(configObject, null, 2));
        sendConsole(`${configFileName} saved successfully.`, 'SUCCESS');
    } catch (error) {
        sendConsole(`Error writing ${configFileName}: ${error.message}`, 'ERROR');
    }
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
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    resizable: false,
    fullscreenable: false,
    frame: false,
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
  });
}

app.whenReady().then(() => {
  serverFilesDir = path.join(app.getPath('userData'), 'MinecraftServer');
  configFilePath = path.join(serverFilesDir, configFileName);
  console.log(`User data path for server files: ${serverFilesDir}`);
  console.log(`Config file path: ${configFilePath}`);

  if (!fs.existsSync(serverFilesDir)) {
    try {
      fs.mkdirSync(serverFilesDir, { recursive: true });
      console.log(`Folder created for server at: ${serverFilesDir}`);
    } catch (error) {
      console.error(`FATAL: Failed to create directory ${serverFilesDir}:`, error);
      dialog.showErrorBox(
        'Directory Creation Failed',
        `Failed to create server directory at ${serverFilesDir}:\n${error.message}\n\nThe application might not function correctly.`
      );
    }
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow();});
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

ipcMain.handle('get-app-path', async () => app.getAppPath());

ipcMain.handle('check-initial-setup', async () => {
    if (!serverFilesDir || !configFilePath) {
        const errorMsg = "Launcher error: Server/config directory paths not properly initialized.";
        console.error(errorMsg);
        return { needsSetup: true, config: {}, error: errorMsg };
    }
    const jarPath = path.join(serverFilesDir, paperJarName);
    const jarExists = fs.existsSync(jarPath);
    const configExists = fs.existsSync(configFilePath);
    let config = {};
    if (configExists) {
        config = readServerConfig();
    }

    const needsSetupCondition = !jarExists || !configExists;
    if (needsSetupCondition) {
        if (!jarExists) sendConsole(`${paperJarName} not found. Full setup required.`, 'INFO');
        else if (!configExists) sendConsole(`${configFileName} not found. Configuration required.`, 'INFO');
    } else {
        sendConsole(`Setup check: ${paperJarName} and ${configFileName} exist.`, 'INFO');
    }
    return { needsSetup: needsSetupCondition, config: config };
});

ipcMain.handle('get-latest-papermc-version', async () => {
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
            return projectResponseData.versions[projectResponseData.versions.length - 1];
        }
        throw new Error('No versions found for PaperMC project.');
    } catch (error) {
        sendConsole(`Could not fetch latest PaperMC version: ${error.message}`, 'ERROR');
        return null;
    }
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
            const versions = projectResponseData.versions.reverse();
            return versions;
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
    .catch(err => { sendConsole(`Failed to open folder ${serverFilesDir}: ${err.message}`, 'ERROR'); console.error("Shell openPath error:", err);});
});

ipcMain.on('download-papermc', async (event, { mcVersion, ramAllocation }) => {
  if (!serverFilesDir || !configFilePath) { sendStatus('Action failed. Launcher paths not ready.', false); sendConsole('ERROR: Server/config directory path not initialized for action.', 'ERROR'); return; }
  sendConsole(`Action 'Download/Configure': Version ${mcVersion}, RAM ${ramAllocation}`, 'INFO');
  const currentConfig = readServerConfig();
  currentConfig.version = mcVersion;
  if (ramAllocation && ramAllocation.toLowerCase() !== 'auto') { currentConfig.ram = ramAllocation; }
  else { delete currentConfig.ram; }
  writeServerConfig(currentConfig);

  const jarPath = path.join(serverFilesDir, paperJarName);
  if (fs.existsSync(jarPath)) {
      sendConsole(`${paperJarName} already exists. Configuration updated.`, 'INFO');
      sendStatus('Configuration saved!', false);
      sendServerStateChange(localIsServerRunningGlobal);
      return;
  }

  sendStatus(`Downloading PaperMC ${mcVersion}...`, true);
  sendConsole(`Workspaceing build info for PaperMC ${mcVersion}... (Jar not found)`, 'INFO');
  try {
    const buildsApiUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds`;
    const buildsResponseData = await new Promise((resolve, reject) => {
        const req = https.get(buildsApiUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (res) => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Failed to get builds list (Status ${res.statusCode}) from ${buildsApiUrl}`)); }
            let data = ''; res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch (parseError) { reject(new Error(`Failed to parse builds JSON: ${parseError.message}. Response: ${data.substring(0, 200)}...`)); }});
        });
        req.on('error', (err) => reject(new Error(`API request error for builds: ${err.message}`))); req.end();
    });
    if (!buildsResponseData.builds || buildsResponseData.builds.length === 0) throw new Error(`No builds found for PaperMC ${mcVersion}.`);
    const latestBuildInfo = buildsResponseData.builds[buildsResponseData.builds.length - 1];
    const latestBuild = latestBuildInfo.build;
    const downloadJarNameFromApi = latestBuildInfo.downloads.application.name;
    sendConsole(`Latest build for ${mcVersion} is #${latestBuild}. JAR: ${downloadJarNameFromApi}`, 'INFO');
    const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild}/downloads/${downloadJarNameFromApi}`;
    const destinationPath = path.join(serverFilesDir, paperJarName);
    sendStatus(`Downloading ${downloadJarNameFromApi} as ${paperJarName}...`, true);
    sendConsole(`Downloading from: ${downloadUrl}`, 'INFO'); sendConsole(`Saving to: ${destinationPath}`, 'INFO');
    if (fs.existsSync(destinationPath)) {
        try { fs.unlinkSync(destinationPath); sendConsole(`Removed existing ${paperJarName} before new download.`, 'WARN'); }
        catch (unlinkError) { sendConsole(`Could not remove existing ${paperJarName}: ${unlinkError.message}`, 'ERROR');}
    }
    const fileStream = fs.createWriteStream(destinationPath);
    await new Promise((resolve, reject) => {
        const req = https.get(downloadUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              if (fs.existsSync(destinationPath)) { try { fs.unlinkSync(destinationPath); } catch(e) {/* ignore */} }
              return reject(new Error(`Download failed (Status ${response.statusCode}) for ${downloadJarNameFromApi}`));
            }
            response.pipe(fileStream);
            fileStream.on('finish', () => { fileStream.close(resolve); });
            fileStream.on('error', (err) => {
              if (fs.existsSync(destinationPath)) { try { fs.unlinkSync(destinationPath); } catch(e) {/* ignore */} }
              reject(new Error(`File stream error: ${err.message}`));
            });
        });
        req.on('error', (err) => {
            if (fs.existsSync(destinationPath)) { try { fs.unlinkSync(destinationPath); } catch(e) {/* ignore */} }
            reject(new Error(`Download request error: ${err.message}`));
        });
        req.end();
    });
    sendStatus('PaperMC downloaded successfully! Configuration also saved.', false);
    sendConsole(`${paperJarName} downloaded to ${serverFilesDir}. Config also saved.`, 'SUCCESS');
    sendServerStateChange(localIsServerRunningGlobal);
  } catch (error) {
    console.error('Download error:', error); sendStatus('Download failed. Check console.', false);
    sendConsole(`ERROR during download: ${error.message}`, 'ERROR');
    sendServerStateChange(localIsServerRunningGlobal);
  }
});

ipcMain.on('start-server', async () => {
  if (!serverFilesDir || !configFilePath) { sendStatus('Cannot start. Launcher paths not ready.', false); sendConsole('ERROR: Server/config directory path not initialized for starting server.', 'ERROR'); return; }
  if (serverProcess) { sendConsole('Server is already running or attempting to start.', 'WARN'); return; }
  const serverJarPath = path.join(serverFilesDir, paperJarName);
  if (!fs.existsSync(serverJarPath)) { sendConsole(`${paperJarName} not found. Setup required.`, 'ERROR'); sendStatus(`${paperJarName} not found. Setup required.`, false); sendServerStateChange(false); return; }
  const serverConfig = readServerConfig();
  const effectiveVersion = serverConfig.version;
  if (!effectiveVersion) { sendConsole('Server version not found in config.json. Cannot start.', 'ERROR'); sendStatus('Server version configuration missing.', false); sendServerStateChange(false); return; }
  sendConsole(`Starting server for Minecraft version (from config): ${effectiveVersion}`, 'INFO');
  const eulaPath = path.join(serverFilesDir, 'eula.txt');
  try {
    if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
      sendConsole('EULA not accepted. Accepting EULA automatically...', 'INFO');
      fs.writeFileSync(eulaPath, '#By agreeing to this EULA, you agree to the Mojang EULA (account.mojang.com/documents/minecraft_eula)\neula=true\n');
      sendConsole('EULA accepted and eula.txt created/updated.', 'INFO');
    }
  } catch (error) { sendConsole(`Error handling eula.txt: ${error.message}`, 'ERROR'); sendStatus('EULA file error.', false); return; }
  let ramToUseForJava = "";
  if (serverConfig.ram && serverConfig.ram.toLowerCase() !== 'auto') {
    ramToUseForJava = serverConfig.ram;
    sendConsole(`Using RAM allocation from config.json: ${ramToUseForJava}.`, 'INFO');
  } else {
    const totalSystemRamBytes = os.totalmem(); const totalSystemRamMB = Math.floor(totalSystemRamBytes / (1024 * 1024));
    let autoRamMB = Math.floor(totalSystemRamMB / 3);
    if (autoRamMB < 1024) autoRamMB = 1024;
    if (autoRamMB > 16384 && totalSystemRamMB > 20000) autoRamMB = 16384;
    else if (autoRamMB > Math.floor(totalSystemRamMB * 0.75)) autoRamMB = Math.floor(totalSystemRamMB * 0.75);
    ramToUseForJava = `${autoRamMB}M`;
    sendConsole(`Auto RAM Allocation (config not set or 'auto'): Total System: ${totalSystemRamMB}MB. Allocating ${ramToUseForJava}.`, 'INFO');
  }
  sendConsole(`Attempting to start server with ${ramToUseForJava} RAM using ${paperJarName}...`, 'INFO');
  sendStatus('Starting server...', true);
  try {
    serverProcess = spawn('java', [
      `-Xms${ramToUseForJava}`, // Setează memoria inițială la fel ca cea maximă pentru a evita realocările
      `-Xmx${ramToUseForJava}`, // Setează memoria maximă disponibilă pentru JVM
      '-XX:+UseG1GC',           // Utilizează Garbage Collector-ul G1, optimizat pentru pauze scurte
      '-XX:MaxGCPauseMillis=200', // Obiectiv de pauză maximă pentru GC (în milisecunde)
      '-XX:+UnlockExperimentalVMOptions', // Permite utilizarea opțiunilor JVM experimentale
      '-XX:+ParallelRefProcEnabled', // Activează procesarea paralelă a referințelor
      '-XX:+AlwaysPreTouch',      // Forțează JVM să atingă toate paginile heap la pornire
      '-XX:G1HeapRegionSize=4M',   // Dimensiunea regiunii heap pentru G1GC (poate fi ajustată)
      '-XX:G1NewSizePercent=20',
      '-XX:G1MaxNewSizePercent=60',
      '-XX:G1ReservePercent=20',
      '-XX:InitiatingHeapOccupancyPercent=35',
      '-XX:+DisableExplicitGC',    // Dezactivează apelurile explicite către System.gc()
      '-Dsun.rmi.dgc.server.gcInterval=2147483646', // Crește intervalul de GC pentru RMI
      '-Dsun.rmi.dgc.client.gcInterval=2147483646', // Crește intervalul de GC pentru RMI client
      '-XX:MaxInlineLevel=15',     // Crește nivelul maxim de inlining
      '-jar',
      paperJarName,
      'nogui'
    ], { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'] });
    serverProcess.killedInternally = false;
    sendServerStateChange(true);
    serverProcess.stdout.on('data', (data) => { sendConsole(data.toString().trimEnd(), 'SERVER_LOG'); });
    serverProcess.stderr.on('data', (data) => { sendConsole(data.toString().trimEnd(), 'SERVER_ERROR'); });
    serverProcess.on('close', (code) => {
      sendConsole(`Server process exited with code ${code}.`, code === 0 || code === null || serverProcess?.killedInternally ? 'INFO' : 'ERROR');
      const wasKilledInternally = serverProcess?.killedInternally;
      serverProcess = null;
      sendServerStateChange(false);
      if (wasKilledInternally) sendStatus('Server stopped.', false);
      else {
          sendStatus('Server stopped unexpectedly.', false);
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('request-status-check-for-fail');
      }
    });
    serverProcess.on('error', (err) => {
      sendConsole(`Failed to start server process: ${err.message}`, 'ERROR');
      if (err.message.toLowerCase().includes('enoent')) { sendConsole('IMPORTANT: "java" command not found...', 'ERROR'); sendStatus('Java not found!', false); }
      else { sendStatus('Server start failed.', false); }
      serverProcess = null; sendServerStateChange(false);
    });
  } catch (error) {
    sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
    serverProcess = null; sendServerStateChange(false);
    sendStatus('Error starting server.', false);
  }
});

ipcMain.on('stop-server', async () => {
  if (!serverProcess || !serverProcess.pid || serverProcess.killed) { if(!serverProcess || (serverProcess && serverProcess.killed)) sendServerStateChange(false); sendConsole('Server not running or already stopping.', 'WARN'); return; }
  sendConsole('Attempting to stop server via "stop" command...', 'INFO');
  sendStatus('Stopping server...', true);
  serverProcess.killedInternally = true;
  try { serverProcess.stdin.write("stop\n"); }
  catch (e) { sendConsole(`Error writing 'stop' command: ${e.message}. Forcing kill.`, "ERROR"); serverProcess.kill('SIGKILL'); return; }
  const stopTimeout = setTimeout(() => { if (serverProcess && serverProcess.pid && !serverProcess.killed) { sendConsole('Server did not stop gracefully. Forcing shutdown...', 'WARN'); serverProcess.kill('SIGKILL'); } }, 10000);
  const tempCloseHandler = () => { clearTimeout(stopTimeout); if(serverProcess) serverProcess.removeListener('close', tempCloseHandler); };
  if(serverProcess) serverProcess.once('close', tempCloseHandler);
});

ipcMain.on('send-command', async (event, command) => {
  if (serverProcess && serverProcess.stdin && !serverProcess.killed) {
    try { serverProcess.stdin.write(command + '\n'); }
    catch (error) { sendConsole(`Error writing to server stdin: ${error.message}`, 'ERROR'); }
  } else { sendConsole('Cannot send command: Server not running or stdin not available.', 'ERROR'); }
});
ipcMain.handle('get-local-ip', async () => getLocalIPv4());
ipcMain.handle('get-public-ip', async () => {
    try { return await getPublicIP(); }
    catch (error) { console.error("Error getting public IP in main process:", error.message); sendConsole(`Could not fetch Public IP: ${error.message}`, 'ERROR'); return 'N/A (Error)'; }
});