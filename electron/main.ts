import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { getSystemProcesses } from './monitor';
import { 
  initDatabase, saveSetting, getSetting, recordSnapshots,
  getChatHistory, addChatMessage, clearChatHistory 
} from './database';
import { analyzeProcess } from './ai';
import { getProcessNetworkStats, getProcessConnections } from './detailed-stats';
import { 
  getAISettings, saveAISettings, testConnection, 
  CHAT_MODELS, EMBEDDING_MODELS 
} from './openrouter';
import type { AISettings } from './openrouter';
import { fullRecluster, getCurrentClusters, refreshClusterStats, needsFullRecluster } from './clustering';
import { processChat, streamChat, getChatSuggestions } from './chat-agent';

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

  // ============ AI Settings Handlers ============
  
  ipcMain.handle('ai:get-settings', () => {
    return getAISettings();
  });

  ipcMain.handle('ai:save-settings', (_, settings: Partial<AISettings>) => {
    saveAISettings(settings);
    return true;
  });

  ipcMain.handle('ai:test-connection', async (_, apiKey: string) => {
    return await testConnection(apiKey);
  });

  ipcMain.handle('ai:get-models', () => {
    return {
      chatModels: CHAT_MODELS,
      embeddingModels: EMBEDDING_MODELS,
    };
  });

  // ============ Chat Handlers ============

  // Use ipcMain.on for streaming (not handle) so we can send multiple messages
  ipcMain.on('chat:send-stream', async (event, message: string) => {
    try {
      // Add user message to history
      addChatMessage('user', message);
      
      // Stream the response
      let fullResponse = '';
      
      for await (const chunk of streamChat(message)) {
        fullResponse += chunk;
        // Send chunk to renderer for live updates
        event.sender.send('chat:stream', chunk);
      }
      
      // Add complete assistant response to history
      addChatMessage('assistant', fullResponse);
      
      // Signal completion
      event.sender.send('chat:stream-end', { success: true, response: fullResponse });
    } catch (error) {
      console.error('Chat error:', error);
      event.sender.send('chat:stream-end', { success: false, error: String(error) });
    }
  });

  // Keep the handle version for non-streaming fallback
  ipcMain.handle('chat:send', async (_, message: string) => {
    try {
      // Add user message to history
      addChatMessage('user', message);
      
      // Get response (non-streaming)
      const response = await processChat(message);
      
      // Add assistant response to history
      addChatMessage('assistant', response);
      
      return { success: true, response };
    } catch (error) {
      console.error('Chat error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('chat:suggestions', () => {
    return getChatSuggestions();
  });

  ipcMain.handle('chat:get-history', () => {
    return getChatHistory(50);
  });

  ipcMain.handle('chat:clear', () => {
    clearChatHistory();
    return true;
  });

  // ============ Clustering Handlers ============

  ipcMain.handle('ai:cluster-processes', async () => {
    try {
      const data = await getSystemProcesses();
      const tree = await fullRecluster(data.processes);
      return { success: true, tree };
    } catch (error) {
      console.error('Clustering error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('ai:get-clusters', () => {
    return getCurrentClusters();
  });

  ipcMain.handle('ai:refresh-cluster-stats', async () => {
    try {
      const data = await getSystemProcesses();
      refreshClusterStats(data.processes);
      return { success: true, clusters: getCurrentClusters() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
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

