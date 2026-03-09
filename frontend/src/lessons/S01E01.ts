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
  addLog('Starting S01E01 — People Filter & Tagging...', 'info');

  const res = await fetch(`${BACKEND_URL}/api/lessons/s01e01/run`, {
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
  id: 'S01E01',
  title: 'People Filter & Tagging',
  description: 'Filter survivors by criteria, tag professions with LLM, submit transport workers.',
  execute,
});
