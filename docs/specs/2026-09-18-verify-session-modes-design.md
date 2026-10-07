# Sessione di verifica multi-modalità (import | manual | edit)

Data: 2026-09-18. Stato: approvato in brainstorming, in attesa di revisione scritta.
Sub-project 1 di M2b (`docs/NEXT-STEPS.md`). Vincoli permanenti: `CLAUDE.md`.

## 1. Scopo

Oggi `ImportSession` presume sempre un file importato e `VerifyPage` costruisce il suo stato solo a partire da un `DraftReport`. Questo blocca due funzionalità previste da M2b:

- **inserimento manuale** di un referto (nessun PDF, nessun draft);
- **modifica** di un referto già salvato (dati che vengono da storage, non da un parser).

Questo sub-project estende la sessione di verifica a tre modalità — `import`, `manual`, `edit` — riusando `VerifyPage` e i suoi componenti (`VerifyRow`, `AnalytePicker`, controllo duplicati, salvataggio) invece di creare pagine separate.

Fuori scope, rimandato ai sub-project successivi di M2b:

- autocomplete e suggerimenti di unità/range in modalità manuale (task 2);
- id delle misure stabili tra una modifica e l'altra in `updateReport`, e aggiornamento reattivo di `ReportDetailPage` dopo una modifica (task 3);
- ogni gestione degli allegati durante la modifica: restano intoccati, nessuna UI per aggiungerli o sostituirli.

## 2. Modello della sessione

`ImportSession` (oggi in `src/ui/import/import-session.tsx`) diventa una union discriminata su `mode`:

```ts
export type ImportSession =
  | { mode: 'import'; file: IngestedFile; draft: DraftReport }
  | { mode: 'manual' }
  | { mode: 'edit'; reportId: string; report: Report; measurements: Measurement[] };
```

`ImportSessionProvider` e `useImportSession` non cambiano nella forma: continuano a esporre `session` e `setSession`, tipizzati sulla nuova union.

## 3. Comportamento di `VerifyPage` per modalità

**Stato iniziale** (righe, data, laboratorio, tipo):

| Modalità | Righe | Campi |
|---|---|---|
| `import` | da `draft.rows` via `toEditableRow` (come oggi) | da `draft.sampleDate` / `draft.lab` / `draft.type` |
| `manual` | una riga vuota, `emptyEditableRow(newKey())` | tutti vuoti, tipo `altro` |
| `edit` | da `measurements` via una nuova `measurementToEditableRow` | da `report.sampleDate` / `report.lab` / `report.type` / `report.notes` |

`measurementToEditableRow(measurement, key)` converte una `Measurement` salvata in una `EditableRow`: `name` dal catalogo (`getAnalyte(analyteId)?.name`) o dall'analita personalizzato, `confirmed: true`, `confidence: 1`, `flags: []`, `origin: null`. Va aggiunta accanto a `toEditableRow`/`emptyEditableRow` in `src/parsers/editable.ts`.

**Salvataggio** (`save` in `VerifyPage`):

- `import` e `manual` → `reports.saveReport(...)` (come oggi). In `manual` non c'è `file`: nessun `fileHash` nell'input, nessun allegato creato indipendentemente dall'impostazione `keepOriginalFile`.
- `edit` → `reports.updateReport(session.reportId, ...)`, poi naviga a `/reports/:reportId` invece che a un nuovo id. Non tocca `attachments`.

**Controllo duplicati** (`findDuplicates`):

- `import`: come oggi — `sampleDate` + `lab` + `fileHash`.
- `manual`: `sampleDate` + `lab`, senza `fileHash`.
- `edit`: come `manual` (nessun `fileHash` da confrontare, l'utente non ha ricaricato un file), ma il risultato esclude il referto in modifica: `found.id !== session.reportId`.

**Scarta / uscita dalla pagina:**

- `import` e `manual`: come oggi, `setSession(null)` e naviga a `/import`.
- `edit`: `setSession(null)` e naviga a `/reports/:reportId` (nessuna scrittura è avvenuta, niente da annullare in storage).

**Guardia di ingresso** (`if (!session) return <Navigate to="/import" />`): resta per `import`/`manual`; in modalità `edit` senza sessione, il redirect utile è comunque verso `/import` (non c'è un id da recuperare — l'utente arriva sempre da un bottone che ha già impostato la sessione).

## 4. Punti di ingresso

- **Manuale**: bottone "Nuovo referto manuale" su `ImportPage` (non su `ReportsPage`: i due punti di ingresso già presenti lì — il tab "+" e la CTA a lista vuota — instradano entrambi verso `ImportPage`, quindi un secondo bottone sarebbe UI ridondante). Azione: `setSession({ mode: 'manual' })`, poi naviga a `/import/verify`.
- **Modifica**: bottone "Modifica" su `ReportDetailPage`. Azione: carica `reports.getReport(id)`, `setSession({ mode: 'edit', reportId: id, report, measurements })`, poi naviga a `/import/verify`.

Nessun nuovo instradamento: la route resta unica, `/import/verify`, guidata dal contenuto della sessione come oggi (non dall'URL). Se l'utente ricarica la pagina a metà modifica, la sessione si perde e viene rimandato a `/import` — stesso comportamento già presente oggi per l'import (avviso `beforeunload` già gestito).

## 5. Test

- Unit su `measurementToEditableRow`: conversione fedele (valore, unità, range, nome da catalogo e da analita personalizzato).
- Componente `VerifyPage`: per ciascuna modalità — stato iniziale corretto, salvataggio che chiama `saveReport` o `updateReport` con gli argomenti attesi, controllo duplicati con l'esclusione per id in `edit`, `discard` che naviga al posto giusto.
- e2e minimo: entra in manuale da `ImportPage`, compila una riga, salva; entra in modifica da `ReportDetailPage`, cambia un valore, salva, verifica che l'id del referto non cambi.

## 6. Migrazione dati

Nessuna. `ImportSession` vive solo in memoria (mai persistito), quindi il cambio di forma non richiede migrazione Dexie né bump della versione export.
