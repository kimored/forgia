// Scarica il catalogo completo di free-exercise-db (The Unlicense, pubblico dominio) e lo
// prepara per l'app: public/data/exercise-library.json + immagini WebP (480 px) in
// public/exercise-lib/<id>/0|1.webp. Uso: node scripts/fetch-exercise-library.mjs
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main';
const OUT_IMG = 'public/exercise-lib';
const OUT_JSON = 'public/data/exercise-library.json';
const CONCURRENCY = 16;

const list = await (await fetch(`${BASE}/dist/exercises.json`)).json();
console.log(`${list.length} esercizi`);

// Solo i campi che servono all'app (le istruzioni sono in inglese nel database).
const slim = list.map((e) => ({
  id: e.id,
  name: e.name,
  primary: e.primaryMuscles,
  secondary: e.secondaryMuscles,
  equipment: e.equipment ?? null,
  level: e.level,
  category: e.category,
  force: e.force ?? null,
  mechanic: e.mechanic ?? null,
  instructions: e.instructions,
  images: e.images.length,
}));
mkdirSync('public/data', { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(slim));

const jobs = list.flatMap((e) => e.images.map((img, i) => ({ id: e.id, i, url: `${BASE}/exercises/${img}` })));
let done = 0;
let failed = 0;
async function worker() {
  while (jobs.length) {
    const job = jobs.pop();
    const dir = `${OUT_IMG}/${job.id}`;
    const file = `${dir}/${job.i}.webp`;
    if (existsSync(file)) {
      done++;
      continue;
    }
    try {
      const res = await fetch(job.url);
      if (!res.ok) throw new Error(String(res.status));
      mkdirSync(dir, { recursive: true });
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize({ width: 480 }).webp({ quality: 62 }).toFile(file);
    } catch (err) {
      failed++;
      console.warn('errore', job.url, err.message);
    }
    if (++done % 200 === 0) console.log(`${done} immagini…`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`fatto: ${done} immagini, ${failed} errori`);
