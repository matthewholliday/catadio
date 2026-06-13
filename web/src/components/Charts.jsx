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

export function Panel({ title, subtitle, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface p-4 shadow-lg shadow-black/20 ${className}`}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function AgentStateDonut({ data }) {
  const chartData = data.length ? data : [{ name: 'Waiting', value: 1, percent: 100 }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
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
    </ResponsiveContainer>
  );
}

export function SecurityGauge({ rate, blocked, allowed }) {
  const clamped = Math.min(rate, 100);
  const hue = clamped < 5 ? 142 : clamped < 15 ? 45 : 0;
  return (
    <div className="flex flex-col items-center py-4">
      <div
        className="relative flex h-36 w-36 items-end justify-center rounded-full border-8 border-border"
        style={{
          background: `conic-gradient(hsl(${hue} 70% 45%) ${clamped * 3.6}deg, #2a2f3d 0)`,
        }}
      >
        <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-surface">
          <span className="text-3xl font-bold tabular-nums">{rate}%</span>
          <span className="text-xs text-slate-500">blocked</span>
        </div>
      </div>
      <div className="mt-4 flex gap-6 text-xs">
        <span className="text-success">● {allowed} allowed</span>
        <span className="text-danger">● {blocked} blocked</span>
      </div>
    </div>
  );
}

export function ThinkTimeLine({ data }) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} unit="s" />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="avgThinkSec" stroke="#6366f1" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ShellOutcomeArea({ data }) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Area type="monotone" dataKey="success" stackId="1" stroke="#22c55e" fill="#22c55e55" />
        <Area type="monotone" dataKey="failure" stackId="1" stroke="#ef4444" fill="#ef444455" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BlastRadiusTreemap({ data }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No file edits yet</p>;
  }
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {data.map((item) => {
        const intensity = 0.25 + (item.value / max) * 0.75;
        return (
          <div
            key={item.name}
            className="rounded-lg border border-border p-3 transition hover:border-accent/50"
            style={{ background: `rgba(99, 102, 241, ${intensity * 0.35})` }}
          >
            <p className="truncate font-mono text-xs text-slate-300" title={item.name}>
              {item.name}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{item.value}</p>
            <p className="text-[10px] text-slate-500">edits</p>
          </div>
        );
      })}
    </div>
  );
}

export function McpBarChart({ data }) {
  const chartData = data.length ? data : [{ name: 'none', count: 0 }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={80}
          tick={{ fill: '#94a3b8', fontSize: 10 }}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AlertTicker({ alerts }) {
  if (!alerts.length) {
    return (
      <div className="flex h-12 items-center justify-center rounded-lg bg-panel text-sm text-slate-500">
        No security events in the last hour
      </div>
    );
  }

  const items = [...alerts, ...alerts];
  const severityColor = { critical: 'text-danger', high: 'text-warn', medium: 'text-accent' };

  return (
    <div className="overflow-hidden rounded-lg border border-danger/30 bg-panel">
      <div className="ticker-track flex whitespace-nowrap py-2">
        {items.map((a, i) => (
          <span key={`${a.timestamp}-${i}`} className="mx-6 inline-flex items-center gap-2 text-sm">
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
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.time) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData}>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
        />
        <Line type="monotone" dataKey="added" stroke="#22c55e" strokeWidth={2} dot={false} name="Added" />
        <Line type="monotone" dataKey="removed" stroke="#ef4444" strokeWidth={2} dot={false} name="Removed" />
        <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Net" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SessionScatter({ data }) {
  const chartData = data.length ? data : [{ durationMin: 0, model: 'none', timestamp: Date.now() / 1000 }];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart>
        <CartesianGrid stroke="#2a2f3d" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="timestamp"
          name="Time"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
          tickFormatter={formatTime}
        />
        <YAxis
          type="number"
          dataKey="durationMin"
          name="Duration"
          unit=" min"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
        />
        <ZAxis range={[60, 200]} />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2a2f3d', borderRadius: 8 }}
          formatter={(val, name) => [name === 'Duration' ? `${val} min` : formatTime(val), name]}
        />
        <Scatter data={chartData} fill="#a78bfa" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function HumanInterventions({ data }) {
  const spark = data.sparkline.map((d) => ({ ...d, label: formatTime(d.time) }));
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-4xl font-bold tabular-nums text-warn">{data.total}</span>
        <span className="text-sm text-slate-500">manual approvals (1h)</span>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <BarChart data={spark}>
          <Bar dataKey="count" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      {data.recent.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-slate-400">
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
