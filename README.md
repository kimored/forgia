# Forgia

**Nutrizione & Allenamento**

PWA personale (Angular 22) per dieta, palestra, dispensa e progressi. Funziona offline, senza backend.

## Privacy

Il repository contiene **solo** il piano generico (dieta, allenamenti, prodotti) e valori di default.
Tutti i dati personali (profilo, peso, misure, log) si inseriscono nell'app e restano in IndexedDB
sul dispositivo; finiscono solo nell'export JSON di backup.

## Sviluppo

```bash
npm install
npm start            # http://localhost:4200
npm run test:ci      # test unitari (Vitest)
npm run build:pages  # build per GitHub Pages (base-href /app-dieta-palestra/ + 404.html)
npm run icons        # rigenera le icone PNG da public/icons/icon.svg
```

Il service worker è attivo solo nella build di produzione.

## Deploy su GitHub Pages

Il workflow `.github/workflows/deploy.yml` esegue test e build e pubblica a ogni push su `main`.
Configurazione una tantum sul repo `app-dieta-palestra`:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Il repo deve essere pubblico (Pages gratuito), oppure serve un piano a pagamento.
3. Nessun secret richiesto.

L'app sarà su `https://<utente>.github.io/app-dieta-palestra/`.
Se cambi nome al repo, aggiorna `--base-href` nello script `build:pages`.

## Installazione

- **iPhone / iPad**: Safari → Condividi → Aggiungi alla schermata Home.
- **Android**: Chrome → banner o menu → Installa app (o il bottone in Impostazioni).

## Funzioni

- **Oggi / Settimana**: menu del giorno dal piano caricato, varianti con gli avvisi delle regole del piano.
- **Il mio piano**: import da PDF, Word, foto/scansioni o testo (lettura sul dispositivo), editor per la revisione.
- **Dispensa**: generata dagli alimenti del piano, scalo automatico, lista spesa, storico prezzi per negozio.
- **Allenamento**: scheda del giorno per fase, registro serie, timer di recupero, progressione, storico.
- **Progressi**: peso (anche da screenshot della bilancia) con le curve del piano, composizione, misure, aderenza.

Forgia **non è un dispositivo medico**: aiuta a seguire il piano del proprio nutrizionista o dietologo.

## Licenze di terze parti

- Immagini degli esercizi: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (The Unlicense, pubblico dominio).
- OCR: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache 2.0) e modelli tessdata (Apache 2.0).
- PDF: [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0). Word: [mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2).
