import Store from 'electron-store';

const MAX_RECENT = 10;

const store = new Store({
  name: 'agent-dashboard',
  defaults: {
    activeProject: null,
    recentProjects: [],
  },
});

export class ProjectManager {
  getActive() {
    return store.get('activeProject');
  }

  getRecent() {
    return store.get('recentProjects', []);
  }

  setActive(project) {
    store.set('activeProject', project);
    this.addToRecent(project);
    return project;
  }

  addToRecent(project) {
    const recent = store.get('recentProjects', []).filter((p) => p.id !== project.id);
    recent.unshift({
      id: project.id,
      path: project.path,
      name: project.name,
      openedAt: Date.now(),
    });
    store.set('recentProjects', recent.slice(0, MAX_RECENT));
  }

  switchTo(id) {
    const recent = store.get('recentProjects', []);
    const project = recent.find((p) => p.id === id);
    if (!project) return null;
    store.set('activeProject', project);
    return project;
  }
}
