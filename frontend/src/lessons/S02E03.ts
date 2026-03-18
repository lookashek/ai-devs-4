import { registerLesson } from './registry.js';
import type { AddLog } from './registry.js';

const BACKEND_URL = 'http://localhost:3001';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
}

interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

async function execute(addLog: AddLog): Promise<void> {
  addLog('Starting S02E03 — Failure Log Analysis...', 'info');

  const res = await fetch(`${BACKEND_URL}/api/lessons/s02e03/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  id: 'S02E03',
  title: 'Failure Log Analysis',
  description: 'Condense a large power plant failure log into <1500 tokens for root-cause analysis.',
  execute,
});
