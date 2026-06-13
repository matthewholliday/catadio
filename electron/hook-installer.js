import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HOOK_EVENTS = [
  'sessionStart',
  'beforeShellExecution',
  'afterShellExecution',
  'afterFileEdit',
  'afterAgentThought',
  'beforeMCPExecution',
  'afterMCPExecution',
  'stop',
];

const DASHBOARD_SCRIPT_MARKER = 'dashboard_telemetry.py';

export function projectIdFor(folderPath) {
  return crypto
    .createHash('sha256')
    .update(path.resolve(folderPath))
    .digest('hex')
    .slice(0, 16);
}

function getResourcesDir() {
  if (process.env.DASHBOARD_RESOURCES_PATH) {
    return process.env.DASHBOARD_RESOURCES_PATH;
  }
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'resources', 'hooks');
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.join(__dirname, 'resources', 'hooks');
}

function loadTemplate(projectId) {
  const templatePath = path.join(getResourcesDir(), 'hooks.json.template');
  const raw = fs.readFileSync(templatePath, 'utf8');
  const parsed = JSON.parse(raw.replaceAll('{{PROJECT_ID}}', projectId));
  return parsed;
}

function isDashboardEntry(entry) {
  const command = entry?.command ?? '';
  return command.includes(DASHBOARD_SCRIPT_MARKER);
}

function mergeHooks(existing, incoming) {
  const merged = { ...existing };
  for (const [event, entries] of Object.entries(incoming)) {
    const filtered = (merged[event] ?? []).filter((e) => !isDashboardEntry(e));
    merged[event] = [...filtered, ...entries];
  }
  return merged;
}

export function installHooks(folderPath) {
  const projectId = projectIdFor(folderPath);
  const resourcesDir = getResourcesDir();
  const bundledScriptPath = path.join(resourcesDir, 'dashboard_telemetry.py');
  const hooksDir = path.join(folderPath, '.cursor', 'hooks');
  const hooksJsonPath = path.join(folderPath, '.cursor', 'hooks.json');
  const targetScriptPath = path.join(hooksDir, 'dashboard_telemetry.py');

  if (!fs.existsSync(bundledScriptPath)) {
    throw new Error(`Bundled telemetry script not found at ${bundledScriptPath}`);
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(bundledScriptPath, targetScriptPath);
  fs.chmodSync(targetScriptPath, 0o755);

  const existing = fs.existsSync(hooksJsonPath)
    ? JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'))
    : { version: 1, hooks: {} };

  const template = loadTemplate(projectId);
  existing.version = existing.version ?? 1;
  existing.hooks = mergeHooks(existing.hooks ?? {}, template.hooks);
  fs.writeFileSync(hooksJsonPath, `${JSON.stringify(existing, null, 2)}\n`);

  return {
    projectId,
    hooksDir,
    hooksJsonPath,
    installedEvents: HOOK_EVENTS,
  };
}

export function checkHookStatus(folderPath) {
  const hooksJsonPath = path.join(folderPath, '.cursor', 'hooks.json');
  const scriptPath = path.join(folderPath, '.cursor', 'hooks', 'dashboard_telemetry.py');

  if (!fs.existsSync(hooksJsonPath)) {
    return { status: 'missing', message: 'No hooks.json found' };
  }

  if (!fs.existsSync(scriptPath)) {
    return { status: 'missing', message: 'Telemetry script not installed' };
  }

  try {
    const config = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
    const hooks = config.hooks ?? {};
    const missingEvents = HOOK_EVENTS.filter((event) => {
      const entries = hooks[event] ?? [];
      return !entries.some((entry) => isDashboardEntry(entry));
    });

    if (missingEvents.length > 0) {
      return {
        status: 'partial',
        message: `Missing dashboard hooks for: ${missingEvents.join(', ')}`,
        missingEvents,
      };
    }

    return { status: 'active', message: 'Dashboard hooks installed' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}
