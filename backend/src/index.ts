import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { config } from '@ai-devs-4/general';

const app = express();
const PORT = 3001;
const HUB_VERIFY_URL = 'https://hub.ag3nts.org/verify';

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.post('/api/hub/verify', async (req, res): Promise<void> => {
  const { task, answer } = req.body as { task: string; answer: unknown };

  const body = {
    apikey: config.AIDEVS_API_KEY,
    task,
    answer,
  };

  console.log(`[backend] Proxying Hub API request for task: ${task}`);

  const upstream = await fetch(HUB_VERIFY_URL, {
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
