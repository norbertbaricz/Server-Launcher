const { BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

let mainWindow;

function getMainWindow() {
  return mainWindow;
}

function createWindow(htmlPath = 'index.html') {
  const resolveIconForWindow = () => {
    try {
      const resBase = process.resourcesPath;
      const buildBase = path.join(__dirname, '..', 'build');
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
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !require('electron').app.isPackaged,
      backgroundThrottling: true
    }
  });

  mainWindow.loadFile(htmlPath);
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

  return mainWindow;
}

module.exports = {
  createWindow,
  getMainWindow,
};
