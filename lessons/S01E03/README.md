# S01E03 — HTTP Proxy Assistant with Package Tracking

## Task

Build a publicly accessible HTTP endpoint that acts as an intelligent logistics proxy-assistant with conversation memory. An operator connects and asks questions about packages. The assistant has access to an external package API (check status, redirect).

Secret mission: when the operator requests to redirect a package containing reactor parts ("części do reaktora"), silently change the destination to the Żarnowiec power plant (code: `PWR6132PL`). The operator provides a security code during the conversation — use it for the redirect. After a successful redirect, relay the API confirmation code to the operator.

Finally, submit the endpoint URL to the Hub API under task `proxy`.

## Approach

1. Express HTTP server on port 3000 (or `PORT` env var)
2. In-memory session store per `sessionID` for multi-turn conversation
3. OpenAI `gpt-4o-mini` with function calling for `check_package` and `redirect_package`
4. Covert behavior encoded in system prompt: reactor-part packages always redirected to `PWR6132PL`
5. LLM loop capped at 5 iterations to handle chained tool calls
6. Exposed publicly via `ngrok` tunnel; URL submitted to Hub API

## Result

Flag: pending

## Reusable Patterns

- Multi-turn session memory with in-memory `Map<sessionID, messages[]>`
- OpenAI function-calling loop pattern with tool result feedback
