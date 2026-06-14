import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { formatTime } from '../useMetrics.js';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa'];

const DensityContext = createContext(false);
const ExpandedContext = createContext(false);

export function DensityProvider({ dense, children }) {
  return <DensityContext.Provider value={dense}>{children}</DensityContext.Provider>;
}

export function ExpandedProvider({ expanded, children }) {
  return <ExpandedContext.Provider value={expanded}>{children}</ExpandedContext.Provider>;
}

function useDensity() {
  return useContext(DensityContext);
}

function useExpanded() {
  return useContext(ExpandedContext);
}

function useLayoutMode() {
  const dense = useDensity();
  const expanded = useExpanded();
  if (expanded) return 'expanded';
  if (dense) return 'dense';
  return 'normal';
}

function chartTick(dense) {
  return { fill: '#94a3b8', fontSize: dense ? 8 : 10 };
}

export function DensityToggle({ checked, onChange, className = '' }) {
  return (
    <label className={`flex cursor-pointer select-none items-center gap-2 text-sm text-slate-400 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded-md border-border bg-panel text-accent focus:ring-accent/50"
      />
      High density
    </label>
  );
}

function ChartArea({ children, className = '' }) {
  const mode = useLayoutMode();
  const height =
    mode === 'expanded' ? 'h-[calc(100vh-14rem)]' : mode === 'dense' ? 'h-[110px]' : 'h-[220px]';
  return (
    <div className={`${height} flex-1 ${className}`}>
      <ResponsiveContainer width="100%" height="100%" key={mode}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function NoData({ className = '' }) {
  const mode = useLayoutMode();
  const minHeight =
    mode === 'expanded' ? 'min-h-[calc(100vh-14rem)]' : mode === 'dense' ? 'min-h-[110px]' : 'min-h-[220px]';
  return (
    <div className={`flex flex-1 items-center justify-center ${minHeight} ${className}`}>
      <p
        className={`text-slate-500 ${
          mode === 'expanded' ? 'text-base' : mode === 'dense' ? 'text-xs' : 'text-sm'
        }`}
      >
        No Data
      </p>
    </div>
  );
}

function panelStorageKey(title) {
  return `panel-expanded:${title}`;
}

function readExpanded(title, defaultExpanded) {
  try {
    const stored = localStorage.getItem(panelStorageKey(title));
    if (stored !== null) return stored === 'true';
  } catch {
    // Ignore storage errors (private mode, etc.)
  }
  return defaultExpanded;
}

function MetricTooltip({ text }) {
  const dense = useDensity();
  const tooltipId = useId();

  return (
    <span
      className="group/info relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-describedby={tooltipId}
        className={`rounded-full text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          dense ? 'p-0.5' : 'p-1'
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={dense ? 'h-3 w-3' : 'h-3.5 w-3.5'}
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`pointer-events-none absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-[#12141a] px-3 py-2 text-left font-normal normal-case tracking-normal text-slate-300 opacity-0 shadow-xl shadow-black/40 transition-opacity group-hover/info:opacity-100 group-focus-within/info:opacity-100 ${
          dense ? 'text-[10px] leading-snug' : 'text-xs leading-relaxed'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

function ExpandIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M3.75 3.75a.75.75 0 011.06 0L8.25 7.19V5.5a.75.75 0 011.5 0v3.75a.75.75 0 01-.75.75H5.25a.75.75 0 010-1.5h1.69L3.75 4.81a.75.75 0 010-1.06zM11.75 5.5a.75.75 0 011.5 0v3.75a.75.75 0 01-.75.75H9.31l3.44 3.44a.75.75 0 11-1.06 1.06L8.25 10.31v1.69a.75.75 0 01-1.5 0V8.25a.75.75 0 01.75-.75h3.75zM16.25 11.75a.75.75 0 00-1.06 0l-3.44 3.44v-1.69a.75.75 0 00-1.5 0v3.75a.75.75 0 00.75.75h3.75a.75.75 0 000-1.5h-1.69l3.44-3.44a.75.75 0 000-1.06zM5.5 11.75a.75.75 0 00-.75.75v3.75a.75.75 0 00.75.75h3.75a.75.75 0 000-1.5H7.19l3.44-3.44a.75.75 0 00-1.06-1.06L5.5 14.69v-1.69a.75.75 0 00-.75-.75z" />
    </svg>
  );
}

export function Panel({
  title,
  subtitle,
  tooltip,
  children,
  className = '',
  collapsible = false,
  defaultExpanded = true,
  dragHandleProps = null,
  onExpand = null,
}) {
  const dense = useDensity();
  const contentId = useId();
  const [expanded, setExpanded] = useState(() =>
    collapsible ? readExpanded(title, defaultExpanded) : true,
  );

  const toggle = () => {
    if (!collapsible) return;
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(panelStorageKey(title), String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  return (
    <section
      className={`group/panel flex h-full flex-col overflow-visible rounded-xl border border-border bg-surface shadow-lg shadow-black/20 ${
        dense ? 'p-1.5' : 'p-3'
      } ${className}`}
    >
      <header className={`shrink-0 ${expanded ? (dense ? 'mb-1' : 'mb-2') : ''}`}>
        <div className="flex items-start gap-1">
          {dragHandleProps && (
            <button
              type="button"
              aria-label="Drag to reorder"
              className="mt-0.5 shrink-0 cursor-grab touch-none p-0.5 text-slate-600 opacity-0 transition-opacity hover:text-slate-400 group-hover/panel:opacity-100 active:cursor-grabbing"
              {...dragHandleProps}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <circle cx="5" cy="4" r="1.25" />
                <circle cx="11" cy="4" r="1.25" />
                <circle cx="5" cy="8" r="1.25" />
                <circle cx="11" cy="8" r="1.25" />
                <circle cx="5" cy="12" r="1.25" />
                <circle cx="11" cy="12" r="1.25" />
              </svg>
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-start gap-1">
            {collapsible ? (
              <button
                type="button"
                onClick={toggle}
                aria-expanded={expanded}
                aria-controls={contentId}
                className="group flex min-w-0 flex-1 items-start gap-2 text-left"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-slate-300 ${
                    expanded ? 'rotate-90' : ''
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="min-w-0 flex-1">
                  <h2
                    className={`font-semibold tracking-wide text-slate-100 group-hover:text-white ${
                      dense ? 'text-xs leading-tight' : 'text-sm'
                    }`}
                  >
                    {title}
                  </h2>
                  {subtitle && !dense && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
                </span>
              </button>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <span className="min-w-0 flex-1">
                  <h2
                    className={`font-semibold tracking-wide text-slate-100 ${
                      dense ? 'text-xs leading-tight' : 'text-sm'
                    }`}
                  >
                    {title}
                  </h2>
                  {subtitle && !dense && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
                </span>
              </div>
            )}
            {tooltip && <MetricTooltip text={tooltip} />}
            {onExpand && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand();
                }}
                aria-label={`Expand ${title}`}
                className={`shrink-0 rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                  dense ? 'p-0.5' : 'p-1'
                }`}
              >
                <ExpandIcon className={dense ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
              </button>
            )}
          </div>
        </div>
      </header>
      <div
        id={contentId}
        hidden={!expanded}
        className={expanded ? 'flex min-h-0 flex-1 flex-col' : undefined}
      >
        {children}
      </div>
    </section>
  );
}

export function AgentStateBarChart({ data }) {
  const dense = useDensity();
  if (!data.length || !data.some((d) => d.value > 0)) {
    return <NoData />;
  }
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <BarChart data={data} layout="vertical" margin={{ left: dense ? 4 : 8, right: dense ? 8 : 12 }}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={tick} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={dense ? 88 : 112}
          tick={tick}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1d27',
            border: '1px solid #2a2f3d',
            borderRadius: 8,
            color: '#f1f5f9',
          }}
          labelStyle={{ color: '#f1f5f9' }}
          itemStyle={{ color: '#e2e8f0' }}
          formatter={(value, name, props) => [`${value} (${props.payload.percent}%)`, name]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartArea>
  );
}

export function SecurityGauge({ rate, blocked, allowed }) {
  const mode = useLayoutMode();
  if (blocked + allowed === 0) {
    return <NoData />;
  }
  const clamped = Math.min(rate, 100);
  const hue = clamped < 5 ? 142 : clamped < 15 ? 45 : 0;
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center ${
        mode === 'expanded'
          ? 'min-h-[calc(100vh-14rem)] py-8'
          : mode === 'dense'
            ? 'min-h-[110px] py-1'
            : 'min-h-[220px] py-4'
      }`}
    >
      <div
        className={`relative flex items-end justify-center rounded-full border-border ${
          mode === 'expanded'
            ? 'h-56 w-56 border-[10px]'
            : mode === 'dense'
              ? 'h-20 w-20 border-4'
              : 'h-36 w-36 border-8'
        }`}
        style={{
          background: `conic-gradient(hsl(${hue} 70% 45%) ${clamped * 3.6}deg, #2a2f3d 0)`,
        }}
      >
        <div
          className={`absolute flex flex-col items-center justify-center rounded-full bg-surface ${
            mode === 'expanded' ? 'inset-5' : mode === 'dense' ? 'inset-1.5' : 'inset-3'
          }`}
        >
          <span
            className={`font-bold tabular-nums ${
              mode === 'expanded' ? 'text-5xl' : mode === 'dense' ? 'text-lg' : 'text-3xl'
            }`}
          >
            {rate}%
          </span>
          {mode !== 'dense' && (
            <span className={`text-slate-500 ${mode === 'expanded' ? 'text-sm' : 'text-xs'}`}>blocked</span>
          )}
        </div>
      </div>
      <div
        className={`flex ${
          mode === 'expanded' ? 'mt-6 gap-8 text-sm' : mode === 'dense' ? 'mt-1 gap-3 text-xs' : 'mt-4 gap-6 text-xs'
        }`}
      >
        <span className="text-success">● {allowed} allowed</span>
        <span className="text-danger">● {blocked} blocked</span>
      </div>
    </div>
  );
}

function formatTrendWindowLabel(windowMinutes = 0.5) {
  const value = Number(windowMinutes);
  if (!Number.isFinite(value) || value <= 0) return 'last 0.5 min';
  return `last ${value} min`;
}

function TrendArrow({ direction, positive = 'up', mode = 'normal' }) {
  const size =
    mode === 'expanded' ? 'text-6xl' : mode === 'dense' ? 'text-xl' : 'text-4xl';
  if (direction === 'flat') {
    return <span className={`${size} leading-none text-slate-500`}>→</span>;
  }

  const isPositive = direction === positive;
  const color = isPositive ? 'text-success' : 'text-danger';
  const arrow = direction === 'up' ? '↑' : '↓';

  return <span className={`${size} leading-none ${color}`}>{arrow}</span>;
}

function TrendStat({ value, unit, direction, positive = 'up', footer }) {
  const mode = useLayoutMode();
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center ${
        mode === 'expanded'
          ? 'min-h-[calc(100vh-14rem)] gap-4 py-8'
          : mode === 'dense'
            ? 'min-h-[110px] gap-0.5 py-1'
            : 'min-h-[220px] gap-2 py-4'
      }`}
    >
      <div className={`flex items-center ${mode === 'expanded' ? 'gap-6' : mode === 'dense' ? 'gap-2' : 'gap-4'}`}>
        <span
          className={`font-bold tabular-nums text-slate-100 ${
            mode === 'expanded' ? 'text-7xl' : mode === 'dense' ? 'text-2xl' : 'text-5xl'
          }`}
        >
          {value}
        </span>
        <TrendArrow direction={direction} positive={positive} mode={mode} />
      </div>
      {unit && (
        <span
          className={`text-slate-500 ${
            mode === 'expanded' ? 'text-lg' : mode === 'dense' ? 'text-[10px]' : 'text-sm'
          }`}
        >
          {unit}
        </span>
      )}
      {footer && (
        <div
          className={`flex flex-wrap justify-center ${
            mode === 'expanded' ? 'mt-4 gap-6 text-base' : mode === 'dense' ? 'mt-1 gap-2 text-xs' : 'mt-3 gap-4 text-xs'
          }`}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function ShellOutcomeGauge({ success, failure, rate, direction, windowMinutes = 0.5 }) {
  if (success + failure === 0) {
    return <NoData />;
  }
  return (
    <TrendStat
      value={`${rate}%`}
      unit={`success rate (${formatTrendWindowLabel(windowMinutes)})`}
      direction={direction}
      positive="up"
      footer={
        <>
          <span className="text-success">● {success} passed</span>
          <span className="text-danger">● {failure} failed</span>
        </>
      }
    />
  );
}

export function ThinkTimeGauge({ avgSec, count, direction, windowMinutes = 0.5 }) {
  if (count === 0) {
    return <NoData />;
  }
  return (
    <TrendStat
      value={avgSec}
      unit={`avg seconds (${formatTrendWindowLabel(windowMinutes)})`}
      direction={direction}
      positive="down"
      footer={<span className="text-slate-400">● {count} reasoning cycles</span>}
    />
  );
}

export function CodeChurnGauge({ added, removed, net, direction, total, windowMinutes = 0.5 }) {
  if ((total ?? added + removed) === 0) {
    return <NoData />;
  }
  return (
    <TrendStat
      value={net >= 0 ? `+${net}` : net}
      unit={`net lines (${formatTrendWindowLabel(windowMinutes)})`}
      direction={direction}
      positive="up"
      footer={
        <>
          <span className="text-success">● {added} added</span>
          <span className="text-danger">● {removed} removed</span>
        </>
      }
    />
  );
}

export function ThinkTimeLine({ data }) {
  const dense = useDensity();
  if (!data.length || !data.some((d) => d.count > 0)) {
    return <NoData />;
  }
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={tick} />
        <YAxis tick={tick} unit="s" width={dense ? 28 : undefined} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="avgThinkSec" stroke="#6366f1" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: '#6366f1' } : false} />
      </LineChart>
    </ChartArea>
  );
}

export function ShellOutcomeArea({ data }) {
  const dense = useDensity();
  if (!data.length || !data.some((d) => d.success + d.failure > 0)) {
    return <NoData />;
  }
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <AreaChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={tick} />
        <YAxis tick={tick} allowDecimals={false} width={dense ? 28 : undefined} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Area type="monotone" dataKey="success" stackId="1" stroke="#22c55e" fill="#22c55e55" />
        <Area type="monotone" dataKey="failure" stackId="1" stroke="#ef4444" fill="#ef444455" />
      </AreaChart>
    </ChartArea>
  );
}

export function BlastRadiusTreemap({ data }) {
  const mode = useLayoutMode();
  if (!data.length) {
    return <NoData />;
  }
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
        mode === 'expanded'
          ? 'min-h-[calc(100vh-14rem)]'
          : mode === 'dense'
            ? 'min-h-[110px] max-h-[140px]'
            : 'min-h-[220px]'
      }`}
    >
      <div
        className={`flex w-full flex-col ${
          mode === 'expanded' ? 'gap-3' : mode === 'dense' ? 'gap-1' : 'gap-2'
        }`}
      >
        {data.map((item) => {
          const intensity = 0.25 + (item.value / max) * 0.75;
          return (
            <div
              key={item.name}
              className={`flex w-full items-center justify-between rounded-lg border border-border transition hover:border-accent/50 ${
                mode === 'expanded'
                  ? 'px-4 py-3.5'
                  : mode === 'dense'
                    ? 'px-2 py-1.5'
                    : 'px-3 py-2.5'
              }`}
              style={{ background: `rgba(99, 102, 241, ${intensity * 0.35})` }}
            >
              <p
                className={`min-w-0 flex-1 truncate font-mono text-slate-300 ${
                  mode === 'expanded' ? 'text-sm' : mode === 'dense' ? 'text-[10px]' : 'text-xs'
                }`}
                title={item.name}
              >
                {item.name}
              </p>
              <div className={`shrink-0 text-right ${mode === 'expanded' ? 'ml-4' : mode === 'dense' ? 'ml-2' : 'ml-3'}`}>
                <p
                  className={`font-semibold tabular-nums ${
                    mode === 'expanded' ? 'text-2xl' : mode === 'dense' ? 'text-sm' : 'text-lg'
                  }`}
                >
                  {item.value}
                </p>
                {mode !== 'dense' && (
                  <p className={`text-slate-500 ${mode === 'expanded' ? 'text-xs' : 'text-[10px]'}`}>edits</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function McpBarChart({ data }) {
  const dense = useDensity();
  if (!data.length) {
    return <NoData />;
  }
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <BarChart data={data} layout="vertical" margin={{ left: dense ? 8 : 20 }}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={tick} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={dense ? 56 : 80}
          tick={tick}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartArea>
  );
}

const EVENT_TYPE_STYLES = {
  sessionStart: { symbol: '▶', color: 'text-sky-400', label: 'session-start' },
  stop: { symbol: '■', color: 'text-slate-400', label: 'stop' },
  afterAgentThought: { symbol: '◉', color: 'text-violet-400', label: 'thought' },
  afterFileEdit: { symbol: '✎', color: 'text-emerald-400', label: 'file-edit' },
  afterTabFileEdit: { symbol: '✎', color: 'text-emerald-400', label: 'tab-edit' },
  beforeShellExecution: { symbol: '$', color: 'text-amber-400', label: 'shell-before' },
  afterShellExecution: { symbol: '$', color: 'text-amber-300', label: 'shell-after' },
  beforeMCPExecution: { symbol: '⊞', color: 'text-cyan-400', label: 'mcp-before' },
  afterMCPExecution: { symbol: '⊞', color: 'text-cyan-300', label: 'mcp-after' },
  postToolUse: { symbol: '⚙', color: 'text-pink-400', label: 'tool-use' },
};

const DEFAULT_EVENT_STYLE = { symbol: '·', color: 'text-slate-400', label: 'unknown' };

function getEventStyle(hookEvent) {
  return EVENT_TYPE_STYLES[hookEvent] ?? DEFAULT_EVENT_STYLE;
}

function abbreviateModel(model) {
  return model
    .replace(/^claude-/, 'cl-')
    .replace(/^gpt-/, 'gpt-')
    .replace(/^gemini-/, 'gem-')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-latest$/, '');
}

export function Events({ events = [] }) {
  const mode = useLayoutMode();
  const dense = mode === 'dense';
  const expanded = mode === 'expanded';
  const listRef = useRef(null);
  const padding = expanded ? 'px-6 py-5' : dense ? 'px-2 py-2' : 'px-3 py-3';
  const textSize = expanded ? 'text-sm' : dense ? 'text-[10px]' : 'text-xs';
  const height = expanded ? 'h-80' : dense ? 'h-36' : 'h-48';

  const lastId = events[events.length - 1]?.id;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  if (!events.length) {
    return (
      <div className={`rounded-lg border border-border bg-panel ${padding} ${height} flex items-center`}>
        <p className={`${textSize} text-slate-500`}>No hook events in the last hour</p>
      </div>
    );
  }

  const typeColCh = expanded ? '26ch' : dense ? '20ch' : '24ch';
  const modelColCh = expanded ? '30ch' : dense ? '22ch' : '26ch';
  const gridCols = `8ch 2ch ${typeColCh} 5ch ${modelColCh} 1fr`;

  return (
    <div ref={listRef} className={`rounded-lg border border-border bg-panel ${padding} ${height} overflow-y-auto`}>
      {events.map((event) => {
        const style = getEventStyle(event.hook_event);
        const time = event.time ?? '';
        const detail = event.detail ?? event.text ?? '';
        const model = event.model ? abbreviateModel(event.model) : '';
        return (
          <div
            key={event.id}
            className={`grid gap-x-3 font-mono ${textSize} leading-relaxed`}
            style={{ gridTemplateColumns: gridCols }}
          >
            <span className="text-slate-600 tabular-nums">{time}</span>
            <span className={style.color}>{style.symbol}</span>
            <span className={`${style.color} opacity-75 truncate`}>{event.hook_event}</span>
            <span className="text-red-400 font-semibold">
              {event.verdict ? 'DENY' : ''}
            </span>
            <span className="text-slate-500 truncate">{model}</span>
            <span className="text-slate-400 truncate min-w-0">{detail}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CodeChurnLine({ data }) {
  const dense = useDensity();
  if (!data.length || !data.some((d) => d.added + d.removed > 0)) {
    return <NoData />;
  }
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={tick} />
        <YAxis tick={tick} width={dense ? 28 : undefined} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="added" stroke="#22c55e" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: '#22c55e' } : false} name="Added" />
        <Line type="monotone" dataKey="removed" stroke="#ef4444" strokeWidth={2} dot={chartData.length === 1 ? { r: 3, fill: '#ef4444' } : false} name="Removed" />
        <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={chartData.length === 1 ? { r: 3, fill: '#6366f1' } : false} name="Net" />
      </LineChart>
    </ChartArea>
  );
}

export function SessionScatter({ data }) {
  const dense = useDensity();
  if (!data.length) {
    return <NoData />;
  }
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <ScatterChart>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="timestamp"
          domain={['dataMin', 'dataMax']}
          name="Time"
          tick={tick}
          tickFormatter={formatTime}
        />
        <YAxis
          type="number"
          dataKey="durationMin"
          name="Duration"
          unit=" min"
          tick={tick}
          width={dense ? 32 : undefined}
        />
        <ZAxis range={dense ? [30, 100] : [60, 200]} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
          formatter={(val, name) => [name === 'Duration' ? `${val} min` : formatTime(val), name]}
        />
        <Scatter data={data} fill="#a78bfa" />
      </ScatterChart>
    </ChartArea>
  );
}

export function HumanInterventions({ data }) {
  const mode = useLayoutMode();
  if (data.total === 0) {
    return <NoData />;
  }
  const spark = data.sparkline.map((d) => ({ ...d, label: formatTime(d.time) }));
  const sparkHeight = mode === 'expanded' ? 200 : mode === 'dense' ? 48 : 80;
  return (
    <div
      className={`flex flex-1 flex-col ${
        mode === 'expanded' ? 'min-h-[calc(100vh-14rem)]' : mode === 'dense' ? 'min-h-[110px]' : 'min-h-[220px]'
      }`}
    >
      <div className={`flex shrink-0 items-baseline gap-2 ${mode === 'expanded' ? 'mb-6' : mode === 'dense' ? 'mb-1' : 'mb-3'}`}>
        <span
          className={`font-bold tabular-nums text-warn ${
            mode === 'expanded' ? 'text-6xl' : mode === 'dense' ? 'text-xl' : 'text-4xl'
          }`}
        >
          {data.total}
        </span>
        <span
          className={`text-slate-500 ${
            mode === 'expanded' ? 'text-lg' : mode === 'dense' ? 'text-[10px]' : 'text-sm'
          }`}
        >
          manual approvals (1h)
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height={sparkHeight}>
          <BarChart data={spark}>
            <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.recent.length > 0 && mode !== 'dense' && (
        <ul
          className={`mt-2 shrink-0 space-y-1 overflow-hidden text-slate-400 ${
            mode === 'expanded' ? 'max-h-48 text-sm' : 'max-h-16 text-xs'
          }`}
        >
          {data.recent.map((r, i) => (
            <li key={i} className="truncate">
              {formatTime(r.time)} · {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
