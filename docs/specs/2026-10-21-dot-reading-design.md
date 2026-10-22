# Lettura del punto nei numeri

Data: 2026-10-21. Stato: implementata.
Spec principale: `docs/specs/2026-09-17-bloodio-web-design.md` §6 ("Numeri"). ADR collegato: `docs/adr/0003-pipeline-import.md` (punto 6).

Tutti i valori di esempio di questa spec sono inventati.

## 1. Scopo

`chooseDotMode` (`src/domain/numbers.ts`) decide se in un numero come `25.000` il punto separa le migliaia (25000) o i decimali (25). Oggi in alcuni casi sceglie la lettura sbagliata senza segnalarlo, e quella sbagliata è proprio quella che fa sembrare normale un valore estremo. Questa spec cambia la regola: quando nulla esclude con certezza una delle due letture, la riga va in "da controllare", invece di essere decisa in silenzio.

## 2. Il difetto

### 2.1 Come decide oggi

Per ogni riga, sul primo numero ambiguo (`\d{1,3}(\.\d{3})+`) tra valore e range:

1. se l'intervallo `plausible` della voce ammette una sola delle due letture, vince quella;
2. altrimenti decidono i numeri non ambigui della stessa riga (le "ancore", quasi sempre i limiti del range): vince la lettura compresa tra un ventesimo del più piccolo e venti volte il più grande;
3. altrimenti la riga si legge a migliaia e prende il flag `ambiguous-number`.

### 2.2 Tre modi di sbagliare in silenzio

- **Le ancore scelgono i decimali.** CPK `25.000` con range `0 - 190`: `plausible` (0–100000 U/L) ammette sia 25000 sia 25, la regola passa alle ancore, 25 è vicino a 190 e vince. Il valore salvato è 25, dentro il range, mentre il referto dice 25000, più di cento volte il limite. Succede a ogni valore stampato con il punto delle migliaia e più di 20 volte sopra il range, per ogni voce in cui `plausible` ammette entrambe le letture o manca. Oggi 67 voci numeriche su 109 non hanno `plausible`.
- **`plausible` è più stretto del vero.** Linfociti `52.000`/µL: `plausible` arriva a 50000, quindi esclude 52000 e ammette 52, e la regola sceglie 52. 15 voci hanno `plausible` più stretto dei valori che un laboratorio può refertare con un metodo diffuso: l'intervallo di misura del produttore, esteso dalla diluizione massima che la scheda del metodo ammette (§4).
- **Lo zero davanti.** `0.005` corrisponde all'espressione dei numeri ambigui, ma nessun laboratorio stampa il punto delle migliaia dopo uno zero. Per un TSH con range `0,27 - 4,2` le ancore scelgono 5 al posto di 0,005: un valore molto basso diventa un valore poco alto. Nei PDF dei due laboratori il punto decimale non compare, ma un altro layout può usarlo.

### 2.3 Scostamento dalla spec principale

La spec principale (§6, "Numeri") diceva già: "Se entrambe o nessuna sono plausibili, o l'analita è sconosciuto: lettura 'migliaia' più flag `ambiguous-number`", con il range stampato usato solo come verifica incrociata. Il codice ha trasformato la verifica incrociata in un passo che decide da solo. Questa spec torna alla regola della spec principale, con un'eccezione misurata (§3.2).

## 3. Regola nuova

### 3.1 Due verdetti

Sul primo numero ambiguo della riga si calcolano due verdetti, ciascuno con valore `migliaia`, `decimali` oppure nessun verdetto:

- **P**, da `plausible` (nell'unità canonica, come oggi): dà un verdetto se ammette una lettura sola. Se le ammette entrambe, nessuna o se la voce non ha `plausible`, P non dà verdetto, ma si registra quale dei tre casi è.
- **A**, dalle ancore (come oggi, stessa finestra ×20): dà un verdetto se una sola lettura cade nella finestra.

### 3.2 Decisione

| P | A | Lettura | `ambiguous-number` |
|---|---|---|---|
| migliaia | migliaia o nessuno | migliaia | no |
| decimali | decimali o nessuno | decimali | no |
| migliaia | decimali | migliaia | **sì** (nuovo) |
| decimali | migliaia | migliaia | **sì** (nuovo) |
| entrambe o senza `plausible` | migliaia | migliaia | no |
| entrambe o senza `plausible` | decimali | migliaia | **sì** (nuovo: oggi decimali senza flag) |
| entrambe o senza `plausible` | nessuno | migliaia | sì |
| nessuna lettura plausibile | qualsiasi | migliaia | **sì** (nuovo: oggi decidono le ancore) |

In breve:
- i decimali si scelgono senza chiedere solo quando `plausible` esclude le migliaia e le ancore non le contraddicono;
- le migliaia si scelgono senza chiedere quando `plausible` o le ancore le indicano e l'altro non dice il contrario;
- in tutti gli altri casi la riga si legge a migliaia, come oggi, e prende il flag.

**Perché le ancore possono ancora confermare le migliaia (l'eccezione).** Una lettura a migliaia sbagliata dà un valore mille volte più grande: compare come fuori range, non nasconde nulla. Una lettura a decimali sbagliata può portare il valore dentro il range. Togliere anche alle ancore il verdetto `migliaia` costerebbe una conferma su ogni conta assoluta del differenziale (§5) senza un rischio in cambio, nei layout che usano la virgola come decimale.

**Perché "migliaia" quando c'è il dubbio.** Le righe da controllare non bloccano il salvataggio (`isPending` contro `rowProblems` in `src/parsers/editable.ts`). Se la persona salva senza guardare, è meglio un valore enorme e fuori range, che si nota, di un valore normale e falso. La scelta diretta tra le due letture (`ambiguousReadings`) resta com'è.

### 3.3 Lo zero davanti

Un numero che comincia con `0.` non è ambiguo: è un decimale. L'espressione diventa `^[1-9]\d{0,2}(\.\d{3})+$`, sia in `isAmbiguousNumber` sia in `parseItalianNumber`. Ne segue che `0.005` vale 0,005 in entrambe le modalità.

`parseItalianNumber` restituisce `null` quando il risultato non è un numero finito (per esempio `0.005.000`, che oggi vale 5000 e con la nuova espressione darebbe `NaN`).

## 4. `plausible` copre i valori refertabili

`plausible` deve comprendere ogni valore che un laboratorio può refertare con un metodo diffuso: l'intervallo di misura del produttore, esteso dalla diluizione massima della scheda del metodo, o quello che segue dalla definizione per le percentuali. Le 15 voci di oggi che non lo rispettano si allargano all'unione dei due intervalli:

| Voce | `plausible` oggi | `plausible` nuovo |
|---|---|---|
| `rbc` | 1 000 000–10 000 000 | 10 000–10 000 000 |
| `hemoglobin` | 3–25 | 0,1–26 |
| `hematocrit` | 10–70 | 0,1–75 |
| `rdw` | 8–30 | 8–40 |
| `platelets` | 5 000–2 000 000 | 2 000–5 000 000 |
| `mpv` | 4–20 | 4–25 |
| `wbc` | 500–100 000 | 30–440 000 |
| `neutrophils-abs`, `lymphocytes-abs`, `monocytes-abs`, `eosinophils-abs`, `basophils-abs` | 0–50 000 | 0–440 000 |
| `glucose` | 10–1 500 | 2–1 500 |
| `hba1c` | 3–20 | 3–24,8 |
| `vitamin-b12` | 50–5 000 | 50–7 500 |

`plausible` resta il solo campo che decide la lettura. Un test sul catalogo fissa i valori nuovi.

## 5. Effetto misurato

Misura del 2026-10-21 sulle quattro fixture sintetiche in testo posizionato di questo repository (`tests/fixtures/positioned/`). Ho confrontato riga per riga la lettura e i flag prima e dopo la regola di §3 con gli intervalli di §4.

- 10 righe hanno un numero ambiguo, tutte nelle fixture PROAVIS del 2022-08-20 e del 2021-10-04.
- 6 restano a migliaia per `plausible` (globuli rossi, piastrine e globuli bianchi, in entrambe le fixture), 3 per le ancore (le conte assolute di neutrofili e linfociti), 1 a decimali per `plausible` (il peso specifico delle urine).
- **Nessuna cambia lettura e nessuna prende un flag in più.** Nessuna riga ha un numero che comincia con `0.`.

Sulle fixture nessuna riga cambia. Le conferme in più arriveranno solo dai valori estremi e dalle righe in cui `plausible` e le ancore non sono d'accordo, cioè dai casi di §2.2.

## 6. Cosa non cambia

- L'interfaccia e i testi: il messaggio di `ambiguous-number` e la scelta diretta restano.
- La finestra ×20 delle ancore e il fatto che decida il primo numero ambiguo della riga.

## 7. Test

**`tests/domain/numbers.test.ts`:**
- una riga per ogni caso della tabella di §3.2;
- CPK `25.000` con range `0 - 190` e `plausible` 0–100000: migliaia con flag;
- linfociti `52.000` con range `da 1000 a 4000` e il nuovo `plausible`: migliaia con flag;
- `0.005`: non ambiguo, vale 0,005 in entrambe le modalità;
- `0.005.000`: `null`;
- i casi di oggi restano verdi (globuli bianchi `7.510`, peso specifico `1.029`, `2.410` deciso dalle ancore, fattore d'unità).

**`tests/domain/catalog.test.ts`:** i valori nuovi di `plausible` di §4.

**`tests/parsers/draft.test.ts`:** una riga CPK inventata `25.000` con range `0 - 190` esce con valore 25000 e flag `ambiguous-number`, e `ambiguousReadings` offre `25` e `25000`.

**Fixture:** i test dei parser sulle quattro fixture restano verdi senza modifiche. È la verifica di §5.

## 8. Documenti

- **Spec principale, §6 "Numeri":** la regola di §3 in due righe, con il rimando a questa spec.
- **ADR 0003, punto 6:** le ancore confermano le migliaia ma non scelgono i decimali; il dubbio va all'utente.
- **Il commento di `plausible` in `src/domain/types.ts`:** deve coprire i valori refertabili.
- **README, riga sulla disambiguazione dei numeri:** il dubbio va all'utente.

## 9. Non coperto

- **Più numeri ambigui nella stessa riga** con letture diverse: decide il primo, come oggi.
- **Una riga senza unità:** il fattore vale 1, quindi `plausible` si confronta con un valore forse in un'altra scala. Il caso esiste già oggi e merita una spec a parte.
- **Un laboratorio che stampa il punto decimale e un valore più di 20 volte sotto il proprio range:** le ancore confermano le migliaia (§3.2). Il valore esce fuori range ma nella direzione sbagliata. Nessuno dei due layout supportati usa il punto decimale.
- **Un valore vero oltre i valori refertabili, quindi oltre `plausible`,** con la lettura a decimali dentro `plausible`: si sceglie ancora la lettura a decimali senza chiedere. Per definizione richiede una diluizione fuori dalla scheda del metodo.

## 10. Criteri di chiusura

- `npm run check` e `npm run e2e` verdi.
- I test di §7, con le fixture invariate.
- I documenti di §8 sono aggiornati.

## 11. Scostamenti in implementazione

- Il test di §4 fissa i valori nuovi di `plausible` in `tests/domain/catalog.test.ts`.
- Le due letture offerte per `25.000` sono `25` e `25000`, non `25.000`: `formatNumber` non scrive il separatore delle migliaia. Il test di `ambiguousReadings` sta in `tests/parsers/editable.test.ts`, quello della bozza in `tests/parsers/draft.test.ts`.
- `parseItalianNumber` restituisce `null` anche per `1,2,3`, che prima dava `NaN`.
