import { fileURLToPath } from 'url';
import { config, submitAnswer } from '@ai-devs-4/general';

export const TASK = 'sendit';

// Declaration data derived from SPK documentation analysis
const DECLARATION_DATE = '2026-03-13';
const SENDER_ID = '450202122';
const ORIGIN = 'Gdańsk';
const DESTINATION = 'Żarnowiec';
const ROUTE_CODE = 'X-01';
const CATEGORY = 'A';
const CONTENTS_DESCRIPTION = 'kasety z paliwem reaktorowym';
const WEIGHT_KG = 2800;
// Standard train: 2 wagons × 500 kg = 1000 kg. Need 2800 kg total.
// Additional wagons needed: ceil((2800 - 1000) / 500) = 4
const WDP = 4;
const SPECIAL_REMARKS = 'BRAK';
// Category A is exempt from all fees (Section 9.4: "Przesyłki kat. A i B są zwolnione z opłat")
// Additional wagon fee also waived for Strategic/Medical (dodatkowe-wagony.md)
const FEE_PP = 0;

export function buildDeclaration(): string {
  return `SYSTEM PRZESYŁEK KONDUKTORSKICH - DEKLARACJA ZAWARTOŚCI
======================================================
DATA: ${DECLARATION_DATE}
PUNKT NADAWCZY: ${ORIGIN}
------------------------------------------------------
NADAWCA: ${SENDER_ID}
PUNKT DOCELOWY: ${DESTINATION}
TRASA: ${ROUTE_CODE}
------------------------------------------------------
KATEGORIA PRZESYŁKI: ${CATEGORY}
------------------------------------------------------
OPIS ZAWARTOŚCI (max 200 znaków): ${CONTENTS_DESCRIPTION}
------------------------------------------------------
DEKLAROWANA MASA (kg): ${WEIGHT_KG}
------------------------------------------------------
WDP: ${WDP}
------------------------------------------------------
UWAGI SPECJALNE: ${SPECIAL_REMARKS}
------------------------------------------------------
KWOTA DO ZAPŁATY: ${FEE_PP} PP
------------------------------------------------------
OŚWIADCZAM, ŻE PODANE INFORMACJE SĄ PRAWDZIWE.
BIORĘ NA SIEBIE KONSEKWENCJĘ ZA FAŁSZYWE OŚWIADCZENIE.
======================================================`;
}

export async function run(): Promise<{ declaration: string; flag?: string }> {
  console.log('[s01e04] Starting transport declaration task...');

  console.log('[s01e04] Route: X-01 (Gdańsk → Żarnowiec) — blocked but usable for Category A');
  console.log('[s01e04] Category: A (Strategiczna) — System-financed, 0 PP');
  console.log('[s01e04] Weight: 2800 kg, WDP: 4 additional wagons');

  const declaration = buildDeclaration();
  console.log('[s01e04] Final declaration:');
  console.log(declaration);

  console.log('[s01e04] Submitting to Hub API...');
  const result = await submitAnswer({
    task: TASK,
    answer: declaration,
  });

  console.log('[s01e04] Hub response:', result.message);

  const flag = result.message.includes('{FLG:') ? result.message : undefined;
  return { declaration, flag };
}

async function main(): Promise<void> {
  const { flag } = await run();
  if (flag) {
    console.log('[s01e04] Flag:', flag);
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch(err => {
    console.error('[s01e04] Fatal error:', err);
    process.exit(1);
  });
}
