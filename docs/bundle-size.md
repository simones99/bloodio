# Dimensione del bundle

Misurata con `npm run build` seguito da `du -sk dist` e `ls -l dist/assets`.

| Data           | Milestone     | dist totale | JS principale (gzip dal log di Vite) | Note                                                                          |
| -------------- | ------------- | ----------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| 2026-09-17     | M1 Fondamenta | 220 KB      | 219.79 KB (68.66 KB gzip)            | Solo shell React: domain, parser e storage non sono ancora importati dalla UI |
| 2026-09-18     | M2a Primo flusso | 2280 KB      | 523 KB (161 KB gzip) | pdf.js è in un chunk separato caricato alla scelta del file (430 KB + worker 1265 KB); Archivo latin 90 KB |

Gli asset OCR (core WASM e traineddata) entrano in milestone 3 e domineranno il totale: vanno riportati qui in righe separate.
