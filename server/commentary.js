import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_COMMENTARY_INTERVAL_SEC,
  getCommentaryIntervalSec,
  getEventsInWindow,
  setCommentary,
} from './store.js';

const MAX_EVENTS_IN_PROMPT = 50;
const MAX_STRING_LEN = 120;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';

/** @typedef {{ text: string | null, generatedAt: number | null, eventCount: number, intervalSec: number, status: 'idle' | 'ready' | 'generating' | 'error' | 'disabled', error?: string }} CommentaryState */

let anthropicClient = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function truncate(value, max = MAX_STRING_LEN) {
  const text = String(value ?? '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function formatTimestamp(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(11, 19);
}

function describeEvent(event) {
  const ctx = event.context_details ?? {};
  const parts = [formatTimestamp(event.timestamp), event.hook_event];

  if (event.policy_verdict === 'DENIED') {
    parts.push('DENIED');
  }

  if (event.hook_event === 'beforeShellExecution' || event.hook_event === 'afterShellExecution') {
    const cmd = ctx.command ?? ctx.text ?? '';
    if (cmd) parts.push(`cmd=${truncate(cmd)}`);
    if (event.hook_event === 'afterShellExecution') {
      const code = ctx.exit_code ?? ctx.exitCode;
      if (code != null) parts.push(`exit=${code}`);
    }
  }

  if (event.hook_event === 'afterFileEdit' || event.hook_event === 'afterTabFileEdit') {
    const files = ctx.files ?? ctx.edits?.map((e) => e.path ?? e.file ?? e.file_path).filter(Boolean);
    if (files?.length) parts.push(`files=${truncate(files.join(', '))}`);
  }

  if (event.hook_event === 'afterMCPExecution' || event.hook_event === 'beforeMCPExecution') {
    const server = ctx.metadata?.server ?? ctx.server ?? ctx.tool_name ?? ctx.toolName;
    if (server) parts.push(`mcp=${truncate(server)}`);
  }

  if (event.hook_event === 'postToolUse') {
    const tool = ctx.tool_name ?? ctx.toolName;
    if (tool) parts.push(`tool=${tool}`);
  }

  if (event.hook_event === 'afterAgentThought') {
    const ms = ctx.duration_ms ?? ctx.thinking_duration_ms ?? ctx.duration ?? ctx.elapsed_ms;
    if (ms != null) parts.push(`duration_ms=${ms}`);
  }

  if (event.hook_event === 'stop' && event.session_duration_sec != null) {
    parts.push(`session_sec=${Math.round(event.session_duration_sec)}`);
  }

  if (event.model) parts.push(`model=${event.model}`);

  return parts.join(' · ');
}

export function formatEventsForPrompt(events) {
  const slice = events.slice(-MAX_EVENTS_IN_PROMPT);
  return slice.map(describeEvent).join('\n');
}

/**
 * @param {string} projectId
 * @param {number} [windowSec]
 * @returns {Promise<CommentaryState>}
 */
export async function generateCommentary(projectId, windowSec = DEFAULT_COMMENTARY_INTERVAL_SEC) {
  const intervalSec = windowSec || getCommentaryIntervalSec(projectId);
  const events = getEventsInWindow(projectId, intervalSec);

  if (!process.env.ANTHROPIC_API_KEY) {
    const disabled = {
      text: null,
      generatedAt: null,
      eventCount: events.length,
      intervalSec,
      status: /** @type {const} */ ('disabled'),
    };
    setCommentary(projectId, disabled);
    return disabled;
  }

  if (events.length === 0) {
    const idle = {
      text: null,
      generatedAt: null,
      eventCount: 0,
      intervalSec,
      status: /** @type {const} */ ('idle'),
    };
    setCommentary(projectId, idle);
    return idle;
  }

  const generating = {
    text: null,
    generatedAt: null,
    eventCount: events.length,
    intervalSec,
    status: /** @type {const} */ ('generating'),
  };
  setCommentary(projectId, generating);

  const client = getClient();
  if (!client) {
    const disabled = {
      text: null,
      generatedAt: null,
      eventCount: events.length,
      intervalSec,
      status: /** @type {const} */ ('disabled'),
    };
    setCommentary(projectId, disabled);
    return disabled;
  }

  const eventLog = formatEventsForPrompt(events);
  const windowLabel = intervalSec >= 60
    ? `${Math.round(intervalSec / 60)} minute(s)`
    : `${intervalSec} seconds`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 256,
      system:
        'You summarize Cursor agent telemetry for a developer dashboard. Write 2–4 concise sentences in plain English describing what the agent did: thinking, file edits, shell commands, MCP calls, blocks, and session activity. Do not use bullet points or markdown.',
      messages: [
        {
          role: 'user',
          content: `Summarize agent activity from the last ${windowLabel} (${events.length} events):\n\n${eventLog}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const ready = {
      text: text || 'No summary generated.',
      generatedAt: Date.now() / 1000,
      eventCount: events.length,
      intervalSec,
      status: /** @type {const} */ ('ready'),
    };
    setCommentary(projectId, ready);
    return ready;
  } catch (err) {
    const error = {
      text: null,
      generatedAt: Date.now() / 1000,
      eventCount: events.length,
      intervalSec,
      status: /** @type {const} */ ('error'),
      error: err instanceof Error ? err.message : String(err),
    };
    setCommentary(projectId, error);
    return error;
  }
}
