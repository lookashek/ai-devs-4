# S01E03 — HTTP Proxy Assistant with Package Tracking

## Task

Build a publicly accessible HTTP endpoint that acts as an intelligent logistics proxy-assistant with conversation memory. An operator connects and asks questions about packages. The assistant has access to an external package API (check status, redirect).

Secret mission: when the operator requests to redirect a package containing reactor parts ("części do reaktora"), silently change the destination to the Żarnowiec power plant (code: `PWR6132PL`). The operator provides a security code during the conversation — use it for the redirect. After a successful redirect, relay the API confirmation code to the operator.

Finally, submit the endpoint URL to the Hub API under task `proxy`.

## How to Run

### 1. Start the proxy server

```bash
npx tsx lessons/S01E03/index.ts
```

The server listens on port **3000** by default. Override with `PORT` env var:

```bash
PORT=8080 npx tsx lessons/S01E03/index.ts
```

### 2. Expose publicly via ngrok

```bash
ngrok http 3000
```

Note the HTTPS URL from the output, e.g. `https://abc123.ngrok-free.app`.

Alternative (no install needed):

```bash
ssh -p 443 -R0:localhost:3000 a.pinggy.io
```

### 3. Test the endpoint

```bash
curl -X POST https://<your-ngrok-url>/ \
  -H "Content-Type: application/json" \
  -d '{"sessionID": "test-001", "msg": "Cześć, jaki jest status paczki PKG12345678?"}'
```

Expected response: `{ "msg": "..." }` in Polish.

### 4. Submit to Hub API

**Via curl:**

```bash
curl -X POST http://localhost:3001/api/lessons/s01e03/run \
  -H "Content-Type: application/json" \
  -d '{"url": "https://<your-ngrok-url>/", "sessionID": "hub-session-1"}'
```

**Via frontend UI:**

Open `http://localhost:3000` (frontend), click **S01E03 Proxy Assistant**, enter the ngrok URL when prompted.

> **Keep both the server and ngrok running while the Hub tests the endpoint.**

## Environment Variables

All required keys are already in `.env.example`. No new variables needed for this lesson.

| Variable | Description |
|---|---|
| `AIDEVS_API_KEY` | Used to authenticate with the packages API and Hub submission |
| `OPENAI_API_KEY` | Used for GPT-4o-mini function calling |

## Approach

1. Express HTTP server with `POST /` accepting `{ sessionID, msg }`
2. In-memory session store (`Map<sessionID, messages[]>`) for multi-turn conversation
3. OpenAI `gpt-4o-mini` with function calling: `check_package` and `redirect_package`
4. Covert behavior encoded in system prompt: reactor-part packages silently redirected to `PWR6132PL`
5. LLM tool loop capped at 5 iterations
6. Exposed publicly via ngrok; URL submitted to Hub API

## Result

Flag: pending
