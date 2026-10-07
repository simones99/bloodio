# ADR 0002 — Modello dati e persistenza

Data: 2026-09-17. Stato: accettato.

## Contesto

Il brief definisce `Report` e `Measurement` e chiede Dexie con schema versionato, export JSON versionato e nessun dato fuori dal dispositivo. L'analisi dei referti campione ha mostrato casi che il modello del brief non copre.

## Decisione

Schema Dexie `bloodio` versione 1 con le tabelle `profiles`, `reports`, `measurements`, `customAnalytes`, `attachments`, `settings`. La UI usa solo le interfacce di `src/storage/types.ts` e non importa mai Dexie.

Scostamenti dal brief:

- **`comparator`** su `Measurement`: valori come `<9` conservano il numero e il segno, così restano confrontabili e disegnabili.
- **`outOfRange` a tre stati** (`true`, `false`, `null`): `null` significa "non valutabile" e non viene mai mostrato come normale. Il repository lo ricalcola a ogni salvataggio, quindi non è mai obsoleto.
- **Tipo referto `misto`**: i referti PROAVIS contengono sangue e urine insieme. I filtri "sangue" e "urine" includono i misti.
- **Tabella `customAnalytes`** al posto di un `customName` libero: identità stabile per i grafici e rinomina senza toccare le misure.
- **`profileId`** già presente su `reports` con un profilo `default`: il multi-profilo futuro non richiede migrazione.
- **Allegati come `ArrayBuffer`**, non `Blob`, in una tabella separata con chiave propria e indice su `reportId`: un referto fotografato è un file per pagina, quindi un referto può avere più allegati, ordinati da `order`. Sono clonabili ovunque, senza i problemi storici di WebKit con i Blob in IndexedDB, e non vengono mai caricati insieme alle liste dei referti. Lo schema v1 non era mai stato distribuito, quindi la chiave è cambiata senza migrazione.
- **Dato salvato come stampato** (valore e unità originali). La conversione avviene solo in lettura.
- `settings.dataChangedAt` viene aggiornato a ogni scrittura: serve al promemoria di backup.

## Conseguenze

- Ogni modifica di schema richiede: nuova `version(n)` con `upgrade()`, incremento di `EXPORT_VERSION`, una funzione in `upgraders` e il mantenimento del test di import di tutte le versioni precedenti (`tests/fixtures/export-v1.json` non si tocca mai).
- La fase 2 può sostituire Dexie con uno storage nativo implementando le stesse interfacce.
