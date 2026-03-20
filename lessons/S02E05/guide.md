# S02E05 — Drone Task: Full Guide

## Task Translation (from Polish)

### Narrative

We already know what the System Security Department is planning. They want to raze the Zarnowiec power plant to the ground. However, we have a way to thwart their plans. The bombardment of our temporary base is scheduled for the upcoming week, but we will make a preemptive move. Remember how we recently had problems with core cooling? Let's get ourselves cooling from a nearby lake.

We have seized control of an armed drone equipped with an explosive payload. Your task is to program it so that it sets out on a mission to bomb the required target, but the bomb should actually fall not on the power plant, but on a nearby **dam**. If everything goes according to plan, we should effectively bring water to the cooling system. If you make a mistake, at least the problem of water shortage will be replaced by a flood problem — let's call it "sustainable development" ;)

### Key Identifiers

- **Power plant identification code:** `PWR6132PL`
- **Task name:** `drone`

### Data Sources

- **Drone API documentation (HTML):** `https://hub.ag3nts.org/dane/drone.html`
- **Terrain map of the power plant area:** `https://hub.ag3nts.org/data/{YOUR_API_KEY}/drone.png`
  - The map is divided by a grid into sectors
  - Water color near the dam has been intentionally intensified to make it easier to locate

### Communication with Hub

Send drone instructions to the `/verify` endpoint:

```json
{
  "apikey": "your-api-key",
  "task": "drone",
  "answer": {
    "instructions": ["instruction1", "instruction2", "..."]
  }
}
```

The API returns error messages if something is wrong — read them carefully and adjust instructions. When the response contains `{FLG:...}`, the task is complete.

---

## Step-by-Step Instructions

1. **Analyze the map visually** — you can send the image URL to a vision model (no need to download). Count grid columns and rows. Locate the sector with the dam.
2. **Note the column and row number** of the dam sector in the grid (indexing from 1).
3. **Read the drone API documentation** at the provided URL.
4. **Based on the documentation**, identify the required instructions.
5. **Send the instruction sequence** to the `/verify` endpoint.
6. **Read the response** — if the API returns an error, adjust instructions and resend.
7. When `{FLG:...}` appears in the response, the task is complete.

---

## Hints

- **Image analysis:** A vision-capable model is needed to locate the dam on the map. Use a two-stage approach: first analyze the map with a vision model to identify the dam sector, then use that information in an agent loop with a text model. `openai/gpt-4o` handles counting grid columns and rows well; `openai/gpt-5.4` is even better at this. Correctly locating the map sector is critical.
- **Documentation full of traps:** The drone docs intentionally contain many conflicting function names that behave differently depending on parameters. You don't need to use all of them — focus on what's actually needed to execute the mission. Save tokens and configure only what's necessary.
- **Reactive approach:** You don't need to figure out the entire documentation before your first attempt. The API returns precise error messages — you can send your best attempt and correct based on feedback. Iterative adjustment is the natural strategy here.
- **Reset:** If you mess up the drone configuration badly, the documentation includes a `hardReset` function. Useful when subsequent errors stem from accumulated previous mistakes.

---

## Drone API Reference (DRN-BMB7)

### Endpoint

`POST /verify` with fields: `apikey` (UUID), `task` (always `"drone"`), `answer.instructions` (JSON string array, min 1 element).

### Location Control

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `setDestinationObject()` | ID format: `[A-Z]{3}[0-9]+[A-Z]{2}` | Set target object (type prefix + numeric code + country code) |
| `set()` | `x,y` coordinates | Landing sector on map (1,1 = top-left) |

### Engine Control

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `set()` | `engineON` or `engineOFF` | Enable/disable engines |
| `set()` | `0%-100%` power value | Set engine power level |

### Flight Control

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `set()` | `1m` to `100m` | Set flight altitude |
| `flyToLocation` | No parameters | Initiate flight (requires prior: altitude, target object, landing sector) |

### Mission Objectives

Set objectives (order is irrelevant — AI executes optimally):
- `set(video)` — record footage
- `set(image)` — capture photograph
- `set(destroy)` — destroy target
- `set(return)` — return to base with report

### Configuration (Optional)

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `setName()` | Alphanumeric + spaces | Assign friendly drone name |
| `setOwner()` | "FirstName LastName" | Set owner (exactly 2 words) |
| `setLed()` | HEX color `#000000` | Configure LED color |

### Diagnostics (Optional)

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `selfCheck` | None | Test onboard systems |
| `getFirmwareVersion` | None | Return firmware version |
| `getConfig` | None | Return current configuration |

### Calibration (Optional)

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `calibrateCompass` | None | Calibrate spatial orientation |
| `calibrateGPS` | None | Calibrate GPS transceiver |

### Service

| Function | Parameters | Purpose |
|----------|-----------|---------|
| `hardReset` | None | Restore factory configuration |

### Key Note

The DRN-BMB7 model always carries one small-range explosive payload.
