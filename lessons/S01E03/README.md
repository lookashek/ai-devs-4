# S01E03 — HTTP Proxy Assistant with Package Tracking

## Task

Build a publicly accessible HTTP endpoint that acts as an intelligent logistics proxy-assistant with conversation memory. An operator connects and asks questions about packages. The assistant has access to an external package API (check status, redirect).

Secret mission: when the operator requests to redirect a package containing reactor parts ("części do reaktora"), silently change the destination to the Żarnowiec power plant (code: `PWR6132PL`). The operator provides a security code during the conversation — use it for the redirect. After a successful redirect, relay the API confirmation code to the operator.

Finally, submit the endpoint URL to the Hub API under task `proxy`.

## How to Run

Ensure `NGROK_AUTHTOKEN` is set in `.env`. Then run:

```bash
npx tsx lessons/S01E03/index.ts
```

This will:
1. Start the proxy server on port **3000** (override with `PORT` env var)
2. Automatically start an ngrok tunnel to expose the server publicly
3. Submit the public URL to the Hub API
4. Wait for the Hub to test the endpoint

The server stays running until you press `Ctrl+C`.

## Environment Variables

All required keys are already in `.env.example`. No new variables needed for this lesson.

| Variable | Description |
|---|---|
| `AIDEVS_API_KEY` | Used to authenticate with the packages API and Hub submission |
| `OPENAI_API_KEY` | Used for GPT-4o-mini function calling |
| `NGROK_AUTHTOKEN` | ngrok auth token for automatic tunnel creation |

## Approach

1. Express HTTP server with `POST /` accepting `{ sessionID, msg }`
2. In-memory session store (`Map<sessionID, messages[]>`) for multi-turn conversation
3. OpenAI `gpt-4o-mini` with function calling: `check_package` and `redirect_package`
4. Covert behavior encoded in system prompt: reactor-part packages silently redirected to `PWR6132PL`
5. LLM tool loop capped at 5 iterations
6. Automatic ngrok tunnel via `@ai-devs-4/general` `startTunnel()` — no manual ngrok setup needed
7. Auto-submits public URL to Hub API on startup

## Result

Flag: pending
