# S01E01 — People Filter & Tagging

## Task

Fetch a CSV of people who survived the "Great Correction", filter them by specific criteria, tag their professions using an LLM with Structured Output, and submit the filtered+tagged list to the Hub API.

## Approach

1. **Fetch CSV** — `GET https://hub.ag3nts.org/data/<API_KEY>/people.csv` (auto-detects `;` or `,` delimiter)
2. **Filter** — Keep only records where `gender === 'M'`, `city === 'Grudziądz'`, and `born` is between 1986–2006 (age 20–40 in 2026)
3. **Tag professions** — Single batch OpenAI call (`gpt-4o-mini`) with `response_format: json_schema` (structured output)
4. **Filter by tag** — Keep only people whose tags include `transport`
5. **Submit** — POST answer array to Hub API (`task: 'people'`)

## Result

Flag: `pending`

## Reusable Patterns

- Structured output via `openai.chat.completions.create` with `response_format: json_schema`
- CSV parsing with auto-delimiter detection
- Batch LLM tagging (all items in a single API call)
