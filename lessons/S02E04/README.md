# S02E04 — mailbox

## Task

Search an operator's email inbox via the **zmail API** to extract three values and submit them to the Hub API.

### Values to Extract

| Value | Format | Source Hint |
|---|---|---|
| `date` | `YYYY-MM-DD` | Date when the security department plans to attack the power plant |
| `password` | Free text | Password to the employee system, somewhere in the inbox |
| `confirmation_code` | `SEC-` + 28 characters (32 total) | From a ticket sent by the security department |

## Approach

1. Call `help` action on the zmail API to discover available actions
2. Search for Wiktor's email (`from:proton.me`) and security-related keywords
3. Retrieve full message content for each result
4. Extract target values using regex patterns
5. Submit answer to Hub API, use feedback to refine search
6. Retry with broader queries if needed (inbox is dynamic)

## Key Constraints

- Inbox is dynamic — new emails can arrive at any time
- Two-step retrieval: search → get full message
- Gmail-like search operators: `from:`, `to:`, `subject:`, `OR`, `AND`
