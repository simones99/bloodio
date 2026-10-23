// Extensions: vite.config.ts loads this file for the web manifest.
import type { IngestErrorCode } from '../../ingest/ingest-file.ts';
import type { WatchSide } from '../../domain/trend.ts';
import type { Category, ReportType } from '../../domain/types.ts';
import type { RowProblem } from '../../parsers/editable.ts';
import type { RowFlag } from '../../parsers/types.ts';

/** Every string the user reads. Italian only for now; a second language is a second file of this shape. */
export const it = {
  appName: 'Bloodio',
  appDescription: 'I tuoi esami del sangue nel tempo, solo sul tuo dispositivo.',
  nav: {
    main: 'Principale',
    home: 'Home',
    reports: 'Referti',
    add: 'Carica un referto',
    values: 'Valori',
    settings: 'Impostazioni',
  },

  disclaimer: {
    title: 'Prima di iniziare',
    body: [
      'Bloodio mostra i valori dei tuoi referti e li confronta con i range stampati dal laboratorio. Non interpreta i risultati, non fa diagnosi e non suggerisce terapie: per questo c’è il tuo medico.',
      'I tuoi dati restano su questo dispositivo. Non esiste un account, non c’è un server e nessun dato viene inviato in rete.',
      'L’unica copia dei dati è su questo dispositivo: se lo cambi o cancelli i dati del browser, i referti si perdono. Dalle impostazioni puoi esportarli in un file e tenerne una copia.',
    ],
    accept: 'Ho capito, inizia',
  },

  reports: {
    title: 'Referti',
    empty: 'Nessun referto ancora. Carica il primo per seguire i tuoi valori nel tempo.',
    emptyFiltered: 'Nessun referto con questi filtri.',
    load: 'Carica un referto',
    allTypes: 'Tutti',
    allLabs: 'Tutti i laboratori',
    values: (n: number) => (n === 1 ? '1 valore' : `${n} valori`),
    outOfRange: (n: number) => (n === 1 ? '1 fuori range' : `${n} fuori range`),
  },

  reportType: {
    sangue: 'Sangue',
    urine: 'Urine',
    misto: 'Sangue e urine',
    altro: 'Altro',
  } satisfies Record<ReportType, string>,

  category: {
    ematologia: 'Ematologia',
    lipidi: 'Lipidi',
    renale: 'Funzione renale',
    epatica: 'Funzione epatica',
    tiroide: 'Tiroide',
    glicemia: 'Glicemia',
    elettroliti: 'Elettroliti',
    ferro: 'Ferro',
    vitamine: 'Vitamine e minerali',
    ormoni: 'Ormoni',
    infiammazione: 'Infiammazione',
    coagulazione: 'Coagulazione',
    proteine: 'Proteine',
    urine: 'Urine',
    altro: 'Altro',
  } satisfies Record<Category, string>,

  range: {
    out: 'fuori dal range',
    above: 'sopra',
    below: 'sotto',
    notEvaluable: 'non valutabile',
    noRange: 'senza range',
  },

  detail: {
    back: 'Referti',
    edit: 'Modifica referto',
    compareWithPrevious: 'Confronta con il precedente',
    compareWith: 'Confronta con…',
    notes: 'Note',
    delete: 'Elimina referto',
    deleteTitle: 'Eliminare questo referto?',
    deleteBody:
      'Il referto e i suoi valori vengono cancellati da questo dispositivo. Non si può annullare.',
    deleteConfirm: 'Elimina referto',
    cancel: 'Annulla',
    deleted: 'Referto eliminato',
    deleteFailed: 'Non sono riuscito a eliminare il referto. Riprova.',
    saved: 'Referto salvato',
    updated: 'Modifiche salvate',
    notFound: 'Questo referto non esiste più.',
    printedAs: (value: string, range?: string) =>
      range ? `sul referto: ${value}, range ${range}` : `sul referto: ${value}`,
  },

  analyte: {
    back: 'Indietro',
    history: 'Storico',
    date: 'Data',
    value: 'Valore',
    range: 'Range',
    lab: 'Laboratorio',
    outOfRange: 'fuori range',
    units: 'Unità',
    oneReport: 'Il grafico compare dal secondo referto.',
    excluded: (n: number, unit: string) =>
      n === 1
        ? `1 valore è in un’unità che non posso convertire in ${unit}: lo trovi nella tabella.`
        : `${n} valori sono in un’unità che non posso convertire in ${unit}: li trovi nella tabella.`,
    excludedNoUnit: (n: number) =>
      n === 1
        ? '1 valore ha un’unità diversa da quella degli altri: lo trovi nella tabella.'
        : `${n} valori hanno un’unità diversa da quella degli altri: li trovi nella tabella.`,
    empty: 'Nessun valore per questa voce.',
    toReports: 'Vai ai referti',
    loadFailed: 'Non sono riuscito a leggere i valori. Riprova.',
    unitNotSaved:
      'Non sono riuscito a ricordare questa unità: la prossima volta vedrai quella di prima.',
    printedRange: (range: string) => `range stampato ${range}`,
    bandLabel: 'range stampato',
    points: 'Punti del grafico',
    openReport: 'Apri il referto',
    inRange: 'dentro il range stampato',
    aboveRange: 'sopra il range stampato',
    belowRange: 'sotto il range stampato',
    outRange: 'fuori dal range stampato',
    pointLabel: (p: { date: string; value: string; state: string | null }) =>
      p.state ? `${p.date}: ${p.value}, ${p.state}` : `${p.date}: ${p.value}`,
    legendIn: 'dentro il range stampato',
    legendOut: 'fuori dal range stampato',
    legendOpen: 'valore con < o >',
    imageFooter: 'Da Bloodio, non è un referto medico',
    saveImage: 'Salva immagine',
    imageFailed: 'Non sono riuscito a creare l’immagine. Riprova.',
    summary: (s: {
      name: string;
      from: string;
      to: string;
      count: number;
      above: number;
      below: number;
      first: string;
      last: string;
      unit: string | null;
    }) => {
      const to = (word: string) => (/^a/i.test(word) ? 'ad' : 'a');
      const period =
        s.from === s.to ? `${to(s.from)} ${s.from}` : `da ${s.from} ${to(s.to)} ${s.to}`;
      const parts = [s.count === 1 ? '1 misura' : `${s.count} misure`];
      if (s.above > 0) parts.push(`${s.above} sopra il range stampato`);
      if (s.below > 0) parts.push(`${s.below} sotto il range stampato`);
      const unit = s.unit ? ` ${s.unit}` : '';
      return `${s.name} ${period}: ${parts.join(', ')}, da ${s.first} ${to(s.last)} ${s.last}${unit}.`;
    },
  },
  values: {
    title: 'Valori',
    search: 'Cerca',
    searchPlaceholder: 'Nome, per esempio glicemia',
    empty: 'Nessun valore ancora. Carica un referto per seguire i tuoi valori nel tempo.',
    load: 'Carica un referto',
    noMatch: 'Nessuna voce con questo nome.',
    loadFailed: 'Non sono riuscito a leggere i valori. Riprova.',
  },
  home: {
    title: 'Home',
    loadFailed: 'Non sono riuscito a leggere i tuoi dati. Riprova.',
    slabLabel: (date: string, lab: string, out: number) =>
      `Ultimo referto, ${date}, ${lab}, ${out === 1 ? '1 valore' : `${out} valori`} fuori range`,
    summary: (out: number, inside: number, notEvaluable: number) => {
      const parts = [
        `${out === 1 ? '1 valore' : `${out} valori`} fuori dal range stampato`,
        `${inside} dentro`,
      ];
      if (notEvaluable > 0) {
        parts.push(`${notEvaluable} non valutabil${notEvaluable === 1 ? 'e' : 'i'}`);
      }
      return `${parts.join(', ')}.`;
    },
    outOfRange: 'Fuori range',
    watch: 'Da tenere d’occhio',
    watchHint: 'vicino al limite del range stampato',
    watchLabel: {
      upper: 'vicino al limite, in salita',
      lower: 'vicino al limite, in discesa',
    } satisfies Record<WatchSide, string>,
    older: 'Da referti precedenti',
    olderHidden: (n: number) => `Più vecchi di 12 mesi: ${n === 1 ? '1 valore' : `${n} valori`}`,
    recent: 'Ultimi referti',
    allReports: 'Tutti i referti',
    backup: {
      text: 'Ci sono dati non ancora esportati.',
      export: 'Esporta ora',
      later: 'Più tardi',
      noFiles: 'I file originali non sono inclusi.',
      toSettings: 'Per includerli esporta da Impostazioni.',
    },
  },

  compare: {
    title: 'Confronto',
    backTo: (date: string) => `Referto del ${date}`,
    older: 'Prima',
    newer: 'Dopo',
    change: 'Cambia referto',
    onlyCommon: 'Solo in comune',
    summary: (common: number, single: number) => {
      const inCommon = common === 1 ? '1 voce in comune' : `${common} voci in comune`;
      return single === 0 ? inCommon : `${inCommon} · ${single} in un solo referto`;
    },
    noCommon: 'Nessuna voce in comune',
    noneInCommon: 'Nessuna voce in comune tra questi due referti.',
    changed: 'Cambiati rispetto al range',
    noneChanged: 'Nessuna voce è entrata o uscita dal range.',
    transition: {
      'now-above': '↑ ora sopra',
      'now-below': '↓ ora sotto',
      'now-out': 'ora fuori range',
      'now-in': 'ora nel range',
    },
    transitionSpoken: {
      'now-above': 'ora sopra il range',
      'now-below': 'ora sotto il range',
      'now-out': 'ora fuori range',
      'now-in': 'ora nel range',
    },
    onlyIn: (date: string) => `solo nel referto del ${date}`,
    differentUnits: 'unità diverse, non confrontabili',
    limit: {
      older: 'il valore precedente è un limite, nessuna differenza',
      newer: 'il valore recente è un limite, nessuna differenza',
      both: 'i due valori sono limiti, nessuna differenza',
    },
    rangeChanged: (from: string, to: string) => `range cambiato: ${from} → ${to}`,
    noRange: 'nessun range',
    unchanged: 'invariato',
    underOnePercent: '< 1%',
    plus: 'più',
    minus: 'meno',
    underOnePercentSpoken: 'sotto l’1%',
    fromTo: (older: string, newer: string) => `da ${older} a ${newer}`,
    notFound: 'Questo confronto non è più disponibile: uno dei due referti è stato eliminato.',
    sameReport: 'Scegli due referti diversi.',
    toReports: 'Vai ai referti',
    loadFailed: 'Non sono riuscito a leggere i referti. Riprova.',
    sheetTitle: (date: string) => `Confronta il ${date} con`,
    inCommon: (n: number) =>
      n === 0 ? 'nessuna voce in comune' : n === 1 ? '1 voce in comune' : `${n} voci in comune`,
    previous: 'precedente',
    cancel: 'Annulla',
    confirm: 'Confronta',
  },

  importer: {
    title: 'Carica un referto',
    lead: 'Scegli il PDF del laboratorio, oppure le foto o le scansioni delle pagine. Viene letto su questo dispositivo e non lascia mai il telefono.',
    choose: 'Scegli il referto',
    manual: 'Inserisci i valori a mano',
    reading: 'Lettura del referto…',
    ocrLoading: 'Preparazione della lettura…',
    ocrPage: (page: number, pages: number) =>
      pages === 1 ? 'Lettura della pagina…' : `Lettura della pagina ${page} di ${pages}…`,
    cancel: 'Annulla',
    cancelled: 'Lettura annullata.',
    duplicateTitle: 'Questo file è già stato caricato',
    duplicateBody: (date: string) => `Corrisponde al referto del ${date}.`,
    openExisting: 'Apri il referto',
    continueAnyway: 'Carica comunque',
    errors: {
      'unsupported-type':
        'Questo tipo di file non è supportato. Scegli il PDF del referto o le foto delle pagine.',
      password: 'Questo PDF è protetto da password. Togli la protezione e riprova.',
      unreadable: 'Non riesco a leggere questo file: sembra danneggiato.',
      'mixed-selection': 'Scegli un solo PDF, oppure una o più immagini.',
      'heic-unsupported': 'Questo browser non apre le foto HEIC. Salvale in JPEG e riprova.',
      'ocr-unavailable':
        'Non riesco a preparare la lettura delle immagini. La prima volta serve la connessione.',
    } satisfies Record<IngestErrorCode, string>,
    noRows: 'Non ho trovato valori in questo PDF. Controlla che sia un referto di laboratorio.',
    noRowsOcr:
      'Non ho trovato valori nelle pagine lette. Prova con una foto o una scansione più nitida, dritta e ben illuminata, oppure inserisci i valori a mano.',
  },

  verify: {
    title: 'Controlla i valori letti',
    lead: (total: number, pending: number) => {
      const read = total === 1 ? '1 valore letto' : `${total} valori letti`;
      return pending === 0
        ? `${read}. Niente viene salvato finché non confermi.`
        : `${read}, ${pending} da controllare. Niente viene salvato finché non confermi.`;
    },
    ocrNotice: 'Valori letti da un’immagine: confronta ognuno con il referto prima di salvare.',
    ocrNoticeTrusted:
      'Valori letti da un’immagine: quelli segnati vanno confrontati con il referto, gli altri controllali comunque a colpo d’occhio.',
    sampleDate: 'Data del prelievo',
    lab: 'Laboratorio',
    type: 'Tipo',
    notes: 'Note',
    filterPending: (n: number) => `Da controllare, ${n}`,
    filterAll: (n: number) => `Tutti, ${n}`,
    nothingPending: 'Niente da controllare.',
    analyte: 'Voce',
    chooseAnalyte: 'Scegli la voce',
    value: 'Valore',
    unit: 'Unità',
    refMin: 'Minimo',
    refMax: 'Massimo',
    refText: 'Range come stampato',
    maybe: (name: string) => `Forse: ${name}`,
    useSuggestion: 'Usa questo',
    printed: (text: string) => `stampato: ${text}`,
    suggestedReference: (date: string) => `Unità e range dal referto del ${date}`,
    confirmRow: 'Ho controllato',
    confirmed: 'controllato',
    readWell: 'letto bene',
    deleteRow: 'Elimina riga',
    viewOriginal: 'Vedi originale',
    addRow: 'Aggiungi un valore',
    save: 'Salva referto',
    saving: 'Salvataggio…',
    discard: 'Annulla',
    saveFailed: 'Non sono riuscito a salvare il referto. I valori sono ancora qui: riprova.',
    duplicateTitle: (date: string) => `Esiste già un referto del ${date} per questo laboratorio.`,
    saveAnyway: 'Salva comunque',
    missingDate: 'Indica la data del prelievo.',
    fixRows: (n: number) => (n === 1 ? 'Una riga è incompleta.' : `${n} righe sono incomplete.`),
    ocrUnit: (read: string, unit: string) =>
      `Unità letta «${read}», interpretata come ${unit}. Controlla con il referto.`,
    flags: {
      'ambiguous-number':
        'Il punto può essere decimale o migliaia. Controlla il numero sul referto.',
      'age-stratified-ref':
        'Il referto stampa il range per fasce d’età. Ho preso la fascia adulta.',
      'derived-ref':
        'Il referto stampa il range su più righe. Ho preso la riga indicata come normale.',
      'unit-mismatch':
        'Questa unità non è tra quelle note per questa voce. Controlla che sia giusta.',
      'ambiguous-analyte': 'Più voci hanno questo nome. Scegli quella giusta.',
      'suggested-analyte': 'Il nome non corrisponde esattamente a nessuna voce.',
      'unknown-analyte': 'Non è nel catalogo. Scegli una voce o salvala come personalizzata.',
      'low-ocr': 'Letto da un’immagine. Confronta con il referto.',
    } satisfies Record<Exclude<RowFlag, 'ocr-unit'>, string>,
    problems: {
      'no-analyte': 'Scegli la voce.',
      'no-value': 'Scrivi il valore.',
      'bad-ref-min': 'Il minimo non è un numero.',
      'bad-ref-max': 'Il massimo non è un numero.',
      'ref-order': 'Il minimo è più alto del massimo.',
    } satisfies Record<RowProblem, string>,
  },

  original: {
    title: (page: number, pages: number) => `Pagina ${page} di ${pages}`,
    close: 'Chiudi',
    preparing: 'Preparazione della pagina…',
    failed: 'Non riesco a mostrare la pagina.',
    alt: (page: number, name: string) => `Pagina ${page} del referto, riga ${name} evidenziata`,
    zoomIn: 'Ingrandisci',
    zoomOut: 'Riduci',
    fit: 'Adatta alla larghezza',
  },

  picker: {
    title: 'Scegli la voce',
    search: 'Cerca per nome',
    createCustom: (name: string) => `Salva «${name}» come voce personalizzata`,
    custom: 'personalizzato',
    close: 'Chiudi',
    empty: 'Nessuna voce con questo nome.',
  },

  settings: {
    title: 'Impostazioni',
    keepOriginal: 'Conserva il file originale',
    keepOriginalHint:
      'Salva anche il file originale (PDF o foto) accanto ai valori. Occupa più spazio sul dispositivo.',
    disclaimer: 'Cosa fa e cosa non fa Bloodio',
    version: (v: string) => `Versione ${v}`,

    theme: {
      title: 'Aspetto',
      nero: 'Nero',
      neroHint: 'Fondo nero, il tema di Bloodio.',
      carta: 'Carta',
      cartaHint: 'Fondo bianco, per la luce forte.',
      auto: 'Automatico',
      autoHint: 'Segue il tema chiaro o scuro del dispositivo.',
    },

    units: {
      title: 'Unità',
      printed: 'Come sul referto',
      printedHint: 'Ogni valore nell’unità stampata dal laboratorio.',
      conventional: 'Convenzionali',
      conventionalHint: 'Per esempio colesterolo in mg/dL.',
      si: 'Sistema internazionale (SI)',
      siHint: 'Per esempio colesterolo in mmol/L.',
      resetPerEntry: (n: number) => `Ripristina le unità scelte per singole voci (${n})`,
      resetConfirm: (n: number) =>
        n === 1
          ? 'Una voce ha un’unità scelta a mano. Ripristinarla?'
          : `${n} voci hanno un’unità scelta a mano. Ripristinarle?`,
      resetDo: 'Ripristina',
      resetFailed: 'Non sono riuscito a ripristinare le unità. Riprova.',
      cancel: 'Annulla',
    },

    data: {
      title: 'I tuoi dati',
      export: 'Esporta i dati',
      exporting: 'Esportazione…',
      includeFiles: (count: number, size: string) => `Includi i file originali (${count}, ${size})`,
      exportFailed: 'Non sono riuscito a esportare i dati. Riprova.',
      neverExported: 'Non hai ancora esportato i tuoi dati.',
      lastExport: (date: string) => `Ultima esportazione: ${date}.`,
      pending: 'Ci sono dati non ancora esportati.',
      import: 'Importa un file',
      notJson: 'Questo file non è un export di Bloodio.',
      tooNew: 'Questo file viene da una versione più recente di Bloodio. Aggiorna l’app e riprova.',
      invalid: 'Il file non è valido.',
      invalidDetails: 'Dettagli',
      importFailed: 'Importazione non riuscita. I tuoi dati non sono cambiati.',
      imported: (added: number, skipped: number) =>
        [
          added === 1 ? 'Importato 1 referto' : `Importati ${added} referti`,
          skipped === 0 ? null : skipped === 1 ? '1 già presente' : `${skipped} già presenti`,
        ]
          .filter(Boolean)
          .join(', '),
    },

    importDialog: {
      title: 'Importa i dati',
      exportedOn: (date: string) => `Esportato il ${date}`,
      counts: (reports: number, values: number) =>
        `${reports === 1 ? '1 referto' : `${reports} referti`}, ${values === 1 ? '1 valore' : `${values} valori`}`,
      period: (from: string, to: string) => (from === to ? `Del ${from}` : `Dal ${from} al ${to}`),
      labs: (labs: string) => `Laboratori: ${labs}`,
      duplicates: (n: number) =>
        n === 1 ? '1 referto è già presente qui.' : `${n} referti sono già presenti qui.`,
      merge: 'Unisci',
      mergeHint: 'Unisci aggiunge i referti nuovi e tiene quelli che hai già.',
      replace: 'Sostituisci',
      import: 'Importa',
      replaceTitle: 'Sostituire tutti i tuoi dati?',
      replaceBody: (n: number) =>
        n === 1
          ? 'Il tuo referto attuale sarà cancellato e sostituito da quelli del file.'
          : `I tuoi ${n} referti attuali saranno cancellati e sostituiti da quelli del file.`,
      replaceDropsFiles:
        'Anche i file originali conservati su questo dispositivo saranno cancellati: questo file non li contiene.',
      replaceConfirm: 'Sostituisci tutto',
      cancel: 'Annulla',
    },

    storage: {
      title: 'Archivio',
      persisted: 'Archivio protetto: il browser non cancella i dati da solo.',
      notPersisted: 'Il browser può cancellare i dati se manca spazio. Esporta regolarmente.',
      protect: 'Proteggi l’archivio',
      usage: (size: string) => `Spazio usato: ${size}`,
    },

    app: {
      title: 'Uso come app',
      offlinePreparing: 'Sto preparando Bloodio per l’uso senza connessione.',
      offlineReady: 'Bloodio funziona anche senza connessione.',
      ocrDownloading: 'Sto scaricando la lettura di foto e scansioni per l’uso senza connessione.',
      ocrReady: 'Anche la lettura di foto e scansioni funziona senza connessione.',
      ocrPaused: 'La lettura di foto e scansioni senza connessione non è ancora pronta.',
      ocrDownload: (size: string) => `Scarica ora (${size})`,
      install:
        'Puoi aggiungere Bloodio alla schermata Home e aprirlo come un’app. Su iPhone e iPad tocca Condividi, poi «Aggiungi alla schermata Home». Su Android e sul computer cerca nel menu del browser la voce per installare l’app.',
    },

    wipe: {
      action: 'Elimina tutti i dati',
      title: 'Eliminare tutti i dati?',
      body: (reports: number, values: number) =>
        `${reports === 1 ? '1 referto' : `${reports} referti`}, ${values === 1 ? '1 valore' : `${values} valori`}, i file originali, le voci personalizzate e le impostazioni. Non si può annullare.`,
      bodyUnknown:
        'Tutti i referti, i valori, i file originali, le voci personalizzate e le impostazioni. Non si può annullare.',
      exportFirst: 'Esporta prima',
      continue: 'Continua',
      confirmTitle: 'Ultima conferma',
      confirmBody: 'Tutti i dati di Bloodio su questo dispositivo spariscono adesso.',
      confirm: 'Elimina definitivamente',
      cancel: 'Annulla',
      failed: 'Eliminazione non riuscita. I tuoi dati sono ancora qui.',
    },
  },
} as const;

const DATE_LONG = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const DATE_SHORT = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function parseIso(isoDate: string): Date {
  const [year = 1970, month = 1, day = 1] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "20 agosto 2022" */
export const formatDateLong = (isoDate: string) => DATE_LONG.format(parseIso(isoDate));
/** "20 ago 2022" */
export const formatDateShort = (isoDate: string) => DATE_SHORT.format(parseIso(isoDate));

const NUMBER = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 });

/** Numbers for reading, grouped the Italian way: "4.320.000", "1,029". Edit fields use formatNumber instead. */
export const formatDisplayNumber = (value: number) => NUMBER.format(value);

const MONTH_SHORT = new Intl.DateTimeFormat('it-IT', { month: 'short', year: '2-digit' });
const MONTH_LONG = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

/** "giu 21", for chart axes. */
export const formatMonthShort = (isoDate: string) => MONTH_SHORT.format(parseIso(isoDate));
/** "giugno 2021" */
export const formatMonthLong = (isoDate: string) => MONTH_LONG.format(parseIso(isoDate));

const CONVERTED_SMALL = new Intl.NumberFormat('it-IT', { maximumSignificantDigits: 3 });
const CONVERTED_LARGE = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });

/**
 * A value converted from the unit it was printed in: three significant digits, whole numbers
 * from 1000 up. A conversion must not show more precision than the laboratory printed.
 */
export const formatConvertedNumber = (value: number) =>
  Math.abs(value) >= 1000 ? CONVERTED_LARGE.format(value) : CONVERTED_SMALL.format(value);

const SIZE_MB = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

/** "340 KB", "1,2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${SIZE_MB.format(bytes / (1024 * 1024))} MB`;
}
