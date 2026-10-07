# Bloodio — design della web app (fase 1)

Data: 2026-09-17. Stato: approvato in brainstorming, in attesa di revisione scritta.
Brief di partenza: `docs/PROMPT-WEB.md`. Vincoli permanenti: `CLAUDE.md`.

## 1. Scopo

Bloodio è una PWA local-first. L'utente carica un referto di laboratorio (PDF, immagine o foto), l'app ne estrae i valori, l'utente li verifica e conferma, e da quel momento può seguirne l'andamento nel tempo rispetto ai range di riferimento stampati sul referto. Nessun dato lascia il dispositivo. L'app non è un dispositivo medico: mostra e confronta, non interpreta.

Fuori scope in fase 1: più profili in interfaccia, sincronizzazione, correzione prospettica delle foto, lingue oltre l'italiano, app iOS (fase 2, `docs/PROMPT-IOS.md`).

## 2. Cosa contengono gli esempi

`examples/` è la cartella locale per i referti reali usati durante lo sviluppo. Non va mai committata (`.gitignore` la esclude).

| Esempio | Laboratorio | Formato |
|---|---|---|
| A | PROAVIS | PDF testuale, 1 pagina |
| B | PROAVIS | PDF testuale, 2 pagine, sangue e urine |
| C | PROAVIS | PDF testuale, 1 pagina, nomi degli analiti di una versione precedente del layout |
| D | PROAVIS | PDF senza testo: due foto da telefono, prospettiva storta, ombre, pagine in ordine inverso |
| E | AST Vallerosa (ospedale) | PDF testuale, 1 pagina |

Layout PROAVIS: colonne nome, esito, valori di riferimento, U.M., metodica. Le sezioni sono righe in maiuscolo senza valore (`EMATOLOGIA`, `MONITORAGGIO TIROIDE`, `ESAME CHIMICO FISICO URINE`, …). La data è nella forma `Città, gg/mm/aaaa`.

Layout AST: colonne Esame, Esito, U.M., Val. riferimento. I range sono per fascia d'età, su più righe.

Trappole rilevate, che il design deve gestire:

- Numeri: `4.220.000` usa il punto come separatore di migliaia, `1.029` (peso specifico) come decimale. La virgola è sempre decimale.
- Range: `da X a Y`, `< X`, `Fino a X`, `4,5-7,5`, testo su più righe (Vitamina D), fasce d'età (AST).
- Il flag fuori range è un pallino grafico a sinistra del nome: non compare nel testo estratto. `outOfRange` va calcolato.
- `Neutrofili` (%) e `NEUTROFILI` (/µl) sono analiti diversi con lo stesso nome.
- `Emoglobina`, `Glucosio`, `Proteine`, `Bilirubina` compaiono sia nel sangue sia nelle urine.
- Alias diversi tra referti dello stesso laboratorio: `HTG` e `Tireoglobulina`; `Ab-anti Perossidasi (Ab-TPO)` e `Anticorpi anti Tireoperossidasi`.
- Unità diverse tra laboratori: FT4 in `ng/dl` (PROAVIS) e `pg/ml` (AST). Il range può cambiare tra referti (TPO `< 34`, poi `< 20`).
- Valori qualitativi: `Assente`, `Giallo ambrato`, `Alcune`, `<10`.

## 3. Decisioni prese con l'utente

- Nome: **Bloodio**.
- Profilo singolo in interfaccia, `profileId` già presente in schema ed export.
- Catalogo esteso con ormoni e vitamine, circa 110 analiti.
- Grafico esportabile in PNG.
- Adapter: PROAVIS, AST Vallerosa, più un parser generico euristico.
- Fixture: testo posizionato con il layout dei referti e dati interamente sintetici (`scripts/synthesize-fixtures.mjs`). Nessun PDF, immagine o valore reale nel repository.
- Stack: React + Vite + TypeScript come PWA, poi Capacitor per iOS.
- Identità visiva: rosso e nero, carattere unico Archivo (variante A del mockup).

## 4. Stack

React, Vite, TypeScript. Dexie per IndexedDB. `pdfjs-dist` per i PDF. `tesseract.js` per l'OCR. uPlot per i grafici. React Router con routing a hash. `vite-plugin-pwa` (Workbox). zod per la validazione dell'import. `@fontsource-variable/archivo` per il carattere. CSS Modules con variabili, nessun framework UI. i18n con dizionario TypeScript tipizzato, solo `it`. Vitest, Testing Library, `fake-indexeddb`, Playwright, `pdf-lib` (solo sviluppo, per il PDF sintetico dei test), ESLint, Prettier.

Alternative scartate: Expo/React Native (pdf.js, tesseract.js e Dexie non girano in React Native: servirebbe una doppia implementazione di input PDF, OCR e storage) e Svelte/Solid (risparmio di bundle irrilevante rispetto agli asset OCR, ecosistema più ridotto). La motivazione completa va in `docs/adr/0001-stack.md`, da scrivere prima del codice applicativo.

Le versioni delle librerie e le loro API correnti si verificano in fase di piano con la documentazione aggiornata.

## 5. Architettura e flusso di import

Ogni canale di import produce lo stesso tipo intermedio, `PositionedText`. Il parser non sa se il testo viene da pdf.js o dall'OCR.

```
File (PDF / PNG / JPEG / HEIC / fotocamera)
  ├─ PDF con testo ──── pdf.js getTextContent ──────────────┐
  ├─ PDF senza testo ── pdf.js render su canvas ─┐          │
  └─ Immagine ───────────────────────────────────┤          │
                         pre-processing + tesseract (Worker) │
                                                 ▼          ▼
                                            PositionedText
                                                   │
                                    registry.detect(positionedText)
                                                   │
                                proavis │ ast │ generic
                                                   ▼
                                              DraftReport
                                                   │
                       Schermata di verifica  ◄── inserimento manuale (bozza vuota)
                                                   │ conferma
                                                   ▼
                                          ReportRepository.saveReport
```

```ts
PositionedText {
  source: 'pdf-text' | 'ocr'
  pages: { width: number; height: number
           items: { text: string; x: number; y: number; w: number; h: number; confidence?: number }[] }[]
}

DraftReport { lab: string | null; sampleDate: string | null; type: ReportType
              adapterId: string; rows: DraftRow[]; warnings: string[] }

DraftRow {
  rawName: string; rawValue: string; rawUnit: string; rawRef: string; section: string | null
  page: number; bbox: { x: number; y: number; w: number; h: number }
  analyteMatch: { analyteId: string | null; score: number; suggestionId?: string }
  parsed: { value: number | null; comparator: '<' | '>' | '<=' | '>=' | null; valueText: string
            unit: string | null; refMin: number | null; refMax: number | null; refText: string | null }
  confidence: number            // 0..1
  flags: RowFlag[]              // 'ambiguous-number' | 'age-stratified-ref' | 'derived-ref'
                                // | 'unit-mismatch' | 'ambiguous-analyte' | 'suggested-analyte' | 'unknown-analyte' | 'low-ocr'
}
```

### Moduli

- `src/ingest/` — cartella aggiunta rispetto alla struttura attesa in `CLAUDE.md`, perché l'orchestrazione non appartiene né ai parser né all'OCR. Orchestrazione: `fileToPositionedText(file, { onProgress, signal })`. Sceglie il percorso dal tipo MIME e dalla presenza del livello testo (meno di 20 caratteri per pagina = scansione). HEIC: tenta la decodifica nativa con `createImageBitmap`; se fallisce mostra un messaggio chiaro che chiede la conversione in JPEG.
- `src/parsers/` — `LabAdapter { id; labName; detect(pt): number; parse(pt): DraftReport }`. Il registry sceglie il punteggio massimo; sotto 0.5 usa `generic`. Funzioni pure senza DOM, testabili in Node sulle fixture JSON. Le utilità comuni stanno in `parsers/layout.ts`: raggruppamento degli item in righe per `y` con tolleranza, assegnazione alle colonne per intervalli `x`, tolleranza più larga quando `source === 'ocr'`.
  - `proavis`: `detect` da "PROAVIS" o dall'intestazione `Valori di riferimento U.M. Metodica`. Le colonne si calibrano sulle posizioni `x` delle intestazioni, non su costanti fisse, così reggono OCR e scale diverse. I range su più righe si uniscono in `refText`.
  - `ast`: `detect` da "Azienda Sanitaria Territoriale" e dall'intestazione `Esame Esito U.M. Val. riferimento`. Tutte le righe del range vanno in `refText`; la riga "Da 11 anni in poi" popola `refMin`/`refMax` con flag `age-stratified-ref`.
  - `generic`: espressioni regolari per righe `nome valore [unità] [range]`. Confidenza massima 0.5: tutte le righe risultano da controllare.
- `src/ocr/` — `OcrEngine { recognize(image, { onProgress, signal }): Promise<PositionedText> }`. Implementazione tesseract.js in un Worker, lingue `ita+eng`, parole con bounding box e confidenza. L'annullamento termina il Worker su `AbortSignal`. Pre-processing: scala di grigi, contrasto, binarizzazione adattiva, deskew per piccoli angoli, rotazione manuale di 90°. La correzione prospettica è fuori scope: sulla foto di esempio la qualità attesa è bassa e la schermata di verifica copre il resto. L'interfaccia è pronta per Vision in fase 2.
- `src/domain/` — catalogo, matching, parsing di numeri e range, unità, `outOfRange`, trend. Tutto puro.
- `src/storage/` — interfacce e implementazione Dexie. La UI non importa mai Dexie.
- `src/ui/` — pagine, componenti, grafici, i18n.

### Confidenza di riga

Minimo tra: punteggio del match analita, esito del parsing del valore (1 se pulito), esito del parsing del range, confidenza OCR media delle parole (1 per `pdf-text`). Una riga è "da controllare" sotto 0.8 o se ha almeno un flag.

### Errori

PDF protetto da password, file corrotto, zero righe estratte, OCR annullato, HEIC non decodificabile: ognuno ha un messaggio italiano specifico e offre l'inserimento manuale. La bozza vive solo nello stato dell'interfaccia, con avviso `beforeunload`; niente di non confermato entra nel database.

## 6. Domain

### Catalogo

Dati in `src/domain/catalog/`, un file per categoria.

```ts
Analyte {
  id: string                      // es. 'tsh', 'neutrophils-pct', 'neutrophils-abs', 'urine-glucose'
  name: string                    // italiano
  aliases: string[]               // come stampati, inclusi tutti quelli dei referti di esempio
  category: 'ematologia' | 'lipidi' | 'renale' | 'epatica' | 'tiroide' | 'glicemia' | 'elettroliti'
          | 'ferro' | 'vitamine' | 'ormoni' | 'infiammazione' | 'coagulazione' | 'proteine' | 'urine' | 'altro'
  specimen: 'blood' | 'urine'
  kind: 'numeric' | 'qualitative'
  canonicalUnit?: string
  units?: { unit: string; toCanonical: number }[]
  plausible?: { min: number; max: number }   // in unità canonica
}
```

Contenuto: tutti gli analiti dei referti di esempio, il pannello comune (HDL, LDL, HbA1c, sodio, potassio, calcio, magnesio, ferritina, transferrina, B12, folati, PCR, bilirubina, fosfatasi alcalina, azotemia, eGFR, FT3, PSA, proteine totali, albumina, PT/INR) e ormoni e vitamine (testosterone, cortisolo, prolattina, estradiolo, LH, FSH, insulina, omocisteina, zinco).

### Matching alias

`matchAnalyte(rawName, { unit, section })`.

- Normalizzazione: minuscole, senza accenti né punteggiatura. Il contenuto tra parentesi si prova anche come alias separato.
- Alias esatto: punteggio 1.0.
- Fuzzy a token (Levenshtein normalizzato per parola, minimo delle due direzioni) solo per nomi più lunghi di 5 caratteri. Le sigle corte (`MCH`, `MCHC`, `TSH`, `FT3`, `FT4`) solo esatte. Jaro-Winkler è stato scartato in fase di piano: premia i prefissi comuni e confonde "Colesterolo totale" con "Colesterolo HDL".
- Soglie: da 0.88 match automatico; tra 0.65 e 0.88 suggerimento visibile ("forse: X", flag `suggested-analyte`), mai applicato da solo; sotto 0.65 "non riconosciuto".
- Omonimi: decide la dimensione dell'unità (% contro /µl) e poi la sezione (`specimen` urine se la sezione è delle urine). Se l'ambiguità resta: flag `ambiguous-analyte` e scelta esplicita in verifica.

### Numeri

- La virgola è sempre decimale.
- Una stringa della forma `\d{1,3}(\.\d{3})+` è ambigua: si calcolano entrambe le letture e si tiene quella dentro `plausible`, con verifica incrociata sul range stampato letto con la stessa regola. Se entrambe o nessuna sono plausibili, o l'analita è sconosciuto: lettura "migliaia" più flag `ambiguous-number`.
- `<9` diventa `{ value: 9, comparator: '<', valueText: '<9' }`.
- I qualitativi hanno `value: null` e `valueText` grezzo.

### Range

Grammatica unica per `da X a Y`, `X-Y`, `< X`, `<= X`, `Fino a X`, `> X`, `inferiore a`, `superiore a`. Il testo non riconosciuto resta in `refText` con `refMin`/`refMax` nulli. Per i range descrittivi su più righe, la riga che contiene "Normale" popola il limite con flag `derived-ref`.

### `outOfRange`

Tre stati: `true | false | null`. Funzione pura `computeOutOfRange`, ricalcolata a ogni modifica e salvata.

- Numerico con range: confronto diretto, limiti inclusi nel range.
- Con comparatore: `<9` contro `< 20` dà `false`; i casi indecidibili danno `null`.
- Qualitativo: uguale al riferimento dopo normalizzazione della radice (`Assenti` = `Assente`) dà `false`; riferimento `Assente` e valore diverso dà `true`; `Assente` contro `Fino a 20` dà `false`; il resto `null`.
- `null` si mostra come "non valutabile", mai come normale.

### Unità

- Tabella dati di normalizzazione delle grafie (`µ`/`μ`/`micro`, `gr/dl` = `g/dL`, `micro U.I./ml` = `µUI/mL`, `mU/ml` = `U/L`).
- Il dato si salva sempre come stampato. La conversione avviene solo in lettura, verso l'unità canonica o preferita; il range si converte con lo stesso fattore.
- Fattori per analita con commento della fonte e test di andata e ritorno: glucosio, colesterolo totale/HDL/LDL, trigliceridi, creatinina, acido urico, urea, bilirubina, ferro, calcio, magnesio, vitamina D, B12, folati, FT3, FT4 (`ng/dL`, `pg/mL`, `pmol/L`), testosterone, cortisolo, emoglobina, conte cellulari.
- Un'unità non convertibile verso la canonica genera una serie separata nel grafico con avviso. Mai mescolata.
- Aggiornamento 2026-10-02: i valori non convertibili restano in tabella con una nota sotto il grafico, vedi docs/specs/2026-10-02-analyte-page-design.md.

### Tipo referto

`sangue | urine | misto | altro`. Proposto dallo `specimen` delle righe, modificabile. I filtri "sangue" e "urine" includono `misto`.

### "Da tenere d'occhio"

Pura geometria sul range stampato. Requisiti: analita numerico, almeno due misure convertibili, ultimo valore dentro il range. Con `p = (v − refMin) / (refMax − refMin)` sul range dell'ultimo referto: si segnala se `p ≥ 0.85` e il valore è in salita rispetto alla misura precedente, oppure `p ≤ 0.15` e in discesa. Range a un lato: `< X` se `v ≥ 0.85·X` e in salita; `> X` se `v ≤ 1.15·X` e in discesa. Le soglie stanno in una sola costante. Testo in interfaccia: "vicino al limite del range stampato".

## 7. Storage, export, import

### Schema Dexie `bloodio`, versione 1

| Tabella | Campi | Indici |
|---|---|---|
| `profiles` | id, name, createdAt | id |
| `reports` | id, profileId, sampleDate (`aaaa-mm-gg`), lab, type, source (`parser`/`ocr`/`manuale`), adapterId, notes, fileHash, createdAt, updatedAt | id, profileId, sampleDate, lab, type, fileHash |
| `measurements` | id, reportId, analyteId o customAnalyteId, value, comparator, valueText, unit, refMin, refMax, refText, outOfRange, confidence, section, order | id, reportId, analyteId, customAnalyteId |
| `customAnalytes` | id, name, unit, category, specimen, kind | id, name |
| `attachments` | id, reportId, order, data (`ArrayBuffer`), mimeType, fileName, size | id, reportId |
| `settings` | key, value | key |

Un profilo `default` si crea al primo avvio. Gli id sono `crypto.randomUUID()`. `fileHash` è SHA-256 via `crypto.subtle`; se l'API manca resta nullo e la deduplicazione ripiega su data e laboratorio. Gli allegati si scrivono solo con l'impostazione "conserva file originale" attiva.

Scostamenti dal brief, da registrare in `docs/adr/0002-modello-dati.md`: campo `comparator`, `outOfRange` a tre stati, tipo `misto`, tabella `customAnalytes` al posto di `customName`, `profileId` predisposto.

### Interfacce

```ts
ReportRepository {
  saveReport(report, measurements, attachment?)   // una transazione
  updateReport(id, report, measurements)
  deleteReport(id)                                 // cascata su misure e allegato
  getReport(id)
  listReports({ type?, lab?, from?, to? })
  listSeries(analyteRef)                           // misure con data e laboratorio, ordinate
  latestReferenceFor(analyteRef)                   // unità e range dell'ultimo referto
  findDuplicates({ fileHash?, sampleDate, lab })
  listLabs()
  subscribe(listener)
}
CustomAnalyteStore { list(); create(); rename(); remove() }
SettingsStore { get(); set(); subscribe() }
BackupService { exportAll(opts); previewImport(json); applyImport(json, mode); wipeAll() }
```

Gli hook React si iscrivono a `subscribe` e ricaricano. Niente `dexie-react-hooks`: legherebbe la UI a Dexie e ostacolerebbe la sostituzione con SQLite in fase 2.

### Duplicati

Alla scelta del file: se l'hash è già presente, avviso con scelta tra aprire il referto esistente o continuare. Al salvataggio: stessa data e stesso laboratorio, stesso avviso. Mai un blocco.

### Export versione 1

```json
{ "app": "bloodio", "version": 1, "exportedAt": "…", "appVersion": "…",
  "data": { "profiles": [], "reports": [], "measurements": [], "customAnalytes": [],
            "preferredUnits": {}, "attachments": [] } }
```

`attachments` solo con la casella "Includi file originali" (base64, con avviso sulla dimensione). File `bloodio-export-aaaa-mm-gg.json`, scaricato con Blob e link; su mobile anche "Condividi" se `navigator.canShare({ files })`. `lastExportAt` sta in `settings`; la home mostra un promemoria se i dati sono cambiati e l'ultimo export ha più di 90 giorni.

### Import

1. Parsing e validazione zod, con errore leggibile per campo.
2. Catena `upgraders[n]` fino alla versione corrente. Una versione più nuova di quella supportata viene rifiutata con "aggiorna l'app".
3. Anteprima: numero di referti e misure, periodo, laboratori, duplicati, versione del formato.
4. **Sostituisci**: svuota e inserisce in una sola transazione; un fallimento non modifica nulla. **Unisci**: un referto è duplicato se ha lo stesso id, oppure lo stesso `fileHash` non nullo, oppure stesso profilo, data e laboratorio normalizzato; il duplicato si salta e il dato esistente vince. Gli analiti custom si uniscono per id e poi per nome normalizzato, con rimappatura degli id nelle misure importate.
5. Riepilogo: aggiunti e saltati.

### Altro

- "Elimina tutti i dati": primo dialogo con invito a esportare; secondo dialogo che richiede di digitare `ELIMINA`. Poi `db.delete()` e ricreazione. La cache del service worker resta.
- `navigator.storage.persist()` dopo il primo salvataggio. Le impostazioni mostrano lo stato della persistenza e lo spazio usato.
- Migrazioni in `src/storage/migrations/`. `tests/fixtures/export-v1.json` resta congelato: il test di import di ogni versione storica non si rimuove mai.

## 8. Interfaccia

### Navigazione

Barra in basso: Home, Referti, pulsante centrale "+", Valori, Impostazioni. Rotte: `/`, `/reports`, `/reports/:id`, `/reports/:id/edit`, `/analytes`, `/analytes/:ref`, `/compare`, `/import`, `/import/verify`, `/settings`. Al primo avvio un disclaimer bloccante, sempre rileggibile nelle impostazioni.

### Import e verifica

- `/import`: file (selezione multipla, più pagine in un referto), fotocamera (`<input capture="environment">` con "aggiungi pagina"), manuale. Progresso per fase e pulsante Annulla.
- `/import/verify`: schede per riga su schermo stretto, tabella su schermo largo. Per riga: combobox analita con autocomplete, valore, unità, range minimo e massimo più testo, stato della lettura, elimina. Le righe da controllare hanno bordo Siero, icona e motivo scritto per esteso, con scelta diretta quando possibile (`1,029` oppure `1029`). Filtro "Da controllare" / "Tutti". "Vedi originale" apre la pagina renderizzata con un rettangolo sulla riga selezionata. Intestazione: data del prelievo, laboratorio (autocomplete), tipo, note.
- L'inserimento manuale e la modifica di un referto riusano la stessa schermata. In manuale unità e range si precompilano da `latestReferenceFor`, con l'etichetta "dal referto del gg/mm/aaaa".

### Pagine

- Home: lastra rossa con data e laboratorio dell'ultimo referto e frase di riepilogo; valori fuori range; "da tenere d'occhio"; ultimi referti; promemoria backup; stato vuoto con invito a caricare.
- Referti: filtri per tipo, laboratorio, periodo. Dettaglio: gruppi per categoria, ogni valore con il suo binario, "non valutabile" distinto.
- Valori (lista, rotta `/analytes`): solo quelli con dati, per categoria, con ricerca e ultimo valore.
- Analita: valore grande, binario, grafico, selettore unità, "Salva immagine", tabella storica.
- Confronto: due referti, unione degli analiti, due punti sullo stesso binario, differenza assoluta e percentuale in unità comune, filtro "solo in comune".
- Impostazioni: lingua (solo italiano), unità (convenzionali o SI come default, con preferenza per analita), tema (Nero come default, Carta, oppure automatico da `prefers-color-scheme`), conserva file originale, export, import, elimina tutto, stato OCR offline, persistenza e spazio, disclaimer, versione.

### Grafico analita

uPlot. Asse X tempo, asse Y valore nell'unità scelta. Banda del range a gradini: il range del referto *i* vale dalla sua data fino al referto successivo, l'ultimo si estende al bordo. Per i range a un lato la banda va dal limite al bordo del grafico. Punti fuori range con forma e colore diversi; valori con comparatore come punto vuoto. Tocco su un punto: valore, data, laboratorio, link al referto. PNG: composizione su canvas fuori schermo in tema Carta (titolo, unità, periodo, legenda), `toBlob`, download o condivisione. Accessibilità: `role="img"` con riassunto testuale, tabella storica come alternativa completa. Prima di scrivere il codice del grafico si carica la skill `dataviz`. Aggiornamento 2026-10-02: SVG disegnato a mano invece di uPlot (ADR 0004); dettagli in docs/specs/2026-10-02-analyte-page-design.md.

## 9. Identità visiva

Riferimento approvato: `docs/design/mockup-2026-09-17.html` (usa e getta, non è codice applicativo). Prima di scrivere l'interfaccia si carica la skill `frontend-design:frontend-design`.

### Colore

| Token | Tema Nero | Tema Carta | Ruolo |
|---|---|---|---|
| `--nero` | `#000000` | `#FFFFFF` | fondo |
| `--grafite` | `#1C1C1C` | `#F1F1F1` | fogli, campi, banda del range |
| `--filetto` | `#2A2A2A` | `#DCDCDC` | separatori |
| `--binario` | `#3A3A3A` | `#C4C4C4` | traccia del binario |
| `--testo` | `#FFFFFF` | `#000000` | testo, punti dentro range |
| `--cenere` | `#8F8F8F` | `#5C5C5C` | testo secondario |
| `--arterioso` | `#E8151F` | `#E8151F` | lastra, azione primaria, fuori range |
| `--arterioso-testo` | `#FF5A5F` | `#C40F18` | rosso per testo piccolo |
| `--venoso` | `#5A0A12` | `#5A0A12` | stato premuto, splash |
| `--siero` | `#E8B04A` | `#8A5A00` | da tenere d'occhio, righe da controllare |

Il tema Nero è l'identità. Il tema Carta serve al sole pieno e al PNG esportato. `#E8151F` è scelto perché sia il testo nero sia quello bianco superano 4.5:1.

Regola del rosso: per schermata un solo elemento rosso di interfaccia (la lastra in Home, l'azione primaria altrove) più i dati fuori range. La lastra della Home è identica con zero o dieci valori fuori range: il rosso è marchio, non allarme. La banda del range nel grafico è grafite, non rossa.

### Tipografia

Un solo carattere: **Archivo variabile** (assi peso e larghezza), in bundle dalla stessa origine.

- Display (date, valori grandi, titoli di schermata, marchio): larghezza 125%, peso 800, tracking −0.035em.
- Interfaccia: larghezza 100%, pesi 400–650.
- Tabelle e metadati densi: larghezza 88%.
- Cifre tabulari ovunque, numeri allineati a destra. In fase di piano si verifica che Archivo esponga `tnum`; in caso contrario il ripiego è Sofia Sans.
- Niente monospace, niente etichette in maiuscolo, niente occhielli sopra i titoli.

### Il binario

Elemento firma. Ogni valore numerico è una linea orizzontale (il range stampato, pillola con estremità arrotondate) attraversata da un filetto a tutta larghezza, con un punto nella posizione del valore. La traccia occupa dal 20% all'80% della larghezza; oltre le estremità c'è lo spazio "fuori". Posizione: `x = 20% + p·60%`; oltre il range lo scarto si comprime (`80% + min(16, (p−1)·40)%`, simmetrico a sinistra). Punto bianco tondo dentro il range; rombo rosso fuori, con freccia e parola "sopra" o "sotto" (mai solo colore); punto tondo Siero se vicino al limite; punto vuoto per i valori con comparatore. Nel confronto due punti condividono lo stesso binario.

### Forma e movimento

Tutto allineato a sinistra, numeri a destra. Righe separate da filetti, nessuna griglia di card, nessuna ombra. Raggi per gerarchia: pillola per binari, chip e pulsanti; 20 px in alto sui fogli; 8 px sui campi. Un solo momento orchestrato: dopo "Salva referto" i punti scorrono lungo i binari fino alla loro posizione (circa 700 ms, sfalsati). Il resto si muove solo in risposta a un gesto. Con `prefers-reduced-motion` nessuna animazione. Icona dell'app: binario bianco con punto rosso su nero.

### Testi

Italiano, tu, frasi piane, senza gergo di sistema. Un'azione mantiene lo stesso nome lungo il flusso ("Salva referto", poi "Referto salvato"). Stato vuoto: "Nessun referto ancora. Carica il primo per seguire i tuoi valori nel tempo." Errore: "Questo PDF è protetto da password. Togli la protezione e riprova, oppure inserisci i valori a mano."

Lessico (deciso il 2026-10-02): "analita" è gergo di laboratorio e non compare mai nell'interfaccia. La sezione e le pagine dicono "Valori"; nella riga di verifica il campo che sceglie cosa è stato misurato si chiama "Voce" (accanto c'è già "Valore"). Nel codice e nei documenti tecnici resta `analyte`.

### Accessibilità

Focus visibile e gestito al cambio di rotta, label su ogni campo, bersagli di almeno 44 px, contrasto AA, stato mai affidato al solo colore.

## 10. PWA

`vite-plugin-pwa` in modalità `generateSW`, con aggiornamento a richiesta ("nuova versione disponibile"): mai un ricaricamento durante una verifica.

Il brief chiede sia il precache completo sia il caricamento lazy dei traineddata. Soluzione: la shell dell'app, il carattere e il worker di pdf.js vanno in precache all'installazione. Gli asset OCR (core WASM e traineddata `ita`/`eng`, variante `fast`) si scaricano in background a inattività dopo l'attivazione del service worker, in una cache `CacheFirst` della stessa origine. Il primo render non si blocca e l'offline diventa completo poco dopo. Le impostazioni mostrano "OCR offline: pronto / in download".

tesseract.js si configura con `workerPath`, `corePath` e `langPath` locali e `workerBlobURL: false`; uno script copia i file da `node_modules` a `public/ocr/`. pdf.js usa worker, cMap e font standard locali. Le dimensioni si misurano a ogni build in `docs/bundle-size.md`.

## 11. Privacy, tre livelli

1. **CSP** via `<meta>`, iniettata solo in build: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. Un file `_headers` di esempio per chi pubblica su CDN.
2. **Controllo statico** `scripts/check-bundle.mjs`: scansiona `dist/` alla ricerca di `http(s)://` e `//host`. Allowlist esplicita con un motivo per voce (namespace XML, link agli errori di React, costante CDN di default dentro tesseract.js resa inerte da configurazione e CSP). Ogni URL nuovo fa fallire la build.
3. **Controllo runtime** in Playwright: durante il flusso completo ogni richiesta fuori origine viene registrata e bloccata; il test esige zero richieste.

Un hook `pre-commit` in `.githooks/` rifiuta i file sotto `examples/` e PDF o immagini fuori dai percorsi ammessi. Registrato in `docs/adr/0004-privacy-enforcement.md`.

## 12. Fixture e test

- `scripts/make-fixtures.mjs` esegue pdf.js in Node su `examples/` e scrive i JSON `PositionedText`, con nomi e dati anagrafici sostituiti da segnaposto, in `examples/positioned/` (ignorato da git: contiene ancora valori e date reali). I termini personali stanno in `examples/pii.local.json` (ignorato da git); lo script fallisce se un termine sopravvive nell'output. `scripts/synthesize-fixtures.mjs --from examples/positioned` ne ricava le fixture committate in `tests/fixtures/positioned/`: stesso layout, valori, date e identificativi inventati con seme fisso. Per un referto fotografato la fixture sarà l'output OCR sintetizzato allo stesso modo, mai l'immagine.
- Il PDF sintetico per gli e2e si genera dalla fixture anonimizzata con `pdf-lib`, alle stesse coordinate. Da quello deriva il PNG per il test OCR.
- Unit (Vitest, Node): domain, parser sulle fixture, storage con `fake-indexeddb`. Test domain: ogni alias dei referti di esempio risolve all'analita giusto; nessun alias duplicato a parità di `specimen` e dimensione; tabelle di casi per numeri, range, `outOfRange`; andata e ritorno delle conversioni. Test storage: transazione, cascata, deduplicazione, round-trip export → wipe → import, unione con duplicati, sostituzione con fallimento simulato.
- Componenti (Testing Library): verifica, anteprima import, doppia conferma.
- E2E (Playwright, Chromium e WebKit con viewport mobile): carica PDF → verifica → salva → grafico; OCR sul PNG sintetico; offline dopo il primo caricamento; flusso principale da tastiera; zero richieste esterne.
- `npm run check` = lint, typecheck, test, build, `check:bundle`. `npm run e2e` separato.

## 13. Documenti

ADR: `0001-stack`, `0002-modello-dati`, `0003-pipeline-import`, `0004-privacy-enforcement`. README utente in italiano. `docs/bundle-size.md`. `docs/PROMPT-IOS.md` aggiornato a fine fase con ciò che serve davvero alla fase 2 (adapter storage, adapter OCR, plugin Capacitor per fotocamera, Files e share sheet).

## 14. Milestone

Ognuna si chiude con `npm run check` verde e un'app utilizzabile.

1. **Fondamenta**: ADR stack e modello dati, scaffold e CI locale, script fixture, domain, parser e registry, storage con export/import.
2. **Flusso principale**, in due piani. M2a: raccordi (conversione unica di valore e range, modello di riga modificabile), lettura PDF nel browser, sistema visivo (token, Archivo, binario), shell, import PDF → verifica → salva, lista e dettaglio referti, e2e. M2b: home, analita con grafico e PNG, confronto, inserimento manuale, modifica referto, "vedi originale", filtro per periodo, impostazioni complete con export e import.
3. **OCR e rifinitura**: OCR e fotocamera, PWA e offline, CSP e controlli bundle, impostazioni e disclaimer, e2e, README, bundle size, aggiornamento di `PROMPT-IOS.md`.
