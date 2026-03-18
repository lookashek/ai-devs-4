# S02E03 — Task Guide (English Translation & Reference)

## Task Description (Full Translation)

### Task

Yesterday, a power plant experienced a failure. You have access to the full system log file from that day — but it is enormous. Your task is to prepare a condensed version of the logs that:

* Contains **only events relevant to the failure analysis** (power supply, cooling, water pumps, software, and other power plant subsystems),
* Fits within **1500 tokens**,
* Preserves a **multi-line format** — one event per line.

You send the condensed logs to Centrala (the Hub). Technicians verify whether a failure root-cause analysis can be performed based on your condensed logs. If yes — you receive a flag.

**Task name:** `failure`

### Where to get the data?

Download the full log file from:

```
https://hub.ag3nts.org/data/{AIDEVS_API_KEY}/failure.log
```

Replace `{AIDEVS_API_KEY}` with the actual API key from the environment.

### How to submit the answer?

**POST** to `https://hub.ag3nts.org/verify`:

```json
{
  "apikey": "{AIDEVS_API_KEY}",
  "task": "failure",
  "answer": {
    "logs": "[2026-02-26 06:04] [CRIT] ECCS8 runaway outlet temp. Protection interlock initiated reactor trip.\n[2026-02-26 06:11] [WARN] PWR01 input ripple crossed warning limits.\n[2026-02-26 10:15] [CRIT] WTANK07 coolant below critical threshold. Hard trip initiated."
  }
}
```

The `logs` field is a **string** — lines are separated by `\n`. Each line is one event.

### Formatting Requirements

* **One line = one event** — do not combine multiple events into a single line.
* **Date in YYYY-MM-DD format** — technicians need to know which day the event occurred.
* **Time in HH:MM or H:MM format** — to place the event in time.
* **You may shorten and paraphrase** — what matters is preserving: timestamp, severity level, and subsystem identifier.
* **Do not exceed 1500 tokens** — this is a hard limit of the Centrala system. You can check token count at https://platform.openai.com/tokenizer

### What to do (step by step from the task)

1. **Download the log file** — check its size. How many lines? How many tokens does the entire file take?
2. **Filter relevant events** — from thousands of entries, select only those related to power plant subsystems and the failure. How can you determine which events materially contributed to the failure? Which are most important?
3. **Compress to fit the limit** — ensure the output file fits within 1500 tokens. You may shorten event descriptions, as long as key information is preserved.
4. **Submit and read the response** — Centrala returns detailed feedback from technicians: what is missing, which subsystems are unclear or insufficiently described. Use this feedback to improve the logs.
5. **Fix and resubmit** — iterate based on feedback until technicians confirm completeness and you receive the flag `{FLG:...}`.

### Hints (from the task)

* The log file is large — how can you sensibly search it? Which model can help? Expensive models will generate high costs if you repeatedly work on large datasets.
* Technician feedback is very precise — Centrala tells you exactly which subsystems could not be analyzed. This is a valuable hint about what is missing from the logs — use it to supplement the output file.
* Should you start by sending everything relevant? — How many tokens do just the WARN/ERROR/CRIT events take? Will they fit within the limit without further compression? Or is it better to start with a smaller set and add based on feedback? Consider which approach yields faster results.
* Count tokens before sending — sending logs that exceed the limit will result in rejection. Build token counting as a separate step before verification. Use a conservative conversion ratio.
* Agent approach — this task is well suited for automation by an agent with Function Calling that can: search the file, build the output log, count tokens, and iteratively submit to verification based on feedback. It's worth having a tool to search logs, instead of keeping them entirely in the main agent's memory. A sub-agent can handle the searching.

---

## Goal

Produce a condensed string of power plant log entries (one event per line, `\n`-separated) that:
1. Fits within 1500 tokens
2. Contains enough information for technicians to analyze the root cause of the failure
3. Preserves timestamp, severity level, and subsystem ID for each event

Submit to Hub API as `task: "failure"` with `answer: { logs: "<condensed-logs-string>" }`.

---

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `https://hub.ag3nts.org/data/{AIDEVS_API_KEY}/failure.log` | GET | Download the full log file |
| `https://hub.ag3nts.org/verify` | POST | Submit condensed logs and receive feedback or flag |

---

## Input Format

The raw log file (`failure.log`) — a large text file with many log entries. Expected format per line (based on the example):
```
[YYYY-MM-DD HH:MM] [LEVEL] SUBSYSTEM_ID description text
```

Severity levels observed: `CRIT`, `WARN`, `ERRO` (and possibly `INFO`, `DEBUG`).

---

## Output Format

A JSON payload:
```json
{
  "apikey": "<AIDEVS_API_KEY>",
  "task": "failure",
  "answer": {
    "logs": "<condensed-log-lines-separated-by-\\n>"
  }
}
```

Each line in `logs` should contain: timestamp, severity level, subsystem identifier, and a brief description.

---

## Constraints & Edge Cases

* **1500 token hard limit** — exceeding it causes rejection. Use conservative estimates (~4 chars per token, or use a tokenizer).
* **Iterative feedback** — the Hub API response tells you exactly which subsystems are missing. This is the key mechanism for converging on the correct answer.
* **Compression is required** — raw WARN/CRIT/ERRO entries likely exceed 1500 tokens. You must paraphrase and shorten.
* **Subsystem coverage** — the task mentions: power supply, cooling, water pumps, software, and other power plant subsystems. All relevant subsystems must be represented.
* **Do not lose critical events** — especially CRIT-level events that directly describe the failure sequence.

---

## Additional Context (Strategy Tips)

1. **Don't read the entire file into LLM context** — stream/read line by line, filter mechanically first.
2. **Two-stage filtering:**
   - Stage 1 (mechanical): extract only CRIT / ERROR / WARN lines + keyword matches (coolant, pump, power, reactor, temp, pressure).
   - Stage 2 (logical): keep only events that contribute to failure analysis; drop noise (retry, debug, heartbeat).
3. **Aggressive compression:** From each log, keep only timestamp, level, component ID, and 1 sentence of meaning. Remove redundant details and repeated information.
4. **Token budget:** ~1 line ≈ 20–40 tokens → aim for max ~40–60 lines.
5. **Group similar events:** If 10 similar warnings exist, keep only 1–2 representative ones (first + worst).
6. **Iterate with API feedback:** Don't try for perfection on first attempt. Submit "good enough" → read feedback → add missing components → repeat.
7. **Mindset:** This is NOT a "find everything" task — it's "find the minimum needed for diagnosis."
