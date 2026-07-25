import { useEffect, useRef, useState } from 'react';
import { AgentFilter } from './AgentFilter.jsx';

function MenuModal({ onSettings, onOpenProject, onClose }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const action = (fn) => () => { fn(); onClose(); };

  const menuItems = [
    {
      label: 'Settings',
      onClick: action(onSettings),
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path fillRule="evenodd" d="M8.34 1.804A1 1 0 019.32 1h1.36a1 1 0 01.98.804l.295 1.473c.497.144.97.337 1.412.575l1.35-1.35a1 1 0 011.414 0l.964.964a1 1 0 010 1.414l-1.35 1.35c.238.442.431.915.575 1.412l1.473.296a1 1 0 01.804.98v1.361a1 1 0 01-.804.98l-1.473.296a6.067 6.067 0 01-.575 1.412l1.35 1.35a1 1 0 010 1.414l-.964.964a1 1 0 01-1.414 0l-1.35-1.35a6.052 6.052 0 01-1.412.575l-.296 1.473a1 1 0 01-.98.804H9.32a1 1 0 01-.98-.804l-.296-1.473a6.067 6.067 0 01-1.412-.575l-1.35 1.35a1 1 0 01-1.414 0l-.964-.964a1 1 0 010-1.414l1.35-1.35a6.052 6.052 0 01-.575-1.412L1.804 10.68a1 1 0 01-.804-.98V8.34a1 1 0 01.804-.98l1.473-.296c.144-.497.337-.97.575-1.412l-1.35-1.35a1 1 0 010-1.414l.964-.964a1 1 0 011.414 0l1.35 1.35c.442-.238.915-.431 1.412-.575l.296-1.473zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      ),
    },
    {
      label: 'Open project',
      onClick: action(onOpenProject),
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
      ),
    },
    {
      label: 'Exit to desktop',
      onClick: action(() => window.dashboard?.quit()),
      icon: (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
          <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
          <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.048a.75.75 0 10-1.06-1.06l-2.25 2.25a.75.75 0 000 1.06l2.25 2.25a.75.75 0 101.06-1.06L8.704 10.75H18.25A.75.75 0 0019 10z" clipRule="evenodd" />
        </svg>
      ),
      danger: true,
    },
  ];

  return (
    <div
      ref={overlayRef}
      className="window-no-drag fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm pt-14 pr-6"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ul className="py-1.5">
          {menuItems.map(({ label, onClick, icon, danger }) => (
            <li key={label}>
              <button
                type="button"
                onClick={onClick}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition hover:bg-overlay/5 ${
                  danger ? 'text-danger/80 hover:text-danger' : 'text-fg-soft hover:text-fg'
                }`}
              >
                {icon}
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const AGENT_LABELS = { cursor: 'Cursor', claude: 'Claude Code' };

export function ProjectBar({ project, onOpen, connected, onSettingsOpen, isFullscreen, onToggleFullscreen, agentFilter, onAgentFilterChange }) {
  const [hookStatus, setHookStatus] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isElectron = typeof window.dashboard !== 'undefined';
  const isMac = navigator.platform.startsWith('Mac');

  useEffect(() => {
    if (!isElectron || !project?.path) {
      setHookStatus(null);
      return;
    }
    window.dashboard.getHookStatus(project.path).then(setHookStatus);
  }, [isElectron, project?.path]);

  // The agent slider ('all' | 'cursor' | 'claude') drives which hooks the
  // single install button targets. 'all' installs both.
  const targetAgents = (agentFilter ?? 'all') === 'all' ? ['cursor', 'claude'] : [agentFilter];
  const targetLabel = (agentFilter ?? 'all') === 'all' ? 'all hooks' : AGENT_LABELS[agentFilter];

  const targetStatus = (() => {
    if (!hookStatus) return null;
    const statuses = targetAgents.map((a) => hookStatus[a] ?? 'missing');
    if (statuses.every((s) => s === 'active')) return 'active';
    if (statuses.every((s) => s === 'missing')) return 'missing';
    return 'partial';
  })();

  const handleInstall = async () => {
    if (!project?.path || installing) return;
    setInstalling(true);
    try {
      for (const agent of targetAgents) {
        const result = await window.dashboard.setupHooks(project.path, agent);
        if (result?.status) setHookStatus(result.status);
      }
      const updated = await window.dashboard.getHookStatus(project.path);
      setHookStatus(updated);
    } finally {
      setInstalling(false);
    }
  };

  if (!isElectron) return null;

  const styleForStatus = (status) =>
    status === 'active'
      ? 'bg-success/20 text-success'
      : status === 'partial'
        ? 'bg-warn/20 text-warn'
        : 'bg-danger/20 text-danger';
  const labelForStatus = (status) =>
    status === 'active' ? 'active' : status === 'partial' ? 'partial' : 'missing';

  return (
    <>
      <div className={`window-drag border-b border-border bg-panel ${isElectron && isMac ? 'pt-7' : ''}`}>
        <div className="relative mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-6 pt-3 pb-5">

          {/* Left: app title */}
          <div className="shrink-0">
            <h1 className="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              catadio
            </h1>
          </div>

          {/* Center: agent slider */}
          {onAgentFilterChange && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <AgentFilter
                value={agentFilter ?? 'all'}
                onChange={onAgentFilterChange}
                className="window-no-drag pointer-events-auto"
              />
            </div>
          )}

          {/* Right: controls */}
          <div className="window-no-drag flex shrink-0 items-center gap-3 text-sm">
            {project && (
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    hookStatus ? styleForStatus(targetStatus) : 'bg-border/50 text-fg-soft'
                  }`}
                  title={`${targetLabel} ${hookStatus ? labelForStatus(targetStatus) : 'checking'}`}
                >
                  {targetLabel} {hookStatus ? labelForStatus(targetStatus) : '…'}
                </span>
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  title={`${targetStatus === 'active' ? 'Reinstall' : 'Install'} ${targetLabel}`}
                  className="rounded-md bg-accent/20 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {installing ? '…' : `${targetStatus === 'active' ? 'Reinstall' : 'Install'} ${targetLabel}`}
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-danger'}`}
              />
              <span className="text-fg-soft">{connected ? 'Live' : 'Reconnecting…'}</span>
            </div>

            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-overlay/10 bg-overlay/5 text-fg-muted transition hover:border-overlay/20 hover:bg-overlay/10 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {isFullscreen ? (
                /* Compress / exit-fullscreen icon */
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M3.28 2.22a.75.75 0 00-1.06 1.06L5.44 6.5H3.75a.75.75 0 000 1.5h3.5A.75.75 0 008 7.25v-3.5a.75.75 0 00-1.5 0v1.69L3.28 2.22zM12 7.25v-3.5a.75.75 0 011.5 0V5.44l3.22-3.22a.75.75 0 111.06 1.06L14.56 6.5h1.69a.75.75 0 010 1.5h-3.5A.75.75 0 0112 7.25zM7.25 12H3.75a.75.75 0 000 1.5h1.69l-3.22 3.22a.75.75 0 101.06 1.06L6.5 14.56v1.69a.75.75 0 001.5 0v-3.5A.75.75 0 007.25 12zM12.75 12a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0V14.56l3.22 3.22a.75.75 0 101.06-1.06L14.56 13.5h1.69a.75.75 0 000-1.5h-3.5z" />
                </svg>
              ) : (
                /* Expand / enter-fullscreen icon */
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path d="M3.75 3A.75.75 0 003 3.75v3.5a.75.75 0 001.5 0V5.56l3.22 3.22a.75.75 0 001.06-1.06L5.56 4.5h1.69a.75.75 0 000-1.5h-3.5zM13.5 4.5h1.69l-3.22 3.22a.75.75 0 001.06 1.06L16.25 5.56v1.69a.75.75 0 001.5 0v-3.5A.75.75 0 0017 3h-3.5a.75.75 0 000 1.5zM3 13.75a.75.75 0 01.75-.75h3.5a.75.75 0 010 1.5H5.56l3.22 3.22a.75.75 0 11-1.06 1.06L4.5 16.44v1.69a.75.75 0 01-1.5 0v-3.5zM13.28 13.22a.75.75 0 011.06 0l3.22 3.22v-1.69a.75.75 0 011.5 0v3.5a.75.75 0 01-.75.75h-3.5a.75.75 0 010-1.5h1.69l-3.22-3.22a.75.75 0 010-1.06z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-overlay/10 bg-overlay/5 text-fg-muted transition hover:border-overlay/20 hover:bg-overlay/10 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <MenuModal
          onSettings={onSettingsOpen}
          onOpenProject={onOpen}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
