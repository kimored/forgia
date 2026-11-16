// Genera le icone PNG della PWA a partire da public/icons/icon.svg
// Uso: node scripts/icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icons/icon.svg');
const out = 'public/icons';

// "any": icona piena con angoli arrotondati; "maskable": fondo pieno a tutta area (safe zone 80%)
const rounded = Buffer.from(
  svg.toString().replace('<rect width="512" height="512"', '<rect width="512" height="512" rx="112"'),
);

for (const size of [192, 512]) {
  await sharp(rounded).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
  await sharp(svg).resize(Math.round(size * 0.8), Math.round(size * 0.8))
    .extend({ top: Math.round(size * 0.1), bottom: Math.round(size * 0.1), left: Math.round(size * 0.1), right: Math.round(size * 0.1), background: '#1a1c1e' })
    .resize(size, size).png().toFile(`${out}/maskable-${size}.png`);
}
await sharp(svg).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);
await sharp(rounded).resize(32, 32).png().toFile('public/favicon.png');
console.log('Icone generate');
