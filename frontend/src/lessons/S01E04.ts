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
  addLog('Starting S01E04 — Transport Declaration...', 'info');

  const res = await fetch(`${BACKEND_URL}/api/lessons/s01e04/run`, {
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
  id: 'S01E04',
  title: 'Transport Declaration',
  description: 'SPK transport declaration for reactor fuel',
  execute,
});
