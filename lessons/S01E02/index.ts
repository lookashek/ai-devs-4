import { fileURLToPath } from 'url';
import { z } from 'zod';
import { config, submitAnswer, getFromStore, saveToStore, ask } from '@ai-devs-4/general';

export const TASK = 'findhim';
export const HUB_URL = 'https://hub.ag3nts.org';
export const API_DELAY_MS = 200;

export interface Suspect {
  name: string;
  surname: string;
  born: number;
  gender: string;
  city: string;
  tags: string[];
}

export const CoordinateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export type Coordinate = z.infer<typeof CoordinateSchema>;

export interface SuspectDistance {
  suspect: Suspect;
  sighting: Coordinate;
  plant: { name: string; coords: Coordinate };
  distanceKm: number;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function stripJsonFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

export async function fetchLocationsJson(): Promise<unknown> {
  const url = `${HUB_URL}/data/${config.AIDEVS_API_KEY}/findhim_locations.json`;
  console.log(`[s01e02] Fetching power plant locations from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[s01e02] Locations fetch failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  console.log('[s01e02] Raw locations data:', JSON.stringify(data, null, 2));
  return data;
}

export async function resolveCoordinates(
  locations: unknown,
): Promise<Array<{ name: string; coords: Coordinate }>> {
  // Try to parse as array of objects with lat/lng first
  const WithCoordsSchema = z.array(
    z.object({
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
    }),
  );

  const withCoords = WithCoordsSchema.safeParse(locations);
  if (withCoords.success) {
    console.log('[s01e02] Locations already have coordinates');
    return withCoords.data.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  // Try as array of location name strings
  const StringArraySchema = z.array(z.string());
  const asStrings = StringArraySchema.safeParse(locations);
  if (asStrings.success) {
    console.log('[s01e02] Locations are strings, geocoding via LLM...');
    const prompt = `Return a JSON array of objects with "name", "lat", "lng" for these Polish power plant locations. Use approximate GPS coordinates.

Locations: ${JSON.stringify(asStrings.data)}

Return ONLY valid JSON array, no explanation.`;

    const response = await ask(prompt, {
      systemPrompt: 'You are a geocoding assistant. Return only valid JSON.',
      temperature: 0,
    });

    const parsed = z
      .array(z.object({ name: z.string(), lat: z.number(), lng: z.number() }))
      .parse(JSON.parse(stripJsonFences(response)));
    return parsed.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  // Try as object with location names as keys and coordinates as values
  const ObjectSchema = z.record(
    z.string(),
    z.object({ lat: z.number(), lng: z.number() }),
  );
  const asObject = ObjectSchema.safeParse(locations);
  if (asObject.success) {
    console.log('[s01e02] Locations are an object with coords');
    return Object.entries(asObject.data).map(([name, coords]) => ({ name, coords }));
  }

  // Try as object with string values (city names)
  const StringObjectSchema = z.record(z.string(), z.string());
  const asStringObj = StringObjectSchema.safeParse(locations);
  if (asStringObj.success) {
    console.log('[s01e02] Locations are an object with string values, geocoding via LLM...');
    const entries = Object.entries(asStringObj.data);
    const prompt = `Return a JSON array of objects with "name", "lat", "lng" for these Polish power plant locations. Use approximate GPS coordinates.

Locations: ${JSON.stringify(entries.map(([k, v]) => ({ code: k, location: v })))}

Return ONLY valid JSON array, no explanation.`;

    const response = await ask(prompt, {
      systemPrompt: 'You are a geocoding assistant. Return only valid JSON.',
      temperature: 0,
    });

    const parsed = z
      .array(z.object({ name: z.string(), lat: z.number(), lng: z.number() }))
      .parse(JSON.parse(stripJsonFences(response)));
    return parsed.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  // Try as {"power_plants": {"CityName": {"is_active": bool, "power": str, "code": str}, ...}}
  const PowerPlantsWrapperSchema = z.object({
    power_plants: z.record(z.string(), z.object({
      is_active: z.boolean(),
      power: z.string(),
      code: z.string(),
    })),
  });
  const asPowerPlants = PowerPlantsWrapperSchema.safeParse(locations);
  if (asPowerPlants.success) {
    const cityNames = Object.keys(asPowerPlants.data.power_plants);
    console.log('[s01e02] power_plants format detected, geocoding cities via LLM:', cityNames);
    const prompt = `Return a JSON array of objects with "name", "lat", "lng" for these Polish cities (power plant locations). Use approximate GPS coordinates.

Cities: ${JSON.stringify(cityNames)}

Return ONLY valid JSON array, no explanation.`;

    const response = await ask(prompt, {
      systemPrompt: 'You are a geocoding assistant. Return only valid JSON.',
      temperature: 0,
    });

    const parsed = z
      .array(z.object({ name: z.string(), lat: z.number(), lng: z.number() }))
      .parse(JSON.parse(stripJsonFences(response)));
    return parsed.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  throw new Error(`[s01e02] Unable to parse locations JSON — unknown format. Raw data: ${JSON.stringify(locations)}`);
}

export async function fetchSuspectLocations(
  name: string,
  surname: string,
): Promise<Coordinate[]> {
  const url = `${HUB_URL}/api/location`;
  const body = { apikey: config.AIDEVS_API_KEY, name, surname };

  console.log(`[s01e02] Fetching locations for ${name} ${surname}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn(`[s01e02] Location API returned HTTP ${res.status} for ${name} ${surname}`);
    return [];
  }

  const data: unknown = await res.json();
  console.log(`[s01e02] Location response for ${name} ${surname}:`, JSON.stringify(data));

  // Try to parse response — could be array of {lat, lng} or {latitude, longitude}
  const DirectArraySchema = z.array(CoordinateSchema);
  const direct = DirectArraySchema.safeParse(data);
  if (direct.success) return direct.data;

  const LatLongSchema = z.array(z.object({ latitude: z.number(), longitude: z.number() }));
  const latLong = LatLongSchema.safeParse(data);
  if (latLong.success) return latLong.data.map(l => ({ lat: l.latitude, lng: l.longitude }));

  // Try wrapped in a response object
  const WrappedSchema = z.object({ locations: z.array(CoordinateSchema) });
  const wrapped = WrappedSchema.safeParse(data);
  if (wrapped.success) return wrapped.data.locations;

  // Try as object with message containing coordinates
  const MessageSchema = z.object({ message: z.string() });
  const msgParsed = MessageSchema.safeParse(data);
  if (msgParsed.success) {
    // Try to extract coordinates from message text
    const coordRegex = /(-?\d+\.?\d*)\s*[,;]\s*(-?\d+\.?\d*)/g;
    const coords: Coordinate[] = [];
    let match: RegExpExecArray | null;
    while ((match = coordRegex.exec(msgParsed.data.message)) !== null) {
      const lat = parseFloat(match[1]!);
      const lngVal = parseFloat(match[2]!);
      if (lat >= -90 && lat <= 90 && lngVal >= -180 && lngVal <= 180) {
        coords.push({ lat, lng: lngVal });
      }
    }
    if (coords.length > 0) return coords;
  }

  console.warn(`[s01e02] Could not parse location data for ${name} ${surname}:`, data);
  return [];
}

export async function fetchAccessLevel(
  name: string,
  surname: string,
  birthYear: number,
): Promise<string> {
  const url = `${HUB_URL}/api/accesslevel`;
  const body = { apikey: config.AIDEVS_API_KEY, name, surname, birthYear };

  console.log(`[s01e02] Fetching access level for ${name} ${surname} (born ${birthYear})...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`[s01e02] Access level API failed: HTTP ${res.status}`);

  const data: unknown = await res.json();
  console.log(`[s01e02] Access level response:`, JSON.stringify(data));

  const ResponseSchema = z.object({ accessLevel: z.union([z.string(), z.number()]) }).or(
    z.object({ message: z.string() }),
  );
  const parsed = ResponseSchema.parse(data);

  if ('accessLevel' in parsed) return String(parsed.accessLevel);
  return parsed.message;
}

async function main(): Promise<void> {
  // Step 1: Load suspects from data store
  const suspects = getFromStore<Suspect[]>('s01e01_suspects');
  if (!suspects || suspects.length === 0) {
    console.error('[s01e02] No suspects in store. Run S01E01 first.');
    process.exit(1);
  }
  console.log(`[s01e02] Loaded ${suspects.length} suspects from store`);

  // Step 2: Fetch power plant locations
  const rawLocations = await fetchLocationsJson();
  const plants = await resolveCoordinates(rawLocations);
  console.log(`[s01e02] Resolved ${plants.length} power plant locations`);

  // Step 3: Fetch sighting locations for each suspect
  let globalMin: SuspectDistance | undefined;

  for (const suspect of suspects) {
    const sightings = await fetchSuspectLocations(suspect.name, suspect.surname);
    await delay(API_DELAY_MS);

    if (sightings.length === 0) {
      console.log(`[s01e02] No sightings for ${suspect.name} ${suspect.surname} — skipping`);
      continue;
    }

    // Step 4: Compute distances to all plants
    for (const sighting of sightings) {
      for (const plant of plants) {
        const dist = haversineKm(sighting.lat, sighting.lng, plant.coords.lat, plant.coords.lng);
        console.log(
          `[s01e02] ${suspect.name} ${suspect.surname} — sighting (${sighting.lat}, ${sighting.lng}) → Plant ${plant.name} (${plant.coords.lat}, ${plant.coords.lng}): ${dist.toFixed(1)} km`,
        );

        if (!globalMin || dist < globalMin.distanceKm) {
          globalMin = { suspect, sighting, plant, distanceKm: dist };
        }
      }
    }
  }

  if (!globalMin) {
    console.error('[s01e02] No valid distances computed — cannot determine closest suspect');
    process.exit(1);
  }

  console.log(
    `[s01e02] CLOSEST: ${globalMin.suspect.name} ${globalMin.suspect.surname} — ${globalMin.distanceKm.toFixed(1)} km from ${globalMin.plant.name}`,
  );

  // Step 5: Fetch access level
  const accessLevel = await fetchAccessLevel(
    globalMin.suspect.name,
    globalMin.suspect.surname,
    globalMin.suspect.born,
  );
  console.log(`[s01e02] Access level: ${accessLevel}`);

  // Step 6: Submit answer
  const answer = {
    name: globalMin.suspect.name,
    surname: globalMin.suspect.surname,
    accessLevel,
    powerPlant: globalMin.plant.name,
  };

  console.log('[s01e02] Submitting answer:', JSON.stringify(answer));
  const result = await submitAnswer({ task: TASK, answer });
  console.log('[s01e02] Flag:', result.message);

  saveToStore('s01e02_flag', result.message);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s01e02] Fatal error:', err);
    process.exit(1);
  });
}
