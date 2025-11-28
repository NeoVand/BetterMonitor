import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { getSystemProcesses } from './monitor';
import { initDatabase, saveSetting, getSetting, recordSnapshots } from './database';
import { analyzeProcess } from './ai';
import { getProcessNetworkStats, getProcessConnections } from './detailed-stats';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset', // Native Mac look
    vibrancy: 'under-window',     // Glass effect
    visualEffectState: 'active',
    backgroundColor: '#00000000', // Transparent for vibrancy
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // When built, the path is relative to dist/electron/electron/main.js
    // We need to go up 4 levels to reach root (dist/electron/electron/main.js -> electron/electron/dist -> electron/electron -> electron -> root), 
    // then into renderer/dist/out/index.html
    // Actually, let's look at the file structure again.
    // dist/
    //   electron/
    //     electron/
    //       main.js
    // renderer/
    //   dist/
    //     out/
    //       index.html
    
    // So from dist/electron/electron/main.js:
    // ../../../renderer/dist/out/index.html
    mainWindow.loadFile(path.join(__dirname, '../../../renderer/dist/out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  initDatabase();
  createWindow();

  // Start Background Recording Loop (Every 5s)
  setInterval(async () => {
    try {
      const data = await getSystemProcesses();
      // Save top 20 active processes to save DB space for prototype
      const topProcesses = data.processes
        .sort((a, b) => b.cpu - a.cpu)
        .slice(0, 20);
        
      recordSnapshots(topProcesses);
    } catch (err) {
      console.error("Snapshot failed:", err);
    }
  }, 5000);
  
  // IPC Handlers
  ipcMain.handle('ping', () => 'pong');
  ipcMain.handle('monitor:get-processes', async () => {
    return await getSystemProcesses();
  });

  ipcMain.handle('settings:save-key', (_, key) => {
    saveSetting('openai_api_key', key);
    return true;
  });

  ipcMain.handle('settings:get-key', () => {
    return getSetting('openai_api_key');
  });

  ipcMain.handle('ai:analyze', async (_, { name, command }) => {
    return await analyzeProcess(name, command);
  });

  ipcMain.handle('monitor:get-process-network', async (_, pid) => {
    return await getProcessNetworkStats(pid);
  });

  ipcMain.handle('monitor:get-process-connections', async (_, pid) => {
    return await getProcessConnections(pid);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

