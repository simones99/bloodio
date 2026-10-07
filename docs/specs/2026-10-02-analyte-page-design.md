# Pagina analita

Data: 2026-10-02. Stato: approvato in brainstorming, in attesa di revisione scritta.
Task 1 del resto di M2b (`docs/NEXT-STEPS.md`). Spec principale: `docs/specs/2026-09-17-bloodio-web-design.md` §8 "Pagine" e "Grafico analita". Riferimento visivo: sezione "Analita" di `docs/design/mockup-2026-09-17.html`. Vincoli permanenti: `CLAUDE.md`.

## 1. Scopo

Una pagina per seguire un singolo analita nel tempo: l'ultimo valore in grande col suo binario, un grafico con la banda del range stampato a gradini per referto, la scelta dell'unità di visualizzazione e lo storico completo in tabella.

Il lavoro è diviso in due tappe, descritte nello stesso spec e pianificate in sequenza. Ognuna chiude con test verdi, build pulita e commit.

- **Tappa 1**: rotta, caricamento dati, testata, grafico statico, chip delle unità con preferenza ricordata, tabella storica, link dal dettaglio referto, e2e.
- **Tappa 2**: tocco e focus da tastiera sui punti del grafico, PNG in tema Carta ("Salva immagine").

Fuori scope: lista dei valori e voce "Valori" nella barra di navigazione (task successivo), gestione delle preferenze d'unità nelle impostazioni (task "Impostazioni complete"), zoom e filtro per periodo sul grafico.

## 2. Decisioni prese in brainstorming

- **Grafico in SVG disegnato a mano**, non uPlot: modello geometrico puro condiviso tra il componente SVG (schermo) e un pittore canvas (PNG). Motivazione e conseguenze in `docs/adr/0004-grafico-svg.md`, che supera la riga uPlot dell'ADR 0001.
- **L'unità scelta si ricorda per analita** in `settings.preferredUnits[ref]`, già presente nello schema e nell'export.
- **Valori in un'unità non convertibile**: restano in tabella con la loro unità stampata e una nota sotto il grafico. Non si disegna una seconda serie: richiederebbe un secondo asse Y (vietato) o un secondo grafico per un caso raro. Questo sostituisce la frase "serie separata nel grafico con avviso" della spec principale §6 "Unità".

## 3. Rotta e dati

Rotta `/analytes/:ref` dentro `Layout`. `ref` è `analyteRefToString(ref)` (`tsh`, `custom:<id>`), letto con `parseAnalyteRef`. Il link si costruisce con `encodeURIComponent`.

Un solo `useQuery`, che si ricarica a ogni cambiamento di `reports` e di `settings` (una `subscribe` che unisce le due), carica:

- `reports.listSeries(ref)`: `SeriesPoint[]` con misura, `reportId`, `sampleDate`, `lab`;
- `customAnalytes.list()`, solo per nome e categoria degli analiti personalizzati;
- `settings.get('preferredUnits')`.

## 4. Moduli

### `src/ui/analyte/analyte-view.ts` (puro)

`buildAnalyteView(points, analyte, custom, preferredUnit)` restituisce tutto ciò che la pagina mostra, senza React:

- `name`, `category` (dal catalogo o dall'analita personalizzato; `—` e `altro` se mancano);
- `unit`: l'unità di visualizzazione, da `defaultDisplayUnit(analyte, unità stampata dell'ultima misura numerica, preferredUnit)`;
- `unitOptions`: per un analita del catalogo `unitsOf(analyte)` normalizzate, più sempre l'unità stampata dell'ultima misura numerica (così chi sceglie un'altra unità può tornare indietro) e l'unità corrente; per un personalizzato solo `unit`. Con una sola opzione la pagina non mostra i chip;
- `latest`: l'ultima misura per `sampleDate` (a parità, l'ordine di `listSeries`), qualunque sia la sua forma: convertita nell'unità scelta se possibile, altrimenti nella sua unità stampata o col suo testo qualitativo. La testata dice sempre la verità sull'ultimo referto;
- `chartPoints`: i punti convertiti di `toSeries`, in ordine di data crescente;
- `rows`: righe della tabella, dalla più recente: data, `reportId`, laboratorio, valore e range già formattati (convertiti, o nell'unità stampata per i non convertibili, o testo qualitativo), `outOfRange`;
- `excludedCount`: quanti valori numerici non sono convertibili nell'unità scelta;
- `watch`: `watchSide(trendPoints(chartPoints)) !== null`.

### `src/ui/chart/chart-model.ts` (puro)

`buildChartModel(points, { width, height })`, dove ogni punto porta `date` (ISO), `value`, `comparator`, `refMin`, `refMax`, `outOfRange` e un `key` stabile (`reportId`). Restituisce coordinate in pixel:

- **area del grafico**: margine sinistro per le etichette Y, margine in basso per le etichette X, comprese nell'altezza totale;
- **asse X**: tempo lineare in giorni dal primo all'ultimo prelievo. Se tutti i punti hanno la stessa data, il dominio si allarga di un giorno per parte. Etichette "lug 21" sulle date dei referti; se due etichette distano meno di 56 px si tengono la prima, l'ultima e le intermedie che non collidono;
- **asse Y**: dominio che copre valori e limiti finiti dei range, con margine; zero non forzato. Al massimo 7 tacche su numeri tondi (passo 1, 2, 2,5 o 5 per una potenza di 10), formattate con virgola italiana;
- **banda**: un segmento per referto, da `x(i)` a `x(i+1)`; l'ultimo arriva al bordo destro. Limite inferiore `refMin`, oppure il fondo per i range "< X"; limite superiore `refMax`, oppure la cima per i range "> X". Un referto senza range non produce segmento. Segmenti contigui formano un unico poligono; un buco lo spezza. Il modello restituisce i poligoni e, separati, i tratti dei bordi superiore e inferiore (un bordo che coincide col fondo o con la cima non si disegna);
- **etichetta "range stampato"**: posizione dentro il primo segmento abbastanza alto (almeno 16 px), altrimenti assente;
- **linea**: un percorso attraverso tutti i punti in ordine di data;
- **punti**: `x`, `y`, `key` e `shape`, con la stessa precedenza del `Rail`: `out` (fuori range) → `open` (con comparatore) → `in`. L'ultimo punto porta `latest: true`.

### `src/ui/chart/TrendChart.tsx`

Disegna il modello in SVG. Misura la larghezza del contenitore con `ResizeObserver` (350 px se manca, per esempio in jsdom); altezza fissa 200 px. Colori solo da variabili CSS, così i temi Nero e Carta funzionano senza ridisegno:

- banda `--grafite`, bordi `--binario` 1 px;
- griglie `--filetto` 1 px continue; testo degli assi `--cenere`, 11 px, larghezza 88%, cifre tabulari;
- linea `--cenere` 1,5 px;
- punto `in`: cerchio pieno `--testo`, raggio 4,5; `open`: cerchio vuoto con bordo `--testo`; `out`: rombo `--arterioso` di 9 px. Ogni punto ha un anello di 2 px nel colore di fondo (`--nero`). L'ultimo punto ha in più l'anello largo del mockup.

Nessun numero accanto ai punti. Il contenitore ha `role="img"` e un `aria-label` descrittivo, senza interpretazione, per esempio: "TSH da marzo 2021 ad agosto 2022: 5 misure, 5 sopra il range stampato, da 5,96 a 5,07 µUI/mL." (conta separatamente "sopra" e "sotto", omette le parti a zero). Ogni punto porta `data-shape` per i test.

### `src/ui/pages/AnalytePage.tsx`

Dall'alto:

1. **Link "Indietro"**: `navigate(-1)` se c'è una pagina precedente nella storia dell'app, altrimenti `/reports`.
2. **Testata**: `h1` col nome; categoria in `--cenere`; valore grande (Archivo display, cifre proporzionali) con unità in piccolo; riga "20 agosto 2022, PROAVIS"; `RangeFlag` seguito dal testo del range ("da 0,27 a 4,20"); `Rail` con `watch`. Per un ultimo valore qualitativo: solo il testo, niente binario.
3. **Grafico**, se ci sono almeno due punti convertiti. Con uno solo: "Il grafico compare dal secondo referto." Con zero (analita qualitativo): niente.
4. **Chip delle unità** (`aria-pressed`), se più di un'opzione. Il clic scrive `preferredUnits` con la chiave del `ref`; la vista cambia subito anche se la scrittura fallisce, nel qual caso un messaggio dice che la scelta non è stata ricordata.
5. **Nota sui valori esclusi**, se `excludedCount > 0`: "2 valori sono in un'unità che non posso convertire in mmol/L: li trovi nella tabella."
6. **Tabella "Storico"**: colonne Data, Valore, Range, Laboratorio. La data è un link al referto. Le righe fuori range hanno il segno rosso e un testo nascosto "fuori range". Valori allineati a destra con cifre tabulari.

Stati: in caricamento nulla (come le altre pagine); errore di lettura "Non sono riuscito a leggere i valori. Riprova." in `role="alert"`; `ref` senza misure "Nessun valore per questo analita." con link ai referti.

### Ingresso da `ReportDetailPage`

Il nome di ogni riga con un analita (catalogo o personalizzato) diventa un link a `/analytes/:ref`. Le righe senza analita restano testo.

## 5. Tappa 2

- **Punti interattivi**: ogni punto ha un'area attiva trasparente di almeno 24 px ed è raggiungibile da tastiera (un solo punto nel tab order, frecce sinistra e destra per spostarsi, Esc per chiudere). Tocco o focus aprono un riquadro con valore, data, laboratorio e link "Apri il referto". Il riquadro aggiunge comodità: le stesse informazioni stanno in tabella.
- **PNG in tema Carta**: `src/ui/chart/paint-png.ts` disegna su un canvas fuori schermo, a densità 2x, lo stesso `buildChartModel` con i valori del tema Carta presi dai token: titolo (nome dell'analita), unità, periodo, legenda delle forme (dentro, fuori, con comparatore, range stampato) e la riga "Da Bloodio, non è un referto medico". Archivo è già caricato dalla pagina; prima di disegnare si attende `document.fonts.ready`. `canvas.toBlob` e poi `navigator.share` con file solo dove il puntatore principale è touch (`pointer: coarse`) e `navigator.canShare` accetta file, altrimenti download con `<a download>`; se il sistema rifiuta la condivisione (`NotAllowedError`) si ripiega sul download. Il file si chiama `bloodio-<ref>-<data>.png`. Nessuna rete.

Come è stato fatto (2026-10-02): pulsanti HTML trasparenti da 32 px sopra l'SVG (l'SVG resta un'unica immagine per le tecnologie assistive); riquadro posizionato da calloutPlacement in chart-model; palette Carta come costante in paint-png.ts, allineata a tokens.css da un test; condivisione con navigator.share solo dove il puntatore principale è touch (`pointer: coarse`) e `navigator.canShare` accetta file, altrimenti download; se il sistema rifiuta la condivisione (`NotAllowedError`) si ripiega sul download.

## 6. Test

TDD, in quest'ordine:

- `tests/ui/chart-model.test.ts` (Node): banda a gradini con due range diversi; range "< X" e "> X"; buco per un referto senza range; punti con la stessa data; precedenza delle forme; tacche Y tonde su casi tabellari; etichette X che collidono; etichetta "range stampato" assente se la banda è bassa.
- `tests/ui/analyte-view.test.ts` (Node): ordinamenti di grafico e tabella; ultimo valore non convertibile mostrato nella sua unità; analita qualitativo; unità offerte per catalogo e personalizzato; conteggio e unità degli esclusi; preferenza non convertibile ignorata.
- `tests/ui/trend-chart.test.tsx` (jsdom): numero di punti e `data-shape`; `aria-label`.
- `tests/ui/analyte-page.test.tsx` (jsdom, store reali su IndexedDB in memoria): testata e tabella; un chip converte i valori e scrive `preferredUnits`; nota sugli esclusi; stato vuoto; link dalla data al referto; la pagina si aggiorna se un referto cambia.
- `tests/ui/reports-pages.test.tsx`: il nome di una riga del dettaglio porta alla pagina analita.
- E2E: carica un PDF → dettaglio → tocco su un analita → grafico e tabella visibili; controllo "zero richieste esterne".
- Tappa 2: navigazione da tastiera tra i punti e contenuto del riquadro (jsdom); `paint-png` con un contesto canvas finto che registra le chiamate (testo del titolo e della legenda presenti, colori del tema Carta); e2e che preme "Salva immagine" e riceve un download PNG.

## 7. Documenti

- `docs/adr/0004-grafico-svg.md`: contesto, opzioni (uPlot, SVG con modello condiviso, SVG serializzato), decisione, conseguenze. L'ADR sulla privacy previsto in M3 diventa 0005.
- Spec principale: nota in §6 "Unità" e §8 "Grafico analita" che rimanda a questo spec.
- `docs/NEXT-STEPS.md` aggiornato a fine di ogni tappa.

## 8. Migrazione dati

Nessuna. `preferredUnits` esiste già nello schema Dexie e nell'export v1.
