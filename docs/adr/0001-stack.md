# ADR 0001 — Stack della web app

Data: 2026-09-17. Stato: accettato.

## Contesto

Bloodio è una PWA local-first che legge referti di laboratorio (PDF testuali, scansioni, foto), li fa verificare all'utente e ne traccia i valori nel tempo. Nessun backend, nessun dato fuori dal dispositivo. La fase 2 porta la stessa app su iOS con il massimo riuso di codice.

## Opzioni

**A. React + Vite + TypeScript come PWA, poi Capacitor per iOS.** pdf.js e tesseract.js girano nel loro ambiente nativo (browser o WebView con Web Worker e WASM). Capacitor avvolge lo stesso bundle; i plugin nativi servono solo per fotocamera, Files e share sheet. Storage e OCR stanno dietro interfacce, quindi in fase 2 si possono sostituire con SQLite e Vision senza toccare l'interfaccia. I grafici su canvas rendono allo stesso modo su web e iOS.

**B. Expo / React Native con target web.** Interfaccia nativa su iOS, ma pdf.js, tesseract.js e Dexie non girano in React Native: servirebbero una WebView nascosta o librerie native diverse, cioè due implementazioni di lettura PDF, OCR e storage. Il supporto PWA e service worker di Expo web è debole. Il riuso reale è più basso di A.

**C. Svelte o Solid + Vite, poi Capacitor.** Stessi vantaggi di A con un bundle di interfaccia più piccolo di 30-40 KB. Risparmio irrilevante rispetto agli asset OCR (decine di MB) ed ecosistema più ridotto per componenti accessibili e test.

## Decisione

Opzione A. Librerie: Dexie (IndexedDB), pdfjs-dist, tesseract.js, uPlot (grafici su canvas, circa 50 KB, bande tra serie, PNG con `canvas.toBlob`), React Router con routing a hash, vite-plugin-pwa, zod per validare l'import, Archivo variabile in bundle, CSS Modules con variabili, i18n con dizionario TypeScript tipizzato. Test: Vitest, Testing Library, fake-indexeddb, Playwright.

TypeScript è fissato a `~6.0.3` perché typescript-eslint 8 dichiara compatibilità fino a `<6.1.0`.

## Conseguenze

- Riuso previsto in fase 2 intorno al 95%: cambia solo ciò che è nativo per necessità.
- IndexedDB dentro WKWebView è soggetto a eviction: la fase 2 valuta uno storage nativo dietro la stessa interfaccia `src/storage/` (ADR dedicato).
- La dimensione del bundle è dominata dagli asset OCR; va misurata a ogni milestone in `docs/bundle-size.md`.
- Il routing a hash evita regole di rewrite su CDN statici e funziona in Capacitor.
