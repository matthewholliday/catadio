import { useEffect, useState } from 'react';

export function ProjectBar({ project, onOpen, onSwitch, connected }) {
  const [recent, setRecent] = useState([]);
  const [hookStatus, setHookStatus] = useState(null);
  const isElectron = typeof window.dashboard !== 'undefined';

  useEffect(() => {
    if (!isElectron) return;
    window.dashboard.getRecentProjects().then(setRecent);
  }, [isElectron, project?.id]);

  useEffect(() => {
    if (!isElectron || !project?.path) {
      setHookStatus(null);
      return;
    }
    window.dashboard.getHookStatus(project.path).then(setHookStatus);
  }, [isElectron, project?.path]);

  if (!isElectron) return null;

  const hookBadge = (() => {
    if (!project) {
      return { label: 'No project', className: 'bg-slate-700 text-slate-300' };
    }
    if (hookStatus?.status === 'active') {
      return { label: 'Hooks active', className: 'bg-success/20 text-success' };
    }
    if (hookStatus?.status === 'partial') {
      return { label: 'Hooks partial', className: 'bg-warn/20 text-warn' };
    }
    if (hookStatus?.status === 'missing') {
      return { label: 'Hooks missing', className: 'bg-danger/20 text-danger' };
    }
    return { label: 'Checking hooks…', className: 'bg-slate-700 text-slate-300' };
  })();

  return (
    <div className="border-b border-border bg-[#0f1117]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            Open project
          </button>

          {recent.length > 0 && (
            <select
              className="max-w-[200px] rounded-md border border-border bg-panel px-2 py-1.5 text-sm text-slate-300"
              value={project?.id ?? ''}
              onChange={(e) => {
                if (e.target.value) onSwitch(e.target.value);
              }}
            >
              <option value="" disabled>
                Recent projects
              </option>
              {recent.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {project ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{project.name}</p>
              <p className="truncate text-xs text-slate-500">{project.path}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Open a Cursor project folder to begin monitoring</p>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${hookBadge.className}`}>
            {hookBadge.label}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-danger'}`}
            />
            <span className="text-slate-400">{connected ? 'Live' : 'Reconnecting…'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
