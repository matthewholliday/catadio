import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkHookStatus, installHooks, projectIdFor } from './hook-installer.js';
import { setApplicationMenu } from './menu.js';
import { ProjectManager } from './project-manager.js';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pm = new ProjectManager();

/** @type {BrowserWindow | null} */
let mainWindow = null;

function getPreloadPath() {
  return path.join(__dirname, 'preload.js');
}

function notifyProjectChanged(project) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project-changed', project);
  }
  refreshMenu();
}

function refreshMenu() {
  setApplicationMenu({
    onOpenProject: () => handleOpenProject(),
    onSwitchProject: (id) => handleSwitchProject(id),
    getRecentProjects: () => pm.getRecent(),
  });
}

async function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Cursor Agent Dashboard',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const loadUrl = isDev ? 'http://localhost:5173' : 'http://127.0.0.1:3847';

  try {
    await mainWindow.loadURL(loadUrl);
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (err) {
    console.error(`Failed to load dashboard UI at ${loadUrl}:`, err);
  }

  refreshMenu();
}

async function handleOpenProject() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Cursor Project',
  });

  if (canceled || !filePaths[0]) return null;

  const folder = filePaths[0];
  const { projectId } = installHooks(folder);
  const project = pm.setActive({
    id: projectId,
    path: folder,
    name: path.basename(folder),
  });

  notifyProjectChanged(project);
  return project;
}

function handleSwitchProject(id) {
  const project = pm.switchTo(id);
  if (project) notifyProjectChanged(project);
  return project;
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
    process.env.WEB_DIST_PATH = path.join(app.getAppPath(), 'web', 'dist');
    await startServer({ port: 3847 });
  }

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('open-project', handleOpenProject);
ipcMain.handle('get-active-project', () => pm.getActive());
ipcMain.handle('get-recent-projects', () => pm.getRecent());
ipcMain.handle('switch-project', (_, id) => handleSwitchProject(id));
ipcMain.handle('install-hooks', (_, folderPath) => installHooks(folderPath));
ipcMain.handle('hook-status', (_, folderPath) => checkHookStatus(folderPath));
ipcMain.handle('project-id-for', (_, folderPath) => projectIdFor(folderPath));
