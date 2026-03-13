# S01E04 — Task Guide (English Translation)

## Task Description

You must submit a correctly filled transport declaration in the Konduktor Shipment System (SPK) to the Central Hub. The document is verified by both humans and automated systems, so every field must be valid.

Since the budget is zero, you must prepare the data so that the shipment is either free or paid for by the System itself. The transport route is from **Gdańsk** to **Żarnowiec**.

We obtained a fake sender ID (**450202122**) which should pass verification. The package weighs approximately **2.8 tons** (2800 kg). Do not add any special remarks — they always trigger manual review of such shipments.

For the contents description, write exactly what it is — these are our **reactor fuel cassettes**. We're not hiding it because we're redirecting a real package. Don't worry that the route we want to use is closed — we'll handle that later.

The shipment documentation is available at: `https://hub.ag3nts.org/dane/doc/index.md`

## Shipment Data

| Field | Value |
|---|---|
| Sender ID | `450202122` |
| Origin point | Gdańsk |
| Destination point | Żarnowiec |
| Weight | 2800 kg (2.8 tons) |
| Budget | 0 PP (must be free or System-financed) |
| Contents | Reactor fuel cassettes |
| Special remarks | None — do not add any |

## Submission Format

Send via POST to `https://hub.ag3nts.org/verify`:

```json
{
  "apikey": "<your-api-key>",
  "task": "sendit",
  "answer": {
    "declaration": "<full declaration text here>"
  }
}
```

The `declaration` field contains the full text of the filled declaration — with exact formatting, separators, and field order matching the template from the documentation.

## Step-by-Step Approach

1. **Fetch the documentation** — start from `index.md`. It is the main file but NOT the only one — it references many other files (attachments, separate data files). Fetch and read all files that may be needed for filling the declaration.
2. **Watch for image files** — some documentation is delivered as image files. These require processing with a vision-capable model.
3. **Find the declaration template** — the documentation contains a form template. Fill every field according to the shipment data and the regulations.
4. **Determine the correct route code** — the Gdańsk → Żarnowiec route requires checking the connection network and route list.
5. **Calculate or determine the fee** — the SPK regulations contain a fee table. The fee depends on the package category, weight, and route distance. Budget is 0 PP — look for categories financed by the System.
6. **Submit the declaration** — send the completed text to `/verify`. If the Hub rejects it with an error, read the message carefully — it will contain hints about what to fix.
7. **Done** — if everything is correct, the Hub returns a flag `{FLG:...}`.

## Hints

- **Read ALL documentation**, not just `index.md` — the SPK regulations span many files. Answers about categories, fees, routes, and the declaration template may be in different attachments.
- **Do not skip image files** — the documentation contains at least one image file. Data in it may be essential for correctly filling the declaration.
- **The declaration template is strict** — formatting must be preserved exactly as in the template. The Hub verifies both values and document format.
- **Abbreviations** — if you encounter an abbreviation you don't understand, use the documentation to figure out what it means.
