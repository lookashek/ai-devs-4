import cors from 'cors';
import express from 'express';
import { config, openai } from '@ai-devs-4/general';
import { s01e01Router } from './lessons/s01e01.js';
import { s01e02Router } from './lessons/s01e02.js';
import { s01e03Router } from './lessons/s01e03.js';
import { s01e05Router } from './lessons/s01e05.js';
import { s02e01Router } from './lessons/s02e01.js';
import { s02e03Router } from './lessons/s02e03.js';
import { s02e04Router } from './lessons/s02e04.js';

const app = express();
const PORT = 3001;
const HUB_URL = 'https://hub.ag3nts.org';

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/hub/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    const upstream = await fetch(`${HUB_URL}/`, { signal: AbortSignal.timeout(5000) });
    const status = upstream.ok || upstream.status < 500 ? 'online' : 'offline';
    res.json({ status, latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.get('/api/openai/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    await openai.models.list();
    res.json({ status: 'online', latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.get('/api/anthropic/health', async (_req, res): Promise<void> => {
  const start = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(5000),
    });
    const status = response.ok ? 'online' : 'offline';
    res.json({ status, latency: Date.now() - start });
  } catch {
    res.json({ status: 'offline', latency: Date.now() - start });
  }
});

app.post('/api/hub/verify', async (req, res): Promise<void> => {
  const { task, answer } = req.body as { task: string; answer: unknown };

  const body = {
    apikey: config.AIDEVS_API_KEY,
    task,
    answer,
  };

  console.log(`[backend] Proxying Hub API request for task: ${task}`);

  const upstream = await fetch(`${HUB_URL}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data: unknown = await upstream.json();
  res.status(upstream.status).json(data);
});

app.use('/api/lessons/s01e01', s01e01Router);
app.use('/api/lessons/s01e02', s01e02Router);
app.use('/api/lessons/s01e03', s01e03Router);
app.use('/api/lessons/s01e05', s01e05Router);
app.use('/api/lessons/s02e01', s02e01Router);
app.use('/api/lessons/s02e03', s02e03Router);
app.use('/api/lessons/s02e04', s02e04Router);

app.listen(PORT, () => {
  console.log(`[backend] Server running at http://localhost:${PORT}`);
});
