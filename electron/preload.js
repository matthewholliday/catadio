const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboard', {
  openProject: () => ipcRenderer.invoke('open-project'),
  getActiveProject: () => ipcRenderer.invoke('get-active-project'),
  getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
  switchProject: (id) => ipcRenderer.invoke('switch-project', id),
  installHooks: (folderPath) => ipcRenderer.invoke('install-hooks', folderPath),
  getHookStatus: (folderPath) => ipcRenderer.invoke('hook-status', folderPath),
  onProjectChanged: (callback) => {
    const listener = (_event, project) => callback(project);
    ipcRenderer.on('project-changed', listener);
    return () => ipcRenderer.removeListener('project-changed', listener);
  },
});
