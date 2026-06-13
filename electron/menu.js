import { Menu, shell } from 'electron';

export function buildMenu({ onOpenProject, onSwitchProject, getRecentProjects }) {
  const recentProjects = getRecentProjects();

  const recentSubmenu = recentProjects.length
    ? recentProjects.map((project) => ({
        label: project.name,
        toolTip: project.path,
        click: () => onSwitchProject(project.id),
      }))
    : [{ label: 'No recent projects', enabled: false }];

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: onOpenProject,
        },
        {
          label: 'Recent Projects',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Cursor Hooks Documentation',
          click: () => shell.openExternal('https://cursor.com/docs/hooks'),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Cursor Agent Dashboard',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  return Menu.buildFromTemplate(template);
}

export function setApplicationMenu(options) {
  Menu.setApplicationMenu(buildMenu(options));
}
