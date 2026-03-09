import cors from 'cors';
import express from 'express';
import { config } from '@ai-devs-4/general';

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

app.listen(PORT, () => {
  console.log(`[backend] Server running at http://localhost:${PORT}`);
});
