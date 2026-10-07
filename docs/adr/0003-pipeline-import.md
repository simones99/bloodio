# ADR 0003 — Pipeline di import: testo posizionato, adapter, bozza

Data: 2026-09-17. Stato: accettato.

## Contesto

I referti arrivano come PDF testuali, PDF senza livello testo, immagini e foto. I laboratori usano layout diversi (PROAVIS e AST Vallerosa negli esempi) e la stessa app deve poterne aggiungere altri senza toccare quelli esistenti. Nulla va salvato senza verifica dell'utente.

## Decisione

1. **Un solo formato intermedio, `PositionedText`**: pagine con elementi di testo e posizione (x, baseline y, larghezza, altezza, confidenza OCR opzionale). pdf.js e l'OCR producono lo stesso formato; i parser non sanno da dove arriva il testo.
2. **Adapter per laboratorio dietro un registry**: `detect(pt)` restituisce un punteggio 0..1, `parse(pt)` una `DraftReport`. Sotto 0.5 si usa l'adapter generico euristico, con confidenza massima 0.5 su ogni riga.
3. **Gli adapter trovano solo il testo** e restituiscono `RawRow`. L'interpretazione (analita, numero, range, unità, confidenza, flag) avviene una volta sola in `src/parsers/draft.ts` con le funzioni pure di `src/domain/`.
4. **Geometria calibrata sui dati**: le colonne si ricavano dalle intestazioni e dalla posizione più frequente dei valori, le tolleranze dall'altezza del testo. Niente coordinate fisse, così una pagina OCR in scala diversa funziona.
5. **Confidenza di riga** = minimo tra punteggio del match, esito del valore, esito del range, confidenza OCR e tetto dell'adapter. Una riga è "da controllare" sotto 0.8 o con almeno un flag (`ambiguous-number`, `age-stratified-ref`, `derived-ref`, `unit-mismatch`, `ambiguous-analyte`, `suggested-analyte`, `unknown-analyte`, `low-ocr`).
6. **Punto ambiguo nei numeri** (`7.510` contro `1.029`): si decide per riga, prima con l'intervallo plausibile dell'analita, poi con i numeri non ambigui della stessa riga; altrimenti si legge come migliaia e si chiede all'utente.

## Scostamento dalla spec

La spec indicava Jaro-Winkler per il matching fuzzy. Jaro-Winkler premia i prefissi comuni e dà circa 0.9 a "Colesterolo totale" contro "Colesterolo HDL": con soglia 0.88 avrebbe applicato l'analita sbagliato in silenzio. Si usa una similarità a token (Levenshtein normalizzato per parola, parole fino a tre lettere solo esatte, minimo delle due direzioni). Le soglie restano 0.88 e 0.65.

## Conseguenze

- Aggiungere un laboratorio significa aggiungere un file adapter, i suoi test su fixture anonimizzata e una riga nel registry.
- Sui tre referti PROAVIS e su quello AST il parser legge tutte le 82 righe; l'unica riga da controllare tra le 49 del referto misto è la vitamina D, per il range descrittivo su più righe.
- Il flag fuori range stampato dal laboratorio è grafico e non è nel testo: `outOfRange` si calcola sempre dal range.

## Rinvii registrati alla chiusura della milestone 1

- **Tolleranza OCR nel layout.** La spec (§5) chiede tolleranze più larghe quando `source === 'ocr'`. Il campo `source` arriva già a `buildDraftReport` ma gli helper di `layout.ts` non lo usano ancora: le finestre di raggruppamento sono calibrate sui PDF testuali. L'adattamento si fa in milestone 3, insieme all'OCR, con fixture OCR reali.
- **Righe senza valore.** Un nome senza valore che coincide con un alias del catalogo e che ha accanto un range o un'unità resta una riga con valore vuoto (confidenza 0, da controllare) e la bozza riporta l'avviso `empty-value-rows`; gli altri nomi senza valore diventano intestazioni di sezione (la condizione su range e unità serve perché alcuni titoli, come "VELOCITA' DI ERITROSEDIMENTAZIONE", coincidono con un alias). Così una colonna letta male non fa sparire un analita in silenzio.
- **Sezione sconosciuta.** Senza sezione il campione non si assume: gli omonimi sangue/urine restano ambigui e la schermata di verifica chiede all'utente.
- **ADR 0004 (privacy enforcement).** L'hook `pre-commit` e i controlli sulle fixture sono già in repository; l'ADR che li descrive insieme a CSP e controlli del bundle arriva in milestone 3.
