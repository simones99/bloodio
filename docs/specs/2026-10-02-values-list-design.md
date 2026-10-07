# Lista dei valori

Data: 2026-10-02. Stato: approvato in brainstorming, in attesa di revisione scritta.
Task 1 del resto di M2b (`docs/NEXT-STEPS.md`). Spec principale: `docs/specs/2026-09-17-bloodio-web-design.md` §8 "Pagine" e §9 "Testi" (Lessico). Pagina di destinazione: `docs/specs/2026-10-02-analyte-page-design.md`. Vincoli permanenti: `CLAUDE.md`.

## 1. Scopo

Una pagina per ritrovare a colpo d'occhio tutte le voci misurate almeno una volta, con l'ultimo valore di ciascuna, e aprirne la storia. Si raggiunge dalla voce "Valori" nella barra in basso.

Fuori scope: filtri rapidi (fuori range, tipo di referto), ordinamenti alternativi, la Home (task successivo). Nell'interfaccia mai "analita": la sezione si chiama "Valori".

## 2. Decisioni prese in brainstorming

- Ogni riga ha l'aspetto delle righe del dettaglio referto: nome, ultimo valore con unità, binario, "sopra/sotto", data dell'ultimo referto in piccolo.
- Solo la ricerca, nessun filtro.
- I dati vengono da un nuovo metodo del repository che legge misure e referti in una volta (nessuna modifica allo schema, nessuna tabella derivata).

## 3. Dati

Nuovo metodo in `ReportRepository` (`src/storage/types.ts`, `src/storage/report-repository.ts`):

```ts
interface AnalyteLatest {
  ref: AnalyteRef;
  /** Most recent measurement by sample date (ties: the same stable order as listSeries). */
  latest: SeriesPoint;
  /** The measurement just before `latest`, for the "keep an eye on" rail state. */
  previous: SeriesPoint | null;
  /** How many measurements this entry has. */
  count: number;
}

listLatestPerAnalyte(): Promise<AnalyteLatest[]>;
```

- Una sola lettura di tutte le misure e dei referti a cui appartengono; raggruppamento per `analyteRefOf(measurement)`.
- Le misure senza voce (`analyteId` e `customAnalyteId` entrambi nulli) non compaiono. Le misure il cui referto non esiste più non compaiono.
- "Ultima" e "penultima" seguono la stessa regola di `listSeries` (data del prelievo crescente, ordine stabile a parità di data), così la lista e la pagina della voce mostrano lo stesso valore.

## 4. Moduli

### Ricerca condivisa

La logica di ricerca del selettore "Scegli la voce" (`src/ui/import/AnalytePicker.tsx`: confronto su `normalizeName` di nome e alias, prima chi inizia con il testo cercato, poi chi lo contiene) si estrae in una funzione pura `searchByName(items, query, haystack)` in `src/ui/analyte/search.ts`, usata dal selettore e dalla lista. Il comportamento del selettore non cambia.

### `src/ui/analyte/value-list.ts` (puro)

`buildValueList(entries, custom, preferredUnits, query)` restituisce `{ category: Category; items: ValueListItem[] }[]`:

- `ValueListItem`: `key` (stringa del ref), `name`, `path` (`analytePath`), `row` (l'ultimo valore come `HistoryRow`, già convertito nell'unità preferita se convertibile, altrimenti com'è stampato), `watch`.
- Nome e categoria dal catalogo o dall'analita personalizzato (`—` e `altro` se mancano), come nella pagina della voce.
- Conversione con le stesse funzioni della pagina della voce (`defaultDisplayUnit`, `toSeries`), applicate a `previous` e `latest`.
- `watch`: `watchSide` sui due punti `previous` e `latest` convertiti, solo se `latest` è convertito e senza comparatore. Se `previous` ha un comparatore o non è convertibile, nessun "da tenere d'occhio".
- Categorie nell'ordine in cui compaiono in `it.category` (ordine fisso); voci in ordine alfabetico (`localeCompare` in italiano).
- Con `query` non vuota restano solo le voci trovate da `searchByName` su nome e alias; i gruppi vuoti spariscono.

### `src/ui/pages/ValuesPage.tsx`

- Titolo "Valori" (display); campo di ricerca con etichetta "Cerca" e segnaposto "Nome, per esempio glicemia".
- Un `section` per categoria con titolo; ogni voce è un link alla sua pagina con: nome, valore e unità, `Rail` (con `watch`), `RangeFlag`, data breve dell'ultimo referto. Per un valore qualitativo solo il testo.
- Un solo `useQuery` (`listLatestPerAnalyte`, `customAnalytes.list`, `settings.get('preferredUnits')`) che si ricarica quando cambiano referti o impostazioni.
- Stati: nessun dato "Nessun valore ancora. Carica un referto per seguire i tuoi valori nel tempo." con il pulsante "Carica un referto"; ricerca senza risultati "Nessuna voce con questo nome."; errore "Non sono riuscito a leggere i valori. Riprova." in `role="alert"`.

### Navigazione

- Rotta `/analytes` dentro `Layout`.
- Voce "Valori" nella barra in basso, tra "+" e "Impostazioni", con l'icona del mockup (tre righe con un punto ciascuna).

## 5. Test

- Repository: ultimo e penultimo per data; parità di data; voce personalizzata; misure senza voce escluse; referto cancellato escluso; `count`.
- `search.ts`: inizia con prima di contiene; alias; senza accenti e maiuscole; testo vuoto restituisce tutto. I test del selettore restano verdi senza modifiche.
- `value-list.ts`: ordine di categorie e voci; ricerca per nome e per alias; unità preferita convertibile e non convertibile; "da tenere d'occhio" sì e no (comparatore sulla penultima); valore qualitativo; gruppi vuoti rimossi.
- Pagina (jsdom, store reali su IndexedDB in memoria): gruppi e righe; ricerca; link alla pagina della voce; stati vuoto, nessun risultato, errore; aggiornamento quando arriva un referto.
- Barra: il link "Valori" porta alla lista.
- E2E: carica un PDF, apri "Valori", cerca "tsh", apri la voce; nessuna richiesta esterna.

## 6. Migrazione dati

Nessuna.
