import { useEffect, useRef, useState } from 'react';

import { DensityToggle } from './Charts.jsx';

function ProjectPickerModal({ project, recent, onOpen, onSwitch, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSwitch = (id) => {
    onSwitch(id);
    onClose();
  };

  const handleOpen = () => {
    onOpen();
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-start bg-black/60 backdrop-blur-sm pt-14 pl-6"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch project"
        className="flex w-80 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Current project */}
        {project && (
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Current project</p>
            <p className="mt-1 truncate text-sm font-medium text-white">{project.name}</p>
            <p className="truncate text-xs text-slate-500">{project.path}</p>
          </div>
        )}

        {/* Recent projects */}
        {recent.length > 0 && (
          <div className="flex flex-col">
            <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
              Recent projects
            </p>
            <ul className="max-h-60 overflow-y-auto">
              {recent.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(p.id)}
                    className={`flex w-full flex-col items-start px-4 py-2.5 text-left transition hover:bg-white/5 ${
                      p.id === project?.id ? 'opacity-40 pointer-events-none' : ''
                    }`}
                  >
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <span className="truncate text-xs text-slate-500">{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Open new */}
        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={handleOpen}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-accent transition hover:bg-accent/10"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9v4m-2-2h4" fill="none" />
            </svg>
            Open project folder…
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectBar({ project, onOpen, onSwitch, connected, highDensity, onHighDensityChange, onSettingsOpen }) {
  const [recent, setRecent] = useState([]);
  const [hookStatus, setHookStatus] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isElectron = typeof window.dashboard !== 'undefined';
  const isMac = navigator.platform.startsWith('Mac');

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

  const handleInstallHooks = async () => {
    if (!project?.path || installing) return;
    setInstalling(true);
    try {
      const result = await window.dashboard.setupHooks(project.path);
      if (result?.status) {
        setHookStatus(result.status);
      } else {
        const updated = await window.dashboard.getHookStatus(project.path);
        setHookStatus(updated);
      }
    } finally {
      setInstalling(false);
    }
  };

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
    <>
      <div className={`border-b border-border bg-[#0f1117] ${isElectron && isMac ? 'pt-7' : ''}`}>
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-3">

          {/* Left: project picker trigger */}
          <div className="flex min-w-0 flex-1 items-center">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
              className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
            >
              {project ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white group-hover:text-slate-200">
                    {project.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{project.path}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 group-hover:text-slate-300">
                  Select a project…
                </p>
              )}
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="ml-1 h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-400"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-3 text-sm">
            <DensityToggle checked={highDensity} onChange={onHighDensityChange} />
            {project && (
              <button
                type="button"
                onClick={handleInstallHooks}
                disabled={installing}
                className="rounded-md bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {installing ? 'Installing…' : hookStatus?.status === 'active' ? 'Reinstall hooks' : 'Install hooks'}
              </button>
            )}
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${hookBadge.className}`}>
              {hookBadge.label}
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-danger'}`}
              />
              <span className="text-slate-400">{connected ? 'Live' : 'Reconnecting…'}</span>
            </div>

            <button
              type="button"
              onClick={onSettingsOpen}
              aria-label="Open settings"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-accent/30 bg-accent/15 text-accent transition hover:border-accent/50 hover:bg-accent/25 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.97.337 1.412.575l1.35-1.35a1 1 0 011.414 0l.964.964a1 1 0 010 1.414l-1.35 1.35c.238.442.431.915.575 1.412l1.473.296a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.296a6.067 6.067 0 01-.575 1.412l1.35 1.35a1 1 0 010 1.414l-.964.964a1 1 0 01-1.414 0l-1.35-1.35a6.052 6.052 0 01-1.412.575l-.296 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.296-1.473a6.067 6.067 0 01-1.412-.575l-1.35 1.35a1 1 0 01-1.414 0l-.964-.964a1 1 0 010-1.414l1.35-1.35a6.052 6.052 0 01-.575-1.412L1.804 10.68a1 1 0 01-.804-.98V8.34a1 1 0 01.804-.98l1.473-.296c.144-.497.337-.97.575-1.412l-1.35-1.35a1 1 0 010-1.414l.964-.964a1 1 0 011.414 0l1.35 1.35c.442-.238.915-.431 1.412-.575l.296-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <ProjectPickerModal
          project={project}
          recent={recent}
          onOpen={onOpen}
          onSwitch={onSwitch}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
