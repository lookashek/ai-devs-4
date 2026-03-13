# S01E04 — Transport Declaration

## Task

Fill out a transport declaration form for the SPK (System Przesyłek Konduktorskich) system and submit it to the Hub API. The shipment is reactor fuel cassettes from Gdańsk to Żarnowiec, weighing 2800 kg, using sender ID 450202122. The shipment must be free (0 PP cost) — find a package category financed by the System.

## Approach

1. Fetch all SPK documentation from the Hub (including images)
2. Extract text from images using OpenAI vision
3. Identify the declaration template, route code, and correct package category
4. Fill out the declaration and submit to Hub API

## Result

Flag: pending

## Reusable Patterns

- `general/src/file-downloader.ts` — generic file download and link-following utility
- `general/src/image-to-text.ts` — image text extraction via OpenAI vision
