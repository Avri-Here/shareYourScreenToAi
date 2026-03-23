// main.js - Electron Main Process
const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 1200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'display-capture' || permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
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

// Select video file
ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Read video file
ipcMain.handle('read-video-file', async (event, filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const stats = fs.statSync(filePath);
    
    return {
      base64: base64,
      size: stats.size,
      name: path.basename(filePath)
    };
  } catch (error) {
    console.error('Error reading video file:', error);
    throw error;
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