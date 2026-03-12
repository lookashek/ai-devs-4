import { registerLesson } from './registry.js';
import type { AddLog } from './registry.js';

const BACKEND_URL = 'http://localhost:3001';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

async function execute(addLog: AddLog): Promise<void> {
  addLog('Starting S01E03 — Proxy Assistant...', 'info');

  const url = prompt('Enter the public proxy URL (e.g. https://abc.ngrok-free.app/):');
  if (!url) {
    addLog('No URL provided — aborting', 'warn');
    return;
  }

  addLog(`Submitting proxy URL: ${url}`, 'info');

  const res = await fetch(`${BACKEND_URL}/api/lessons/s01e03/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, sessionID: 'hub-test-session' }),
  });

  const data = (await res.json()) as RunResponse;

  for (const step of data.steps) {
    addLog(step.message, step.level);
  }

  if (!res.ok) {
    throw new Error('Lesson execution failed — check backend logs for details');
  }

  if (data.flag) {
    addLog(`Flag received: ${data.flag}`, 'success');
  }
}

registerLesson({
  id: 'S01E03',
  title: 'Proxy Assistant',
  description: 'HTTP proxy with package tracking',
  execute,
});
