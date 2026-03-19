# S02E04 — mailbox: Task Guide

## Task Description (Full Translation)

We have gained access to an email inbox of one of the system operators. We know that a mail from Wiktor arrived at this inbox — we don't know his last name, but we know he informed on us. We need to search the inbox via the API and extract three pieces of information:

- **date** — when (format `YYYY-MM-DD`) the security department plans to attack our power plant
- **password** — the password to the employee system, which is probably still in this inbox
- **confirmation_code** — the confirmation code from a ticket sent by the security department (format: `SEC-` + 28 characters = 32 characters total)

The inbox is actively in use — new messages may arrive while you work. You must account for this.

## What We Know at Start

- Wiktor sent an email from the domain `proton.me`
- The API works like a Gmail search engine — it supports operators: `from:`, `to:`, `subject:`, `OR`, `AND`

## Task Name

`mailbox`

## API Communication

### Endpoint

**POST** `https://hub.ag3nts.org/api/zmail`

Content-Type: `application/json`

### Available Actions

#### Check available actions (help)

```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "action": "help",
  "page": 1
}
```

#### Retrieve inbox contents

```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "action": "getInbox",
  "page": 1
}
```

The API works in two steps:
1. **Search/list** — returns a list of emails with metadata (no body content)
2. **Get message** — retrieve the full content of selected messages by their IDs

### Answer Submission

**POST** `https://hub.ag3nts.org/verify`

```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "mailbox",
  "answer": {
    "password": "<found-password>",
    "date": "2026-02-28",
    "confirmation_code": "SEC-<28-character-code>"
  }
}
```

When all three values are correct, the hub returns a flag `{FLG:...}`.

## Step-by-Step Instructions

1. Call the `help` action on the zmail API to learn all available actions and parameters.
2. Have the agent use the email search engine — based on the task description, it can build appropriate queries.
3. Retrieve the full content of found messages to read their contents.
4. Search for information one at a time — you don't need to find everything at once.
5. Use feedback from the hub to know which values are still missing or incorrect.
6. Continue searching the inbox until you gather all three values and the hub returns the flag.
7. Remember that the inbox is active — if you're searching for something and can't find it, try again, because new messages may have just arrived.

## Hints

- **Agent approach with Function Calling** — this task is perfectly suited for an agent loop with tools. The agent can have at its disposal: email search, retrieving message content by ID, submitting answers to the hub, and a tool for ending work. The loop should work iteratively — search, read, draw conclusions, search further. You can also take a more general approach and let the agent simply make API calls with parameters it determines based on the help output.

- **Two-step data retrieval** — the zmail API works in two steps: first you search and get a list of emails with metadata (without content), and only then you retrieve the full content of selected messages by their identifiers. Don't try to guess content based on the subject alone — always retrieve the full message before drawing conclusions.

- **Active inbox** — the inbox is constantly in use and new messages may arrive while you work. If you've searched the entire inbox and can't find something, it's worth trying again — the information you're looking for may have just arrived. Don't immediately assume the information doesn't exist.

- **Model choice** — a cheaper model like `google/gemini-3-flash-preview` is sufficient for this task. The task involves searching and extracting facts, not complex reasoning. A more expensive model (`anthropic/claude-sonnet-4-6`) won't provide a significant advantage here, and the agent loop may execute a dozen or more LLM queries.

- **Search operators** — the API supports Gmail-like syntax. You can combine operators. You can start with broad queries to avoid missing important emails, then narrow the search.

## Values to Extract

| Value | Format | Source Hint |
|---|---|---|
| `date` | `YYYY-MM-DD` | Date when the security department plans to attack the power plant |
| `password` | Free text | Password to the employee system, somewhere in the inbox |
| `confirmation_code` | `SEC-` + 28 characters (32 total) | From a ticket sent by the security department |

## Key Constraints

- The inbox is **dynamic** — new emails can arrive at any time
- Always retrieve **full message content** before extracting data
- Use **iterative search** — broad first, then narrow
- Use **hub feedback** to determine which values are still wrong/missing
- The answer object must contain all three fields simultaneously
