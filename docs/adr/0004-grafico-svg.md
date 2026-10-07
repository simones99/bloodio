# ADR 0004 — Grafico analita in SVG disegnato a mano

Data: 2026-10-02. Stato: accettato. Supera la scelta di uPlot nell'ADR 0001.

## Contesto

La pagina analita mostra la storia di un singolo valore: qualche referto l'anno, al massimo qualche decina di punti. Il grafico deve avere una banda del range stampato a gradini (ogni referto ha il suo range), forme diverse per i punti fuori range e per i valori con comparatore, temi Nero e Carta, e un'esportazione PNG in tema Carta. L'ADR 0001 indicava uPlot.

## Opzioni

1. **uPlot.** Circa 50 KB. Zoom e cursore pronti, PNG quasi gratis perché disegna su canvas. Ma banda a gradini e forme dei punti vanno comunque scritte negli hook di disegno; i colori vanno letti dalle variabili CSS a runtime e un cambio di tema richiede di ridisegnare; jsdom non ha canvas, quindi il grafico si verifica solo con e2e. Lo zoom non serve con 5–30 punti.
2. **SVG disegnato a mano con un modello geometrico condiviso.** Un modulo puro calcola scale, tacche, banda e punti; un componente React lo disegna in SVG con le variabili CSS (temi gratis), un piccolo pittore canvas lo ridisegna per il PNG. Nessuna dipendenza, geometria testabile in Node, componente testabile in jsdom, aspetto identico al mockup approvato.
3. **SVG serializzato in immagine per il PNG.** Come la 2 senza pittore canvas. Un SVG usato come immagine non vede i font della pagina: servirebbe Archivo in base64 (circa 100 KB) e il rendering varia tra browser.

## Decisione

Opzione 2. Codice in `src/ui/chart/`: `chart-model.ts` (puro), `TrendChart.tsx` (SVG), e in seguito `paint-png.ts` (canvas, tema Carta).

## Conseguenze

- Nessuna dipendenza nuova; `uplot` non entra nel bundle.
- Due disegnatori (SVG e canvas) da tenere allineati: entrambi leggono solo `ChartModel`, mai i dati grezzi.
- In fase 2 (Capacitor) l'SVG rende allo stesso modo in WKWebView.
- Se un giorno servissero zoom o migliaia di punti, si rivaluta: il modello resta riusabile.
- L'ADR sulla privacy previsto in M3 prende il numero 0005.
