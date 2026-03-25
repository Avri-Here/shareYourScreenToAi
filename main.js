// main.js - Electron Main Process
const { app, BrowserWindow, ipcMain, session, desktopCapturer, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    if (permission === 'display-capture' || permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  session.defaultSession.setDisplayMediaRequestHandler(
    (_, callback) => {
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          if (!sources.length) {
            callback({});
            return;
          }
          callback({ video: sources[0] });
        })
        .catch(() => {
          callback({});
        });
    },
    { useSystemPicker: true }
  );
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Save API key
ipcMain.handle('save-api-key', async (event, apiKey) => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ apiKey }));
  return true;
});

// Load API key
ipcMain.handle('load-api-key', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return config.apiKey;
    }
  } catch (error) {
    console.error('Error loading API key:', error);
  }
  return null;
});