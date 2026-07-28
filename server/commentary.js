import Anthropic from '@anthropic-ai/sdk';
import { extractEventDetail } from './event-fields.js';
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

export function describeEvent(event) {
  const parts = [formatTimestamp(event.timestamp), event.hook_event];

  if (event.policy_verdict === 'DENIED') {
    parts.push('DENIED');
  }

  // Same extractor the event feed uses, so the prompt can never describe an
  // event differently from what the dashboard shows.
  const detail = extractEventDetail(event);
  if (detail) parts.push(truncate(detail));

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
