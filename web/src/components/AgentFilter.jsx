const AGENT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'claude', label: 'Claude Code' },
];

/**
 * Segmented control to filter dashboard metrics by source agent.
 * value is one of 'all' | 'cursor' | 'claude'.
 */
export function AgentFilter({ value, onChange, className = '' }) {
  return (
    <div
      role="group"
      aria-label="Filter by agent"
      className={`inline-flex items-center rounded-lg border border-overlay/10 bg-overlay/5 p-0.5 text-xs ${className}`}
    >
      {AGENT_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              active ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
