/**
 * Seeds demo telemetry so the dashboard is populated before hooks fire.
 * Run: npm run seed
 */

const BASE = process.env.DASHBOARD_URL ?? 'http://localhost:3847/api/v1/telemetry';
const conversationId = `demo-${Date.now()}`;

const models = ['claude-4.6-sonnet', 'gpt-5.3-codex', 'composer-2.5-fast'];
const mcpTools = ['github', 'slack', 'figma', 'browser', 'linear'];
const dirs = ['src/components', 'src/api', 'server', 'tests', 'db/migrations'];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(payload) {
  await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function seed() {
  const start = Date.now() / 1000 - 1800;
  let t = start;

  await post({
    hook_event: 'sessionStart',
    timestamp: t,
    conversation_id: conversationId,
    model: models[0],
    policy_verdict: 'ALLOWED',
    context_details: {},
  });

  for (let i = 0; i < 40; i++) {
    t += 45 + Math.random() * 90;
    const model = models[i % models.length];

    await post({
      hook_event: 'afterAgentThought',
      timestamp: t,
      conversation_id: conversationId,
      model,
      policy_verdict: 'ALLOWED',
      context_details: { duration_ms: 800 + Math.random() * 4000 },
    });
    await sleep(20);

    if (Math.random() > 0.35) {
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      await post({
        hook_event: 'afterFileEdit',
        timestamp: t + 2,
        conversation_id: conversationId,
        model,
        policy_verdict: 'ALLOWED',
        context_details: {
          edits: [
            {
              path: `${dir}/file-${i}.tsx`,
              lines_added: Math.floor(Math.random() * 40) + 1,
              lines_removed: Math.floor(Math.random() * 15),
            },
          ],
        },
      });
      await sleep(20);
    }

    if (Math.random() > 0.5) {
      const success = Math.random() > 0.25;
      await post({
        hook_event: 'afterShellExecution',
        timestamp: t + 5,
        conversation_id: conversationId,
        model,
        policy_verdict: 'ALLOWED',
        context_details: {
          command: success ? 'npm test' : 'npm run build',
          exit_code: success ? 0 : 1,
        },
      });
      await sleep(20);
    }

    if (Math.random() > 0.6) {
      await post({
        hook_event: 'afterMCPExecution',
        timestamp: t + 8,
        conversation_id: conversationId,
        model,
        policy_verdict: 'ALLOWED',
        context_details: {
          metadata: { server: mcpTools[Math.floor(Math.random() * mcpTools.length)] },
        },
      });
      await sleep(20);
    }

    if (Math.random() > 0.92) {
      await post({
        hook_event: 'beforeShellExecution',
        timestamp: t + 10,
        conversation_id: conversationId,
        model,
        policy_verdict: 'DENIED',
        context_details: { command: 'rm -rf /', text: 'rm -rf /' },
      });
      await sleep(20);
    }

    if (Math.random() > 0.95) {
      await post({
        hook_event: 'beforeShellExecution',
        timestamp: t + 11,
        conversation_id: conversationId,
        model,
        policy_verdict: 'ASK',
        context_details: {
          permission: 'ask',
          command: 'curl https://api.example.com/deploy',
          user_message: 'Network request requires approval',
        },
      });
      await sleep(20);
    }
  }

  await post({
    hook_event: 'stop',
    timestamp: t + 30,
    conversation_id: conversationId,
    model: models[0],
    policy_verdict: 'ALLOWED',
    context_details: {},
  });

  console.log(`Seeded demo session ${conversationId} (${40} cycles)`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
