const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');

// app.isPackaged is true only inside a distributed .dmg/.exe.
// For the "build + run" script we use ELECTRON_ENV=production so that
// the app loads web/dist without needing the Vite dev server.
const IS_DEV = !app.isPackaged && process.env.ELECTRON_ENV !== 'production';
const SERVER_PORT = 3847;

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {{ id: string; name: string; path: string } | null} */
let activeProject = null;
/** @type {Array<{ id: string; name: string; path: string }>} */
let recentProjects = [];

// ---------------------------------------------------------------------------
// Persistent storage
// ---------------------------------------------------------------------------

function getDataPath() {
  return path.join(app.getPath('userData'), 'projects.json');
}

function loadProjects() {
  try {
    const raw = fs.readFileSync(getDataPath(), 'utf8');
    const data = JSON.parse(raw);
    recentProjects = Array.isArray(data.recentProjects) ? data.recentProjects : [];
    activeProject = data.activeProject ?? null;
  } catch {
    recentProjects = [];
    activeProject = null;
  }
}

function saveProjects() {
  try {
    fs.writeFileSync(
      getDataPath(),
      JSON.stringify({ recentProjects, activeProject }, null, 2),
    );
  } catch (err) {
    console.error('Failed to save project data:', err);
  }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * When asar is disabled, app.getAppPath() points to the directory with all
 * app files. In dev it's the repo root.
 */
function appPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

function getHooksSourceDir() {
  return appPath('.cursor', 'hooks');
}

// ---------------------------------------------------------------------------
// Hook installation
// ---------------------------------------------------------------------------

const HOOK_COMMANDS = {
  sessionStart: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py sessionStart' }],
  beforeShellExecution: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py beforeShellExecution' }],
  afterShellExecution: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py afterShellExecution' }],
  afterFileEdit: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py afterFileEdit' }],
  postToolUse: [
    {
      command: 'python3 .cursor/hooks/dashboard_telemetry.py postToolUse',
      matcher: 'Write|StrReplace|ApplyPatch|EditNotebook',
    },
  ],
  afterAgentThought: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py afterAgentThought' }],
  beforeMCPExecution: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py beforeMCPExecution' }],
  afterMCPExecution: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py afterMCPExecution' }],
  stop: [{ command: 'python3 .cursor/hooks/dashboard_telemetry.py stop' }],
};

function checkHookStatus(targetDir) {
  const scriptPath = path.join(targetDir, '.cursor', 'hooks', 'dashboard_telemetry.py');
  const hooksJsonPath = path.join(targetDir, '.cursor', 'hooks.json');

  const scriptExists = fs.existsSync(scriptPath);

  let hooksJsonOk = false;
  try {
    const data = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    hooksJsonOk = Object.values(data.hooks ?? {}).some(
      (entries) =>
        Array.isArray(entries) &&
        entries.some(
          (e) => typeof e.command === 'string' && e.command.includes('dashboard_telemetry.py'),
        ),
    );
  } catch {
    // File missing or malformed; hooksJsonOk stays false
  }

  if (scriptExists && hooksJsonOk) return { status: 'active' };
  if (scriptExists || hooksJsonOk) return { status: 'partial' };
  return { status: 'missing' };
}

function installHooks(targetDir, projectId) {
  const cursorDir = path.join(targetDir, '.cursor');
  const hooksDir = path.join(cursorDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy telemetry script from bundled resources
  const srcScript = path.join(getHooksSourceDir(), 'dashboard_telemetry.py');
  const destScript = path.join(hooksDir, 'dashboard_telemetry.py');
  fs.copyFileSync(srcScript, destScript);

  // Scope the telemetry endpoint to this project's UUID so hook events
  // land in the correct WebSocket bucket (not the generic "default").
  const dashboardUrl = projectId
    ? `http://localhost:3847/api/v1/telemetry?project=${encodeURIComponent(projectId)}`
    : 'http://localhost:3847/api/v1/telemetry';

  // Read and merge hooks.json
  const hooksJsonPath = path.join(cursorDir, 'hooks.json');
  let existing = { version: 1, hooks: {} };
  try {
    const raw = fs.readFileSync(hooksJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    existing = { version: 1, ...parsed, hooks: parsed.hooks ?? {} };
  } catch {
    // No existing hooks.json; start fresh
  }

  for (const [event, entries] of Object.entries(HOOK_COMMANDS)) {
    const current = existing.hooks[event] ?? [];
    // Remove any stale dashboard entries for this event before re-adding
    const filtered = current.filter(
      (e) => typeof e.command !== 'string' || !e.command.includes('dashboard_telemetry.py'),
    );
    const scopedEntries = entries.map((entry) => ({
      ...entry,
      command: `DASHBOARD_URL=${dashboardUrl} ${entry.command}`,
    }));
    existing.hooks[event] = [...filtered, ...scopedEntries];
  }

  fs.writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Express/WebSocket server startup
// ---------------------------------------------------------------------------

async function startDashboardServer() {
  const serverEntry = appPath('server', 'index.js');
  const { startServer } = await import(pathToFileURL(serverEntry).href);
  await startServer({ port: SERVER_PORT });
}

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------

// Fixed windowed-mode dimensions (non-resizable baseline).
const BACKGROUND_WIDTH = 200;
const BACKGROUND_HEIGHT = 420;
const WINDOWED_WIDTH = 1400;
const FOOTER_HEIGHT = 23; // 10px text + py-1.5 (12px) + 1px border
const WINDOWED_HEIGHT_NORMAL = 900 + FOOTER_HEIGHT;
const WINDOWED_HEIGHT_DENSE = 720 + FOOTER_HEIGHT;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOWED_WIDTH,
    height: WINDOWED_HEIGHT_NORMAL,
    minWidth: WINDOWED_WIDTH,
    minHeight: WINDOWED_HEIGHT_NORMAL,
    resizable: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Push fullscreen state changes to the renderer so the toggle button stays in sync
  // when the user exits fullscreen via the OS (e.g. Escape key or green traffic light).
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreenChanged', true);
  });
  mainWindow.on('leave-full-screen', () => {
    // Restore non-resizable windowed size after the OS animation completes.
    mainWindow?.setMinimumSize(WINDOWED_WIDTH, WINDOWED_HEIGHT_NORMAL);
    mainWindow?.setSize(WINDOWED_WIDTH, WINDOWED_HEIGHT_NORMAL);
    mainWindow?.setResizable(false);
    mainWindow?.webContents.send('window:fullscreenChanged', false);
  });

  if (IS_DEV) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(appPath('web', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers() {
  // --- project:open --------------------------------------------------------
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Cursor Project Folder',
      properties: ['openDirectory'],
      buttonLabel: 'Open Project',
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const dirPath = result.filePaths[0];
    const existing = recentProjects.find((p) => p.path === dirPath);
    const project = existing ?? {
      id: randomUUID(),
      name: path.basename(dirPath),
      path: dirPath,
    };

    if (!existing) {
      recentProjects.unshift(project);
      if (recentProjects.length > 10) recentProjects = recentProjects.slice(0, 10);
    }

    activeProject = project;
    saveProjects();
    mainWindow?.webContents.send('project:changed', project);
    return project;
  });

  // --- project:getActive ---------------------------------------------------
  ipcMain.handle('project:getActive', () => activeProject);

  // --- project:getRecent ---------------------------------------------------
  ipcMain.handle('project:getRecent', () => recentProjects);

  // --- project:switch ------------------------------------------------------
  ipcMain.handle('project:switch', (_event, id) => {
    const project = recentProjects.find((p) => p.id === id) ?? null;
    activeProject = project;
    saveProjects();
    mainWindow?.webContents.send('project:changed', project);
    return project;
  });

  // --- hooks:getStatus -----------------------------------------------------
  ipcMain.handle('hooks:getStatus', (_event, dirPath) => {
    try {
      return checkHookStatus(dirPath);
    } catch (err) {
      console.error('hooks:getStatus error:', err);
      return { status: 'missing' };
    }
  });

  // --- hooks:setup ---------------------------------------------------------
  ipcMain.handle('hooks:setup', (_event, dirPath) => {
    try {
      const project =
        recentProjects.find((p) => p.path === dirPath) ??
        (activeProject?.path === dirPath ? activeProject : null);
      const projectId = project?.id ?? null;
      installHooks(dirPath, projectId);
      return { success: true, status: checkHookStatus(dirPath) };
    } catch (err) {
      console.error('hooks:setup error:', err);
      return { success: false, error: err.message };
    }
  });

  // --- shell:openExternal --------------------------------------------------
  ipcMain.handle('shell:openExternal', (_event, url) => {
    shell.openExternal(url);
  });

  // --- window:setBackgroundMode --------------------------------------------
  ipcMain.handle('window:setBackgroundMode', (_event, enabled) => {
    if (!mainWindow) return;
    if (enabled) {
      // Exit fullscreen before collapsing to the compact background size.
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
      mainWindow.setMinimumSize(BACKGROUND_WIDTH, 200);
      mainWindow.setSize(BACKGROUND_WIDTH, BACKGROUND_HEIGHT);
      mainWindow.setResizable(false);
      mainWindow.center();
    } else {
      mainWindow.setMinimumSize(WINDOWED_WIDTH, WINDOWED_HEIGHT_NORMAL);
      mainWindow.setSize(WINDOWED_WIDTH, WINDOWED_HEIGHT_NORMAL);
      mainWindow.setResizable(false);
      mainWindow.center();
    }
  });

  // --- window:setFullscreen ------------------------------------------------
  ipcMain.handle('window:setFullscreen', (_event, enabled) => {
    if (!mainWindow) return;
    if (enabled) {
      // macOS requires a resizable window to enter native fullscreen.
      mainWindow.setResizable(true);
      mainWindow.setFullScreen(true);
    } else {
      mainWindow.setFullScreen(false);
      // Windowed restoration is handled in the leave-full-screen event.
    }
  });

  // --- window:isFullscreen -------------------------------------------------
  ipcMain.handle('window:isFullscreen', () => {
    return mainWindow?.isFullScreen() ?? false;
  });

  // --- window:setWindowedHeight --------------------------------------------
  // Lets the renderer adjust the windowed height for the active density mode
  // without leaving dead space at the bottom of the non-resizable window.
  ipcMain.handle('window:setWindowedHeight', (_event, height) => {
    if (!mainWindow || mainWindow.isFullScreen()) return;
    const h = Math.max(400, Math.round(height));
    mainWindow.setMinimumSize(WINDOWED_WIDTH, h);
    mainWindow.setSize(WINDOWED_WIDTH, h);
  });

  // --- app:quit ------------------------------------------------------------
  ipcMain.handle('app:quit', () => {
    app.quit();
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  loadProjects();
  if (!IS_DEV) {
    await startDashboardServer();
  }
  registerIpcHandlers();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
