const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboard', {
  /** Open a native directory picker; returns the selected project or null. */
  openProject: () => ipcRenderer.invoke('project:open'),

  /** Returns the currently active project (or null). */
  getActiveProject: () => ipcRenderer.invoke('project:getActive'),

  /**
   * Subscribe to project-change events pushed from the main process.
   * Returns an unsubscribe function.
   */
  onProjectChanged: (callback) => {
    const listener = (_event, project) => callback(project);
    ipcRenderer.on('project:changed', listener);
    return () => ipcRenderer.removeListener('project:changed', listener);
  },

  /** Returns the list of recently opened projects. */
  getRecentProjects: () => ipcRenderer.invoke('project:getRecent'),

  /** Switch to a recent project by id; returns the project or null. */
  switchProject: (id) => ipcRenderer.invoke('project:switch', id),

  /**
   * Check whether dashboard hooks are installed in the given directory.
   * Returns { status: 'active' | 'partial' | 'missing' }.
   */
  getHookStatus: (dirPath) => ipcRenderer.invoke('hooks:getStatus', dirPath),

  /**
   * Install or update dashboard hooks in the given directory.
   * Returns { success: boolean, status?, error? }.
   */
  setupHooks: (dirPath) => ipcRenderer.invoke('hooks:setup', dirPath),

  /** Quit the application. */
  quit: () => ipcRenderer.invoke('app:quit'),

  /**
   * Enter or exit background mode, which resizes the window to a compact
   * size (~280px wide) or restores it to the normal dashboard size.
   */
  setBackgroundMode: (enabled) => ipcRenderer.invoke('window:setBackgroundMode', enabled),
});
