import { Router } from 'express';
import { config, getFromStore, saveToStore } from '@ai-devs-4/general';
import {
  TASK,
  HUB_URL,
  API_DELAY_MS,
  haversineKm,
  delay,
  fetchLocationsJson,
  resolveCoordinates,
  fetchSuspectLocations,
  fetchAccessLevel,
  type Suspect,
  type Coordinate,
} from '@ai-devs-4/s01e02';

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface RunResponse {
  steps: LogEntry[];
  flag?: string;
}

export const s01e02Router = Router();

s01e02Router.post('/run', async (_req, res): Promise<void> => {
  const steps: LogEntry[] = [];
  const log = (message: string, level: LogEntry['level'] = 'info'): void => {
    steps.push({ message, level });
    console.log(`[s01e02/${level}] ${message}`);
  };

  try {
    // Step 1: Load suspects
    const suspects = getFromStore<Suspect[]>('s01e01_suspects');
    if (!suspects || suspects.length === 0) {
      log('No suspects in store. Run S01E01 first.', 'error');
      res.status(400).json({ steps } satisfies RunResponse);
      return;
    }
    log(`Loaded ${suspects.length} suspects from data store`);

    // Step 2: Fetch power plant locations
    log('Fetching power plant locations...');
    const rawLocations = await fetchLocationsJson();
    log(`Raw locations JSON: ${JSON.stringify(rawLocations)}`);
    const plants = await resolveCoordinates(rawLocations);
    log(`Resolved ${plants.length} power plant locations`);

    // Step 3: Fetch sightings and compute distances
    interface BestMatch {
      suspect: Suspect;
      sighting: Coordinate;
      plant: { name: string; code?: string; coords: Coordinate };
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

    // Step 4: Fetch access level
    log(`Fetching access level for ${globalMin.suspect.name} ${globalMin.suspect.surname}...`);
    const accessLevel = await fetchAccessLevel(
      globalMin.suspect.name,
      globalMin.suspect.surname,
      globalMin.suspect.born,
    );
    log(`Access level: ${accessLevel}`);

    // Step 5: Submit answer
    log(`Closest plant details: name=${globalMin.plant.name} code=${globalMin.plant.code ?? 'MISSING'}`);
    const answer = {
      name: globalMin.suspect.name,
      surname: globalMin.suspect.surname,
      accessLevel,
      powerPlant: globalMin.plant.code ?? globalMin.plant.name,
    };

    log(`ANSWER PAYLOAD: ${JSON.stringify(answer)}`);
    log(`Submitting answer to Hub API (task: ${TASK})...`);
    const hubRes = await fetch(`${HUB_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: config.AIDEVS_API_KEY, task: TASK, answer }),
    });
    const hubData = (await hubRes.json()) as { code: number; message: string };
    log(`Hub API raw response: ${JSON.stringify(hubData)}`, hubData.code === 0 ? 'success' : 'warn');

    saveToStore('s01e02_flag', hubData.message);

    res.json({ steps, flag: hubData.message } satisfies RunResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Error: ${message}`, 'error');
    res.status(500).json({ steps } satisfies RunResponse);
  }
});
