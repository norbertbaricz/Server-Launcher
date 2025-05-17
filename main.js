const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { spawn } = require('node:child_process');
const os = require('node:os');

const serverFilesDir = path.join(__dirname, 'MinecraftServer');
const paperJarName = 'paper.jar';
let serverProcess = null;

function getMainWindow() {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
}

function sendStatus(message, pulse = false) {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('update-status', message, pulse);
}

function sendConsole(message, type = 'INFO') {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('update-console', message, type);
}

function sendServerStateChange(isRunning) {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('server-state-change', isRunning);
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
      devTools: true 
    }
  });
  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); 
}

app.whenReady().then(() => {
  if (!fs.existsSync(serverFilesDir)) {
    try {
      fs.mkdirSync(serverFilesDir, { recursive: true });
      console.log(`Folder created: ${serverFilesDir}`);
    } catch (error) {
      console.error(`Failed to create directory ${serverFilesDir}:`, error);
    }
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow();});
});

app.on('window-all-closed', () => {
  if (serverProcess && typeof serverProcess.kill === 'function') {
    sendConsole('Application closing, ensuring server is stopped...', 'WARN');
    serverProcess.kill('SIGKILL');
    serverProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-app-path', async () => app.getAppPath());

ipcMain.on('open-server-folder', () => {
  if (!fs.existsSync(serverFilesDir)) {
    sendConsole(`Server directory does not exist yet: ${serverFilesDir}`, 'ERROR');
    try {
        fs.mkdirSync(serverFilesDir, { recursive: true });
        sendConsole(`Created server directory: ${serverFilesDir}`, 'INFO');
    } catch (error) {
        sendConsole(`Failed to create server directory: ${error.message}`, 'ERROR');
        return;
    }
  }
  shell.openPath(serverFilesDir)
    .then(result => {
      if (result !== "") { sendConsole(`Error opening folder ${serverFilesDir}: ${result}`, 'ERROR'); }
      else { sendConsole(`Opened folder: ${serverFilesDir}`, 'INFO'); }
    })
    .catch(err => { sendConsole(`Failed to open folder ${serverFilesDir}: ${err.message}`, 'ERROR'); console.error("Shell openPath error:", err);});
});

ipcMain.on('download-papermc', async (event, mcVersion) => {
  sendStatus(`Workspaceing info for PaperMC ${mcVersion}...`, true);
  sendConsole(`Workspaceing latest build for PaperMC ${mcVersion}...`, 'INFO');
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
    if (!buildsResponseData.builds || buildsResponseData.builds.length === 0) throw new Error(`No builds for PaperMC ${mcVersion}.`);
    const latestBuild = buildsResponseData.builds[buildsResponseData.builds.length - 1].build;
    sendConsole(`Latest build for ${mcVersion} is #${latestBuild}.`, 'INFO');
    const downloadJarName = `paper-${mcVersion}-${latestBuild}.jar`;
    const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${mcVersion}/builds/${latestBuild}/downloads/${downloadJarName}`;
    const destinationPath = path.join(serverFilesDir, paperJarName);
    sendStatus(`Downloading ${downloadJarName}...`, true);
    sendConsole(`Downloading from: ${downloadUrl}`, 'INFO'); sendConsole(`Saving to: ${destinationPath}`, 'INFO');
    if (fs.existsSync(destinationPath)) {
        try { fs.unlinkSync(destinationPath); sendConsole(`Removed old ${paperJarName}.`, 'INFO'); }
        catch (unlinkError) { sendConsole(`Could not remove old ${paperJarName}: ${unlinkError.message}`, 'ERROR');}
    }
    const fileStream = fs.createWriteStream(destinationPath);
    await new Promise((resolve, reject) => {
      const req = https.get(downloadUrl, { headers: { 'User-Agent': 'MyMinecraftLauncher/1.0' } }, (response) => {
        if (response.statusCode !== 200) {
          response.resume(); if (fs.existsSync(destinationPath)) fs.unlink(destinationPath, () => {});
          return reject(new Error(`Download failed (Status ${response.statusCode}) for ${downloadJarName}`));
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => { fileStream.close(resolve); });
        fileStream.on('error', (err) => { if (fs.existsSync(destinationPath)) fs.unlink(destinationPath, () => {}); reject(new Error(`File stream error: ${err.message}`)); });
      });
      req.on('error', (err) => { if (fs.existsSync(destinationPath)) fs.unlink(destinationPath, () => {}); reject(new Error(`Download request error: ${err.message}`)); });
      req.end();
    });
    sendStatus('PaperMC downloaded successfully!', false);
    sendConsole(`${paperJarName} downloaded to ${serverFilesDir}`, 'SUCCESS');
    sendServerStateChange(false);
  } catch (error) {
    console.error('Download error:', error); sendStatus('Download failed. Check console.', false);
    sendConsole(`ERROR: ${error.message}`, 'ERROR'); sendServerStateChange(false);
  }
});

ipcMain.on('start-server', async (event, { version, ram }) => {
  if (serverProcess) { sendConsole('Server is already running or attempting to start.', 'WARN'); return; }
  const serverJarPath = path.join(serverFilesDir, paperJarName);
  if (!fs.existsSync(serverJarPath)) { sendConsole(`${paperJarName} not found in ${serverFilesDir}. Please download it.`, 'ERROR'); sendStatus(`${paperJarName} not found.`, false); return; }
  const eulaPath = path.join(serverFilesDir, 'eula.txt');
  try {
    if (!fs.existsSync(eulaPath) || !fs.readFileSync(eulaPath, 'utf8').includes('eula=true')) {
      sendConsole('EULA not accepted. Accepting automatically...', 'INFO');
      fs.writeFileSync(eulaPath, '#By agreeing to this EULA, you agree to the Mojang EULA (account.mojang.com/documents/minecraft_eula)\neula=true\n');
      sendConsole('EULA accepted.', 'INFO');
    }
  } catch (error) { sendConsole(`Error handling eula.txt: ${error.message}`, 'ERROR'); sendStatus('EULA error.', false); return; }
  let ramToUseForJava = "";
  if (ram === 'auto') {
    const totalSystemRamBytes = os.totalmem(); const totalSystemRamMB = Math.floor(totalSystemRamBytes / (1024 * 1024));
    let autoRamMB = Math.floor(totalSystemRamMB / 3);
    if (autoRamMB < 1024) autoRamMB = 1024;
    if (autoRamMB > 16384 && totalSystemRamMB > 20000) autoRamMB = 16384;
    else if (autoRamMB > Math.floor(totalSystemRamMB * 0.75)) autoRamMB = Math.floor(totalSystemRamMB * 0.75);
    ramToUseForJava = `${autoRamMB}M`;
    sendConsole(`Auto RAM: Total System: ${totalSystemRamMB}MB. Allocating ${ramToUseForJava}.`, 'INFO');
  } else { ramToUseForJava = ram; }
  sendConsole(`Attempting to start server with ${ramToUseForJava} RAM using ${paperJarName}...`, 'INFO'); sendStatus('Starting server...', true);
  try {
    serverProcess = spawn('java', [`-Xmx${ramToUseForJava}`, `-Xms${ramToUseForJava}`, '-jar', paperJarName, 'nogui'], { cwd: serverFilesDir, stdio: ['pipe', 'pipe', 'pipe'] });
    sendServerStateChange(true);
    serverProcess.stdout.on('data', (data) => { sendConsole(data.toString().trimEnd(), 'SERVER_LOG'); });
    serverProcess.stderr.on('data', (data) => { sendConsole(data.toString().trimEnd(), 'SERVER_ERROR'); });
    serverProcess.on('close', (code) => {
      sendConsole(`Server process exited with code ${code}.`, code === 0 || code === null ? 'INFO' : 'ERROR');
      if (serverProcess && !serverProcess.killed) serverProcess = null; sendServerStateChange(false); sendStatus('Server stopped.', false);
    });
    serverProcess.on('error', (err) => {
      sendConsole(`Failed to start server: ${err.message}`, 'ERROR');
      if (serverProcess && !serverProcess.killed) serverProcess = null; sendServerStateChange(false); sendStatus('Server start failed.', false);
    });
  } catch (error) {
    sendConsole(`Error spawning server: ${error.message}`, 'ERROR');
    if (serverProcess && !serverProcess.killed) serverProcess = null; sendServerStateChange(false); sendStatus('Error starting server.', false);
  }
});

ipcMain.on('stop-server', async () => {
  if (!serverProcess || !serverProcess.pid || serverProcess.killed) {
    sendConsole('Server not running or already stopping.', 'WARN');
    if(!serverProcess || (serverProcess && serverProcess.killed)) sendServerStateChange(false); return;
  }
  sendConsole('Attempting to stop server via "stop" command...', 'INFO'); sendStatus('Stopping server...', true);
  serverProcess.stdin.write("stop\n");
  const stopTimeout = setTimeout(() => {
    if (serverProcess && serverProcess.pid && !serverProcess.killed) {
      sendConsole('Server did not stop gracefully. Forcing shutdown...', 'WARN'); serverProcess.kill('SIGKILL');
    }
  }, 10000);
  const cleanUp = () => { clearTimeout(stopTimeout); if (serverProcess) { serverProcess.removeListener('close', cleanUp); serverProcess.removeListener('exit', cleanUp);}};
  if (serverProcess) { serverProcess.once('close', cleanUp); serverProcess.once('exit', cleanUp); }
});

ipcMain.on('send-command', async (event, command) => {
  if (serverProcess && serverProcess.stdin && !serverProcess.killed) {
    try { serverProcess.stdin.write(command + '\n'); }
    catch (error) { sendConsole(`Error writing to server stdin: ${error.message}`, 'ERROR');}
  } else { sendConsole('Cannot send command: Server not running or stdin not available.', 'ERROR');}
});

ipcMain.handle('get-local-ip', async () => {
    return getLocalIPv4();
});

ipcMain.handle('get-public-ip', async () => {
    try {
        return await getPublicIP();
    } catch (error) {
        console.error("Error getting public IP in main process:", error.message);
        sendConsole(`Could not fetch Public IP: ${error.message}`, 'ERROR');
        return 'N/A (Error)';
    }
});