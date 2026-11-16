// GitHub Pages: serve 404.html per i path sconosciuti → lo rendiamo uguale a index.html
// così il routing di Angular funziona anche ricaricando /app-dieta-palestra/oggi.
import { copyFileSync, writeFileSync } from 'node:fs';

const dist = 'dist/app-dieta-palestra/browser';
copyFileSync(`${dist}/index.html`, `${dist}/404.html`);
writeFileSync(`${dist}/.nojekyll`, '');
console.log('404.html e .nojekyll creati');
