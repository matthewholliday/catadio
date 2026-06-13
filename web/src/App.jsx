import {
  AgentStateDonut,
  AlertTicker,
  BlastRadiusTreemap,
  CodeChurnLine,
  HumanInterventions,
  McpBarChart,
  Panel,
  SecurityGauge,
  SessionScatter,
  ShellOutcomeArea,
  ThinkTimeLine,
} from './components/Charts.jsx';
import { useMetrics } from './useMetrics.js';

export default function App() {
  const { metrics, connected } = useMetrics();

  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <header className="sticky top-0 z-10 border-b border-border bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-accent">Cursor Hooks</p>
            <h1 className="text-xl font-bold text-white">Agent Observability Dashboard</h1>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="hidden sm:block text-right">
              <p className="text-slate-400">
                {metrics.totals.recentEvents} events / {metrics.totals.sessions} sessions (1h)
              </p>
              <p className="text-xs text-slate-600">{metrics.totals.events} total buffered</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-danger'}`}
              />
              <span className="text-slate-400">{connected ? 'Live' : 'Reconnecting…'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <Panel title="Security Interceptions" subtitle="Metric #7 · Real-time alert ticker" className="mb-6">
          <AlertTicker alerts={metrics.securityAlerts} />
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Agent State Distribution" subtitle="Metric #1 · Donut chart">
            <AgentStateDonut data={metrics.agentStateDistribution} />
            <ul className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-slate-400">
              {metrics.agentStateDistribution.map((d, i) => (
                <li key={d.name}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" style={{ background: `hsl(${240 + i * 40}, 70%, 60%)` }} />
                  {d.name} {d.percent}%
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Security Block Rate" subtitle="Metric #2 · Policy gauge">
            <SecurityGauge {...metrics.securityBlockRate} />
          </Panel>

          <Panel title="Human-in-the-Loop" subtitle="Metric #10 · Manual approval friction">
            <HumanInterventions data={metrics.humanInterventions} />
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Average Think Time" subtitle="Metric #3 · Reasoning latency">
            <ThinkTimeLine data={metrics.thinkTimeSeries} />
          </Panel>

          <Panel title="Shell Success vs Failure" subtitle="Metric #4 · Exit code time series">
            <ShellOutcomeArea data={metrics.shellOutcomeSeries} />
          </Panel>

          <Panel title="Code Churn Volume" subtitle="Metric #8 · Lines added/removed">
            <CodeChurnLine data={metrics.codeChurnSeries} />
          </Panel>

          <Panel title="Autonomous Loop Duration" subtitle="Metric #9 · Session scatter plot">
            <SessionScatter data={metrics.sessionScatter} />
          </Panel>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="Project Blast Radius" subtitle="Metric #5 · Directory heatmap">
            <BlastRadiusTreemap data={metrics.blastRadius} />
          </Panel>

          <Panel title="MCP Usage Breakdown" subtitle="Metric #6 · Tool call frequency">
            <McpBarChart data={metrics.mcpUsage} />
          </Panel>
        </div>
      </main>
    </div>
  );
}
