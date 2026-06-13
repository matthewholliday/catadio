import { createContext, useContext, useId, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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

export function DensityProvider({ dense, children }) {
  return <DensityContext.Provider value={dense}>{children}</DensityContext.Provider>;
}

function useDensity() {
  return useContext(DensityContext);
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
        className="h-3.5 w-3.5 rounded border-border bg-panel text-accent focus:ring-accent/50"
      />
      High density
    </label>
  );
}

function ChartArea({ children, className = '' }) {
  const dense = useDensity();
  return (
    <div className={`${dense ? 'h-[110px]' : 'h-[220px]'} flex-1 ${className}`}>
      <ResponsiveContainer width="100%" height="100%" key={dense ? 'dense' : 'normal'}>
        {children}
      </ResponsiveContainer>
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

export function Panel({ title, subtitle, children, className = '', defaultExpanded = true, dragHandleProps = null }) {
  const dense = useDensity();
  const contentId = useId();
  const [expanded, setExpanded] = useState(() => readExpanded(title, defaultExpanded));

  const toggle = () => {
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
      className={`group/panel flex h-full flex-col rounded-xl border border-border bg-surface shadow-lg shadow-black/20 ${
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

export function AgentStateDonut({ data }) {
  const dense = useDensity();
  const chartData = data.length ? data : [{ name: 'Waiting', value: 1, percent: 100 }];
  return (
    <ChartArea>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={dense ? 32 : 55}
          outerRadius={dense ? 52 : 85}
          paddingAngle={dense ? 2 : 3}
        >
          {chartData.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
          ))}
        </Pie>
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
      </PieChart>
    </ChartArea>
  );
}

export function SecurityGauge({ rate, blocked, allowed }) {
  const dense = useDensity();
  const clamped = Math.min(rate, 100);
  const hue = clamped < 5 ? 142 : clamped < 15 ? 45 : 0;
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center ${
        dense ? 'min-h-[110px] py-1' : 'min-h-[220px] py-4'
      }`}
    >
      <div
        className={`relative flex items-end justify-center rounded-full border-border ${
          dense ? 'h-20 w-20 border-4' : 'h-36 w-36 border-8'
        }`}
        style={{
          background: `conic-gradient(hsl(${hue} 70% 45%) ${clamped * 3.6}deg, #2a2f3d 0)`,
        }}
      >
        <div
          className={`absolute flex flex-col items-center justify-center rounded-full bg-surface ${
            dense ? 'inset-1.5' : 'inset-3'
          }`}
        >
          <span className={`font-bold tabular-nums ${dense ? 'text-lg' : 'text-3xl'}`}>{rate}%</span>
          {!dense && <span className="text-xs text-slate-500">blocked</span>}
        </div>
      </div>
      <div className={`flex text-xs ${dense ? 'mt-1 gap-3' : 'mt-4 gap-6'}`}>
        <span className="text-success">● {allowed} allowed</span>
        <span className="text-danger">● {blocked} blocked</span>
      </div>
    </div>
  );
}

function TrendArrow({ direction, positive = 'up', dense = false }) {
  const size = dense ? 'text-xl' : 'text-4xl';
  if (direction === 'flat') {
    return <span className={`${size} leading-none text-slate-500`}>→</span>;
  }

  const isPositive = direction === positive;
  const color = isPositive ? 'text-success' : 'text-danger';
  const arrow = direction === 'up' ? '↑' : '↓';

  return <span className={`${size} leading-none ${color}`}>{arrow}</span>;
}

function TrendStat({ value, unit, direction, positive = 'up', footer }) {
  const dense = useDensity();
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center ${
        dense ? 'min-h-[110px] gap-0.5 py-1' : 'min-h-[220px] gap-2 py-4'
      }`}
    >
      <div className={`flex items-center ${dense ? 'gap-2' : 'gap-4'}`}>
        <span className={`font-bold tabular-nums text-slate-100 ${dense ? 'text-2xl' : 'text-5xl'}`}>
          {value}
        </span>
        <TrendArrow direction={direction} positive={positive} dense={dense} />
      </div>
      {unit && <span className={`text-slate-500 ${dense ? 'text-[10px]' : 'text-sm'}`}>{unit}</span>}
      {footer && (
        <div className={`flex flex-wrap justify-center text-xs ${dense ? 'mt-1 gap-2' : 'mt-3 gap-4'}`}>
          {footer}
        </div>
      )}
    </div>
  );
}

export function ShellOutcomeGauge({ success, failure, rate, direction }) {
  return (
    <TrendStat
      value={`${rate}%`}
      unit="success rate (1h)"
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

export function ThinkTimeGauge({ avgSec, count, direction }) {
  return (
    <TrendStat
      value={avgSec}
      unit="avg seconds (1h)"
      direction={direction}
      positive="down"
      footer={<span className="text-slate-400">● {count} reasoning cycles</span>}
    />
  );
}

export function CodeChurnGauge({ added, removed, net, direction }) {
  return (
    <TrendStat
      value={net >= 0 ? `+${net}` : net}
      unit="net lines (1h)"
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
        <Line type="monotone" dataKey="avgThinkSec" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartArea>
  );
}

export function ShellOutcomeArea({ data }) {
  const dense = useDensity();
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
  const dense = useDensity();
  if (!data.length) {
    return (
      <div className={`flex flex-1 items-center justify-center ${dense ? 'min-h-[110px]' : 'min-h-[220px]'}`}>
        <p className={`text-slate-500 ${dense ? 'text-xs' : 'text-sm'}`}>No file edits yet</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className={`flex-1 overflow-y-auto ${dense ? 'min-h-[110px] max-h-[140px]' : 'min-h-[220px]'}`}>
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${dense ? 'gap-1' : 'gap-2'}`}>
        {data.map((item) => {
          const intensity = 0.25 + (item.value / max) * 0.75;
          return (
            <div
              key={item.name}
              className={`rounded border border-border transition hover:border-accent/50 ${
                dense ? 'p-1.5' : 'rounded-lg p-3'
              }`}
              style={{ background: `rgba(99, 102, 241, ${intensity * 0.35})` }}
            >
              <p
                className={`truncate font-mono text-slate-300 ${dense ? 'text-[10px]' : 'text-xs'}`}
                title={item.name}
              >
                {item.name}
              </p>
              <p className={`font-semibold tabular-nums ${dense ? 'text-sm' : 'mt-1 text-lg'}`}>{item.value}</p>
              {!dense && <p className="text-[10px] text-slate-500">edits</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function McpBarChart({ data }) {
  const dense = useDensity();
  const chartData = data.length ? data : [{ name: 'none', count: 0 }];
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <BarChart data={chartData} layout="vertical" margin={{ left: dense ? 8 : 20 }}>
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

export function AlertTicker({ alerts }) {
  const dense = useDensity();
  if (!alerts.length) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-panel text-slate-500 ${
          dense ? 'h-7 text-xs' : 'h-12 text-sm'
        }`}
      >
        No security events in the last hour
      </div>
    );
  }

  const items = [...alerts, ...alerts];
  const severityColor = { critical: 'text-danger', high: 'text-warn', medium: 'text-accent' };

  return (
    <div className="overflow-hidden rounded-lg border border-danger/30 bg-panel">
      <div className={`ticker-track flex whitespace-nowrap ${dense ? 'py-1' : 'py-2'}`}>
        {items.map((a, i) => (
          <span
            key={`${a.timestamp}-${i}`}
            className={`inline-flex items-center gap-2 ${dense ? 'mx-3 text-[10px]' : 'mx-6 text-sm'}`}
          >
            <span className={`font-semibold uppercase ${severityColor[a.severity] ?? 'text-slate-400'}`}>
              [{a.type}]
            </span>
            <span className="text-slate-300">{a.message}</span>
            <span className="text-slate-600">{formatTime(a.timestamp)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function CodeChurnLine({ data }) {
  const dense = useDensity();
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
        <Line type="monotone" dataKey="added" stroke="#22c55e" strokeWidth={2} dot={false} name="Added" />
        <Line type="monotone" dataKey="removed" stroke="#ef4444" strokeWidth={2} dot={false} name="Removed" />
        <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Net" />
      </LineChart>
    </ChartArea>
  );
}

export function SessionScatter({ data }) {
  const dense = useDensity();
  const chartData = data.length ? data : [{ durationMin: 0, model: 'none', timestamp: Date.now() / 1000 }];
  const tick = chartTick(dense);
  return (
    <ChartArea>
      <ScatterChart>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="timestamp"
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
        <Scatter data={chartData} fill="#a78bfa" />
      </ScatterChart>
    </ChartArea>
  );
}

export function HumanInterventions({ data }) {
  const dense = useDensity();
  const spark = data.sparkline.map((d) => ({ ...d, label: formatTime(d.time) }));
  return (
    <div className={`flex flex-1 flex-col ${dense ? 'min-h-[110px]' : 'min-h-[220px]'}`}>
      <div className={`flex shrink-0 items-baseline gap-2 ${dense ? 'mb-1' : 'mb-3'}`}>
        <span className={`font-bold tabular-nums text-warn ${dense ? 'text-xl' : 'text-4xl'}`}>{data.total}</span>
        <span className={`text-slate-500 ${dense ? 'text-[10px]' : 'text-sm'}`}>manual approvals (1h)</span>
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height={dense ? 48 : 80}>
          <BarChart data={spark}>
            <Bar dataKey="count" fill="#f59e0b" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.recent.length > 0 && !dense && (
        <ul className="mt-2 max-h-16 shrink-0 space-y-1 overflow-hidden text-xs text-slate-400">
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
