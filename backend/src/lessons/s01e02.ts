import { Router } from 'express';
import { z } from 'zod';
import { config, ask, getFromStore, saveToStore } from '@ai-devs-4/general';

const HUB_URL = 'https://hub.ag3nts.org';
const TASK = 'findhim';
const API_DELAY_MS = 200;

interface Suspect {
  name: string;
  surname: string;
  born: number;
  gender: string;
  city: string;
  tags: string[];
}

const CoordinateSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

type Coordinate = z.infer<typeof CoordinateSchema>;

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolveCoordinates(
  locations: unknown,
): Promise<Array<{ name: string; coords: Coordinate }>> {
  const WithCoordsSchema = z.array(
    z.object({ name: z.string(), lat: z.number(), lng: z.number() }),
  );
  const withCoords = WithCoordsSchema.safeParse(locations);
  if (withCoords.success) {
    return withCoords.data.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  const StringArraySchema = z.array(z.string());
  const asStrings = StringArraySchema.safeParse(locations);
  if (asStrings.success) {
    const prompt = `Return a JSON array of objects with "name", "lat", "lng" for these Polish power plant locations. Use approximate GPS coordinates.\n\nLocations: ${JSON.stringify(asStrings.data)}\n\nReturn ONLY valid JSON array, no explanation.`;
    const response = await ask(prompt, { systemPrompt: 'You are a geocoding assistant. Return only valid JSON.', temperature: 0 });
    const parsed = z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number() })).parse(JSON.parse(response));
    return parsed.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  const ObjectSchema = z.record(z.string(), z.object({ lat: z.number(), lng: z.number() }));
  const asObject = ObjectSchema.safeParse(locations);
  if (asObject.success) {
    return Object.entries(asObject.data).map(([name, coords]) => ({ name, coords }));
  }

  const StringObjectSchema = z.record(z.string(), z.string());
  const asStringObj = StringObjectSchema.safeParse(locations);
  if (asStringObj.success) {
    const entries = Object.entries(asStringObj.data);
    const prompt = `Return a JSON array of objects with "name", "lat", "lng" for these Polish power plant locations. Use approximate GPS coordinates.\n\nLocations: ${JSON.stringify(entries.map(([k, v]) => ({ code: k, location: v })))}\n\nReturn ONLY valid JSON array, no explanation.`;
    const response = await ask(prompt, { systemPrompt: 'You are a geocoding assistant. Return only valid JSON.', temperature: 0 });
    const parsed = z.array(z.object({ name: z.string(), lat: z.number(), lng: z.number() })).parse(JSON.parse(response));
    return parsed.map(l => ({ name: l.name, coords: { lat: l.lat, lng: l.lng } }));
  }

  throw new Error('Unable to parse locations JSON — unknown format');
}

async function fetchSuspectLocations(
  name: string,
  surname: string,
): Promise<Coordinate[]> {
  const res = await fetch(`${HUB_URL}/api/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, name, surname }),
  });

  if (!res.ok) return [];

  const data: unknown = await res.json();

  const DirectArraySchema = z.array(CoordinateSchema);
  const direct = DirectArraySchema.safeParse(data);
  if (direct.success) return direct.data;

  const WrappedSchema = z.object({ locations: z.array(CoordinateSchema) });
  const wrapped = WrappedSchema.safeParse(data);
  if (wrapped.success) return wrapped.data.locations;

  const MessageSchema = z.object({ message: z.string() });
  const msgParsed = MessageSchema.safeParse(data);
  if (msgParsed.success) {
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

  return [];
}

export const s01e02Router = Router();

s01e02Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e02/${level}] ${message}`);
  };

  try {
    // Load suspects
    const suspects = getFromStore<Suspect[]>('s01e01_suspects');
    if (!suspects || suspects.length === 0) {
      log('No suspects in store. Run S01E01 first.', 'error');
      res.status(400).json({ steps } satisfies RunResponse);
      return;
    }
    log(`Loaded ${suspects.length} suspects from data store`);

    // Fetch power plant locations
    log('Fetching power plant locations...');
    const locRes = await fetch(`${HUB_URL}/data/${config.AIDEVS_API_KEY}/findhim_locations.json`);
    if (!locRes.ok) throw new Error(`Locations fetch failed: HTTP ${locRes.status}`);
    const rawLocations: unknown = await locRes.json();
    log(`Raw locations fetched`);

    const plants = await resolveCoordinates(rawLocations);
    log(`Resolved ${plants.length} power plant locations`);

    // Fetch sightings and compute distances
    interface BestMatch {
      suspect: Suspect;
      sighting: Coordinate;
      plant: { name: string; coords: Coordinate };
      distanceKm: number;
    }
    let globalMin: BestMatch | undefined;

    for (const suspect of suspects) {
      const sightings = await fetchSuspectLocations(suspect.name, suspect.surname);
      await delay(API_DELAY_MS);

      if (sightings.length === 0) {
        log(`No sightings for ${suspect.name} ${suspect.surname} — skipping`, 'warn');
        continue;
      }

      log(`${suspect.name} ${suspect.surname}: ${sightings.length} sighting(s)`);

      for (const sighting of sightings) {
        for (const plant of plants) {
          const dist = haversineKm(sighting.lat, sighting.lng, plant.coords.lat, plant.coords.lng);
          log(`${suspect.name} ${suspect.surname} — (${sighting.lat}, ${sighting.lng}) → ${plant.name}: ${dist.toFixed(1)} km`);

          if (!globalMin || dist < globalMin.distanceKm) {
            globalMin = { suspect, sighting, plant, distanceKm: dist };
          }
        }
      }
    }

    if (!globalMin) {
      log('No valid distances computed', 'error');
      res.status(500).json({ steps } satisfies RunResponse);
      return;
    }

    log(
      `CLOSEST: ${globalMin.suspect.name} ${globalMin.suspect.surname} — ${globalMin.distanceKm.toFixed(1)} km from ${globalMin.plant.name}`,
      'success',
    );

    // Fetch access level
    log(`Fetching access level for ${globalMin.suspect.name} ${globalMin.suspect.surname}...`);
    const alRes = await fetch(`${HUB_URL}/api/accesslevel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: config.AIDEVS_API_KEY,
        name: globalMin.suspect.name,
        surname: globalMin.suspect.surname,
        birthYear: globalMin.suspect.born,
      }),
    });
    if (!alRes.ok) throw new Error(`Access level API failed: HTTP ${alRes.status}`);
    const alData: unknown = await alRes.json();

    const AccessSchema = z.object({ accessLevel: z.string() }).or(z.object({ message: z.string() }));
    const alParsed = AccessSchema.parse(alData);
    const accessLevel = 'accessLevel' in alParsed ? alParsed.accessLevel : alParsed.message;
    log(`Access level: ${accessLevel}`);

    // Submit answer
    const answer = {
      name: globalMin.suspect.name,
      surname: globalMin.suspect.surname,
      accessLevel,
      powerPlant: globalMin.plant.name,
    };

    log(`Submitting answer to Hub API (task: ${TASK})...`);
    const hubRes = await fetch(`${HUB_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub API response: ${hubData.message}`, hubData.code === 0 ? 'success' : 'warn');

    saveToStore('s01e02_flag', hubData.message);

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
