/**
 * Simulate a single Claude Code agent run.
 *
 * Unlike simulate-live.js (an endless random stream mixing several agents and
 * models) and seed-demo.js (a one-shot backfill dated in the past), this plays
 * out ONE coherent Claude Code session: a realistic task that starts, unfolds
 * as a believable sequence of tool calls, and ends, streamed in real time.
 *
 * It emits only the canonical events the Claude Code producer really emits, in
 * the exact shapes from .claude/hooks/claude_telemetry.py, and honors Claude
 * Code's documented limitations (see ARCHITECTURE.md):
 *   - every event is tagged agent: "claude"
 *   - no afterAgentThought (Claude Code has no thinking-duration hook)
 *   - no postToolUse (Read/Grep/Glob/Task are untracked; those steps are
 *     narrated to the console but emit nothing, matching reality)
 *   - conversation_id = session_id, generation_id is a synthesized uuid
 *   - model is omitted (Claude Code sends no model field) unless --model is set
 *
 * Run: npm run simulate:claude
 *   node server/simulate-claude-run.js --scenario rate-limit --speed 2
 *   node server/simulate-claude-run.js --list
 *   node server/simulate-claude-run.js --instant --loop
 *
 * Flags (all optional):
 *   --scenario <name>  built-in scenario, or "random" (default: random)
 *   --list             print the scenario library and exit
 *   --speed <n>        wall-clock multiplier; 2 = twice as fast (default: 1)
 *   --instant          fire every event back to back with no pacing
 *   --loop             run scenarios forever instead of exiting after one
 *   --project <id>     target project bucket (default: active/saved project)
 *   --model <id>       populate the model field (default: unset, like Claude)
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

// --- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

const args = parseArgs(process.argv.slice(2));

// --- Config ------------------------------------------------------------------

function resolveProject() {
  if (args.project) return String(args.project);
  if (process.env.DASHBOARD_PROJECT) return process.env.DASHBOARD_PROJECT;
  const dataPath = join(
    homedir(),
    'Library',
    'Application Support',
    'agent-dashboard',
    'projects.json',
  );
  try {
    const { activeProject } = JSON.parse(readFileSync(dataPath, 'utf8'));
    if (activeProject?.id) return activeProject.id;
  } catch {
    // no saved project or not on macOS, fall back to default
  }
  return 'default';
}

const BASE = process.env.DASHBOARD_URL ?? 'http://localhost:3847/api/v1/telemetry';
const PROJECT = resolveProject();
const HEALTH_URL = BASE.replace(/\/api\/v1\/telemetry$/, '/api/health');
const SPEED = Math.max(Number(args.speed ?? 1) || 1, 0.01);
const INSTANT = Boolean(args.instant);
const LOOP = Boolean(args.loop);
const MODEL = typeof args.model === 'string' ? args.model : null;
const WORKSPACE = process.env.SIMULATE_WORKSPACE ?? process.cwd();

// --- Scenario library --------------------------------------------------------
//
// A scenario is a task title plus an ordered list of steps. Each step is one
// thing the agent does. Step kinds:
//   read  { paths }                          narrated only, emits nothing
//   edit  { tool, file, added, removed }     -> afterFileEdit
//   shell { command, exitCode? }             -> beforeShellExecution + afterShellExecution
//   deny  { command }                        -> beforeShellExecution (DENIED)
//   ask   { command, message }               -> notification (permission: ask)
//   mcp   { server, tool, deny? }            -> before/afterMCPExecution
//   done  { message }                        narrated only

const SCENARIOS = {
  'rate-limit': {
    title: 'Add rate limiting to the API',
    steps: [
      { kind: 'read', paths: ['server/index.js', 'server/store.js'] },
      { kind: 'shell', command: 'npm ls express' },
      { kind: 'edit', tool: 'Write', file: 'server/rateLimit.js', added: 48, removed: 0 },
      { kind: 'edit', tool: 'Edit', file: 'server/index.js', added: 6, removed: 1 },
      { kind: 'shell', command: 'npm run lint' },
      { kind: 'shell', command: 'npm test', exitCode: 1 },
      { kind: 'read', paths: ['server/rateLimit.js'] },
      { kind: 'edit', tool: 'Edit', file: 'server/rateLimit.js', added: 4, removed: 3 },
      { kind: 'shell', command: 'npm test' },
      { kind: 'ask', command: 'git push origin feature/rate-limit', message: 'Push branch to origin?' },
      { kind: 'done', message: 'Rate limiting added and tests green' },
    ],
  },
  'fix-flaky-test': {
    title: 'Investigate and fix a flaky test',
    steps: [
      { kind: 'shell', command: 'npm test -- --runInBand', exitCode: 1 },
      { kind: 'read', paths: ['tests/integration/queue.test.js'] },
      { kind: 'shell', command: 'grep -rn "setTimeout" tests/' },
      { kind: 'edit', tool: 'Edit', file: 'tests/integration/queue.test.js', added: 9, removed: 5 },
      { kind: 'edit', tool: 'Edit', file: 'src/queue.js', added: 3, removed: 2 },
      { kind: 'shell', command: 'npm test -- queue' },
      { kind: 'shell', command: 'npm test -- queue' },
      { kind: 'mcp', server: 'github', tool: 'create_issue' },
      { kind: 'done', message: 'Race condition fixed, test stable over repeat runs' },
    ],
  },
  'research-feature': {
    title: 'Scope a new feature across the codebase and docs',
    steps: [
      { kind: 'read', paths: ['ARCHITECTURE.md', 'server/metrics.js'] },
      { kind: 'mcp', server: 'linear', tool: 'get_issue' },
      { kind: 'mcp', server: 'notion', tool: 'fetch' },
      { kind: 'edit', tool: 'Write', file: 'docs/feature-plan.md', added: 72, removed: 0 },
      { kind: 'mcp', server: 'slack', tool: 'post_message' },
      { kind: 'done', message: 'Feature plan drafted and shared for review' },
    ],
  },
  'risky-cleanup': {
    title: 'Clean up build artifacts (trips a guardrail)',
    steps: [
      { kind: 'shell', command: 'du -sh build dist' },
      { kind: 'deny', command: 'rm -rf /' },
      { kind: 'shell', command: 'rm -rf build/tmp' },
      { kind: 'mcp', server: 'unauthorized-internal-tool', tool: 'purge', deny: true },
      { kind: 'shell', command: 'git status' },
      { kind: 'done', message: 'Safe cleanup done, dangerous commands blocked' },
    ],
  },
};

// --- Random scenario generator ----------------------------------------------

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomScenario() {
  const dirs = ['src/components', 'src/api', 'server', 'web/src', 'tests/unit', 'db/migrations'];
  const writeTools = ['Write', 'Edit', 'MultiEdit'];
  const mcpServers = ['github', 'slack', 'figma', 'linear', 'sentry', 'notion'];
  const shells = ['npm test', 'npm run lint', 'npm run build', 'git status', 'pytest tests/'];
  const steps = [{ kind: 'read', paths: [`${pick(dirs)}/index.ts`, 'README.md'] }];
  const beats = randInt(6, 11);
  for (let i = 0; i < beats; i++) {
    const roll = Math.random();
    if (roll < 0.4) {
      steps.push({
        kind: 'edit',
        tool: pick(writeTools),
        file: `${pick(dirs)}/module-${randInt(1, 40)}.ts`,
        added: randInt(3, 40),
        removed: randInt(0, 15),
      });
    } else if (roll < 0.7) {
      steps.push({ kind: 'shell', command: pick(shells), exitCode: Math.random() < 0.2 ? 1 : 0 });
    } else if (roll < 0.85) {
      steps.push({ kind: 'mcp', server: pick(mcpServers), tool: 'query' });
    } else {
      steps.push({ kind: 'read', paths: [`${pick(dirs)}/helper.ts`] });
    }
  }
  if (Math.random() < 0.3) steps.push({ kind: 'deny', command: 'rm -rf /' });
  steps.push({ kind: 'done', message: 'Task complete' });
  return { title: 'Ad-hoc coding task', steps };
}

// --- Transport ---------------------------------------------------------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sleep for a step's natural duration, scaled by --speed (skipped in --instant). */
function pace(ms) {
  if (INSTANT) return Promise.resolve();
  return sleep(Math.round(ms / SPEED));
}

async function post(payload) {
  const url = PROJECT === 'default' ? BASE : `${BASE}?project=${encodeURIComponent(PROJECT)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Telemetry POST failed (${res.status})`);
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Dashboard API not reachable at ${HEALTH_URL}. Start with: npm run dev`);
}

// --- Event emission (mirrors .claude/hooks/claude_telemetry.py emit()) -------

let session = null;

/** Build the canonical envelope exactly as the Claude Code producer does. */
function emit(hookEvent, contextDetails, verdict = 'ALLOWED') {
  return post({
    hook_event: hookEvent,
    agent: 'claude',
    timestamp: Date.now() / 1000,
    conversation_id: session.id,
    generation_id: randomUUID(),
    model: MODEL,
    policy_verdict: verdict,
    context_details: contextDetails,
  });
}

function countLines(text) {
  if (!text) return 0;
  const parts = String(text).replace(/\r\n/g, '\n').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

/** Synthesize old/new strings so line deltas match added/removed, like real edits. */
function buildEditContext(step) {
  const oldString = 'x\n'.repeat(step.removed ?? 0);
  const newString = 'y\n'.repeat(step.added ?? 0);
  return {
    file_path: step.file,
    tool_name: step.tool,
    edits: [
      {
        old_string: oldString,
        new_string: newString,
        lines_added: step.added ?? countLines(newString),
        lines_removed: step.removed ?? countLines(oldString),
      },
    ],
  };
}

function mcpContext(server, tool) {
  return { server, tool_name: server, mcp_tool: tool ?? '', metadata: { server } };
}

// --- Step player -------------------------------------------------------------

function log(icon, message) {
  console.log(`  ${icon}  ${message}`);
}

async function playStep(step) {
  switch (step.kind) {
    case 'read':
      // Read/Grep/Glob are untracked by the Claude producer, so we emit nothing
      // and only narrate, keeping the run faithful.
      log('👁', `read ${step.paths.join(', ')}`);
      await pace(randInt(500, 1500));
      break;

    case 'edit':
      await emit('afterFileEdit', buildEditContext(step));
      log('✎', `${step.tool} ${step.file} (+${step.added ?? 0} -${step.removed ?? 0})`);
      await pace(randInt(800, 2200));
      break;

    case 'shell': {
      const command = step.command;
      const exitCode = step.exitCode ?? 0;
      await emit('beforeShellExecution', { command });
      await pace(randInt(300, 900));
      await emit('afterShellExecution', { command, exit_code: exitCode });
      log(exitCode === 0 ? '✔' : '✗', `$ ${command}${exitCode === 0 ? '' : ` (exit ${exitCode})`}`);
      await pace(randInt(400, 1200));
      break;
    }

    case 'deny':
      await emit('beforeShellExecution', { command: step.command }, 'DENIED');
      log('⛔', `blocked: ${step.command}`);
      await pace(randInt(400, 900));
      break;

    case 'ask':
      await emit('notification', { permission: 'ask', user_message: step.message }, 'ASK');
      log('✋', `awaiting approval: ${step.message}`);
      await pace(randInt(600, 1400));
      break;

    case 'mcp': {
      const { server, tool, deny } = step;
      if (deny) {
        await emit('beforeMCPExecution', mcpContext(server, tool), 'DENIED');
        log('⛔', `blocked MCP: ${server}`);
      } else {
        await emit('beforeMCPExecution', mcpContext(server, tool));
        await pace(randInt(300, 800));
        await emit('afterMCPExecution', mcpContext(server, tool));
        log('⚙', `mcp ${server}${tool ? `.${tool}` : ''}`);
      }
      await pace(randInt(400, 1000));
      break;
    }

    case 'done':
      log('★', step.message);
      break;

    default:
      break;
  }
}

async function runScenario(scenario) {
  session = { id: `claude-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };

  console.log(`\n▸ ${scenario.title}`);
  console.log(`  session ${session.id} | project ${PROJECT}\n`);

  await emit('sessionStart', { cwd: WORKSPACE, source: 'startup' });
  await pace(randInt(600, 1200));

  for (const step of scenario.steps) {
    await playStep(step);
  }

  await pace(randInt(400, 800));
  await emit('stop', { reason: 'clear' });
  console.log(`  ⏹  session ended\n`);
}

// --- Entry -------------------------------------------------------------------

function resolveScenario() {
  const name = typeof args.scenario === 'string' ? args.scenario : 'random';
  if (name === 'random') return randomScenario();
  if (SCENARIOS[name]) return SCENARIOS[name];
  console.error(`Unknown scenario "${name}". Use --list to see options.`);
  process.exit(1);
}

function printList() {
  console.log('Available Claude run scenarios:\n');
  for (const [name, s] of Object.entries(SCENARIOS)) {
    console.log(`  ${name.padEnd(18)} ${s.title} (${s.steps.length} steps)`);
  }
  console.log(`  ${'random'.padEnd(18)} Randomly generated coding task`);
}

let running = true;

async function main() {
  if (args.list) {
    printList();
    return;
  }

  console.log('Claude agent run simulator');
  console.log(`  API:      ${BASE}`);
  console.log(`  Project:  ${PROJECT}`);
  console.log(`  Speed:    ${INSTANT ? 'instant' : `${SPEED}x`}`);
  console.log(`  Model:    ${MODEL ?? '(unset, matches Claude Code)'}`);
  console.log('Waiting for dashboard API...');

  await waitForServer();
  console.log('Connected.');

  do {
    await runScenario(resolveScenario());
    if (LOOP && running) await pace(randInt(1500, 3500));
  } while (LOOP && running);
}

function shutdown() {
  if (!running) return;
  running = false;
  console.log('\n[simulate:claude] stopping...');
  const finish = session ? emit('stop', { reason: 'other' }).catch(() => {}) : Promise.resolve();
  finish.finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
