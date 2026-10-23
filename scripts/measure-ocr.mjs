/* global window, document */
// Measures OCR on synthetic or photographed reports with the app's own pipeline (spec 2026-10-16 §3).
// Starts Vite's dev server and Chromium, sends each shot to tools/ocr-measure/ and writes a report.
// Usage: npm run measure:ocr -- --synthetic | --photos
//        [--variant <name>] [--ratio <n>]   the pipeline the unit, confidence and alignment tables describe
//        [--variants a,b] [--reports x,y]   a subset, for a quick run
//        [--out <file>]                     docs/ocr-quality.md or examples/ocr-measure/<date>.md;
//                                           with --photos it must be under examples/
//        [--timeout <minutes>]              per shot and variant, 5 by default
//        [--resume]                         skip what <out>.partial.json already holds
// After each shot the results so far go to <out>.partial.json, removed once the report is written:
// a crash loses at most one shot, and --resume carries on from there.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { createServer } from 'vite';
import { DEGRADATIONS, degradeImage } from './lib/degrade.mjs';
import { renderFixturePage } from './lib/render-fixture.mjs';
import { ocrHash } from './ocr-assets.mjs';

const FIXTURES = [
  'proavis-2022-08-20',
  'proavis-2021-10-04',
  'proavis-2021-07-10',
  'ast-2021-08-30',
];
/** Pre-processing variants of spec §4.1; steps always run in the order light, deskew, binarize. */
const VARIANTS = {
  nessuno: [],
  luce: ['light'],
  'luce+binarizza': ['light', 'binarize'],
  raddrizza: ['deskew'],
  'luce+raddrizza': ['light', 'deskew'],
  'luce+raddrizza+binarizza': ['light', 'deskew', 'binarize'],
};
const RATIOS = [0.4, 0.5, 0.6, 0.7, 0.8, 1];
const WRONG = ['voce sbagliata', 'valore sbagliato', 'unità sbagliata', 'range sbagliato'];
const BANDS = [0, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
const THRESHOLDS = Array.from({ length: 50 }, (_, i) => (50 + i) / 100);
const MAX_LISTED = 40;
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const today = new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(`measure-ocr: ${message}`);
  process.exit(1);
}

const FLAGS = ['synthetic', 'photos', 'resume'];
const VALUE_OPTIONS = ['variant', 'ratio', 'variants', 'reports', 'out', 'timeout'];
const flags = new Set();
const options = {};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const name = args[i].startsWith('--') ? args[i].slice(2) : null;
  if (FLAGS.includes(name)) {
    flags.add(name);
  } else if (VALUE_OPTIONS.includes(name)) {
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`--${name} needs a value`);
    options[name] = value;
    i++;
  } else {
    fail(`unknown argument ${args[i]} (see the usage at the top of the script)`);
  }
}
if (flags.has('synthetic') === flags.has('photos')) {
  fail('usage: npm run measure:ocr -- --synthetic | --photos [options] (see the script)');
}
const corpus = flags.has('photos') ? 'photos' : 'synthetic';
const list = (value) => value.split(',').filter((name) => name !== '');
const focusVariant = options.variant ?? 'nessuno';
const focusRatio = Number(options.ratio ?? '0.6');
const variantNames = list(options.variants ?? Object.keys(VARIANTS).join(','));
if (!variantNames.includes(focusVariant)) variantNames.push(focusVariant);
const reportNames = list(options.reports ?? FIXTURES.join(','));
for (const name of variantNames) {
  if (!(name in VARIANTS))
    fail(`unknown variant ${name}: one of ${Object.keys(VARIANTS).join(', ')}`);
}
for (const name of reportNames) {
  if (!FIXTURES.includes(name)) fail(`unknown report ${name}: one of ${FIXTURES.join(', ')}`);
}
if (reportNames.length === 0) fail('--reports names no report');
if (!RATIOS.includes(focusRatio)) fail(`--ratio must be one of ${RATIOS.join(', ')}`);
const timeoutMinutes = Number(options.timeout ?? '5');
if (!(timeoutMinutes > 0)) fail('--timeout must be a positive number of minutes');
const target =
  options.out ??
  (corpus === 'synthetic' ? 'docs/ocr-quality.md' : join('examples', 'ocr-measure', `${today}.md`));
// Reports of real photos carry the text of real lab reports: they stay in git-ignored examples/.
const fromExamples = relative(resolve('examples'), resolve(target));
if (corpus === 'photos' && (fromExamples.startsWith('..') || isAbsolute(fromExamples))) {
  fail(`with --photos, --out must be under examples/ (git-ignored), not ${target}`);
}
const partialPath = `${target}.partial.json`;

const fixture = async (name) =>
  JSON.parse(await readFile(`tests/fixtures/positioned/${name}.json`, 'utf8'));
const toImage = (name, buffer, mimeType) => ({ name, mimeType, base64: buffer.toString('base64') });

async function syntheticShots(browser) {
  const page = await browser.newPage();
  const shots = [];
  for (const name of reportNames) {
    const truth = await fixture(name);
    for (const degradation of DEGRADATIONS) {
      const images = [];
      for (const [index, fixturePage] of truth.pages.entries()) {
        const png = await renderFixturePage(page, fixturePage);
        const { buffer, mimeType } = await degradeImage(page, png, degradation);
        const extension = mimeType === 'image/png' ? 'png' : 'jpg';
        images.push(toImage(`${name}-p${index + 1}.${extension}`, buffer, mimeType));
      }
      shots.push({ report: name, shot: degradation, condition: degradation, truth, images });
    }
  }
  await page.close();
  return shots;
}

/**
 * examples/photos/<fixture>/<condition>-<n>.jpg, or -p1, -p2 for the pages of one shot. The
 * condition is what comes before the last "-<n>", so it may hold dashes itself.
 */
async function photoShots() {
  const shots = [];
  for (const name of reportNames) {
    const dir = join('examples', 'photos', name);
    if (!existsSync(dir)) continue;
    const truth = await fixture(name);
    const files = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (!item.isFile()) continue;
      if (extname(item.name).toLowerCase() in MIME) files.push(item.name);
      else console.warn(`${name}/${item.name}: skipped, only JPEG and PNG (Chromium has no HEIC)`);
    }
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const groups = new Map();
    for (const file of files) {
      const shot = file.slice(0, -extname(file).length).replace(/-p\d+$/i, '');
      groups.set(shot, [...(groups.get(shot) ?? []), file]);
    }
    for (const [shot, group] of groups) {
      const images = [];
      for (const file of group) {
        images.push(
          toImage(file, await readFile(join(dir, file)), MIME[extname(file).toLowerCase()]),
        );
      }
      if (images.length !== truth.pages.length) {
        console.warn(
          `${name}/${shot}: ${images.length} pages, the report has ${truth.pages.length}`,
        );
      }
      shots.push({ report: name, shot, condition: shot.replace(/-\d+$/, ''), truth, images });
    }
  }
  return shots;
}

const fmt = (n) => String(n).replace('.', ',');
const fmt2 = (n) => (n === null ? '—' : n.toFixed(2).replace('.', ','));
const mean = (values) =>
  values.length === 0 ? '—' : String(Math.round(values.reduce((a, b) => a + b, 0) / values.length));
const share = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);
const entry = (result, ratio) => result.output.byRatio.find((e) => e.ratio === ratio);
const at = (result, ratio) => entry(result, ratio).comparison;
/**
 * Copy of passesTrust in src/parsers/ocr-trust.ts (the source of truth; this file cannot import
 * TS), for matched and extra rows alike. Keep the two in step.
 */
const trustedAt = (row, threshold) =>
  row.trustable && row.ocrConfidence !== null && row.ocrConfidence >= threshold;
const maxOf = (values) => {
  const known = values.filter((v) => v !== null);
  return known.length === 0 ? null : Math.max(...known);
};

function tally(comparison) {
  const count = (outcome) => comparison.rows.filter((row) => row.outcome === outcome).length;
  const byOutcome = Object.fromEntries(WRONG.map((outcome) => [outcome, count(outcome)]));
  return {
    expected: comparison.rows.length,
    missing: count('mancante'),
    found: comparison.rows.length - count('mancante'),
    extra: comparison.extra.length,
    wrong: WRONG.reduce((sum, outcome) => sum + byOutcome[outcome], 0),
    byOutcome,
  };
}

/** Spec §4.2: errors are missing plus wrong rows; the share of them with a wrong value apart. */
function cell(results, ratio) {
  let errors = 0;
  let values = 0;
  for (const result of results) {
    const t = tally(at(result, ratio));
    errors += t.missing + t.wrong;
    values += t.byOutcome['valore sbagliato'];
  }
  return results.length === 0 ? '—' : `${errors} (${values})`;
}

const cleanText = (text) => String(text).replace(/\s+/g, ' ').replace(/\|/g, '/');

/** The focus pipeline's rows: matched rows of the truth and rows read that match none. */
function focusRows(results) {
  const focus = results.filter((r) => r.variant === focusVariant);
  return {
    focus,
    rows: focus.flatMap((r) => at(r, focusRatio).rows.map((row) => ({ ...row, report: r.report }))),
    extras: focus.flatMap((r) =>
      at(r, focusRatio).extra.map((row) => ({ ...row, report: r.report })),
    ),
  };
}

/** The §6.3 summary line, from lowestThreshold in tools/ocr-measure/criterion.ts. */
function criterionLine(criterion) {
  const rule =
    corpus === 'synthetic'
      ? 'sintetico: nessun valore sbagliato né riga in più tra le righe che passano'
      : 'foto: nessun errore tra le righe che passano, almeno 300 righe che passano e almeno il 30% delle righe lette';
  if (criterion === null) return `Criterio §6.3 (${rule}): non calcolato.`;
  if (criterion.threshold !== null) {
    const below =
      criterion.threshold < THRESHOLDS[0]
        ? ` È sotto la tabella qui sotto, che parte da ${fmt(THRESHOLDS[0])}.`
        : '';
    return `Criterio §6.3 (${rule}): la soglia più bassa che lo soddisfa è **${fmt(criterion.threshold)}**.${below}`;
  }
  const first = criterion.atErrorFree;
  const why = criterion.failures.map((failure) =>
    failure === 'errors'
      ? 'ogni soglia fino a 1 lascia passare almeno un errore'
      : failure === 'passing'
        ? `alla prima soglia senza errori (${fmt(first.threshold)}) passano ${first.passing} righe, meno di 300`
        : `alla prima soglia senza errori (${fmt(first.threshold)}) passa il ${share(first.passing, first.read)} delle ${first.read} righe lette, meno del 30%`,
  );
  return `Criterio §6.3 (${rule}): **nessuna soglia soddisfa il criterio**: ${why.join('; ')}.`;
}

function report(all, header, criterion) {
  const ALIGN = header.align;
  const results = all.filter((r) => !r.error);
  const failed = all.filter((r) => r.error);
  const variants = variantNames.filter((v) => results.some((r) => r.variant === v));
  const ratioLabel = fmt(focusRatio);
  const lines = [
    `# Misura OCR: ${corpus === 'synthetic' ? 'immagini sintetiche' : 'foto vere'}`,
    '',
    `Generato il ${today} da \`npm run measure:ocr -- ${process.argv.slice(2).join(' ')}\`. Spec: \`docs/specs/2026-10-16-ocr-quality-design.md\` §3.4.`,
    '',
  ];
  if (failed.length > 0) {
    lines.push(
      `**Misure fallite: ${failed.length}** (righe "errore" nella prima tabella), escluse da ogni conteggio.`,
      '',
    );
  }
  for (const name of [...new Set(results.map((r) => r.report))]) {
    const mine = results.filter((r) => r.report === name);
    lines.push(
      `- \`${name}\`: ${new Set(mine.map((r) => r.shot)).size} scatti, ${new Set(mine.map((r) => r.condition)).size} condizioni`,
    );
  }
  const measuredWith = {
    ocrHash: header.ocrHash,
    preprocess: VARIANTS[focusVariant].join('+'),
    reading: header.reading,
  };
  lines.push(
    '',
    `Misurato con Chromium ${header.chromium}. Le tabelle di unità, confidenza e allineamento descrivono la variante \`${focusVariant}\` con soglia di unione ${ratioLabel}; per accendere la regola con quella pipeline (spec §6.4), \`OCR_TRUST.measuredWith\` è:`,
    '',
    '```json',
    JSON.stringify(measuredWith, null, 2),
    '```',
  );
  if (focusRatio !== header.appRatio || measuredWith.preprocess !== header.appPreprocess) {
    lines.push(
      '',
      `L'app oggi legge con soglia di unione ${fmt(header.appRatio)} (\`WORD_GAP_RATIO\`) e pre-processing "${header.appPreprocess}" (\`PREPROCESS_STEPS\`): prima di incollare \`measuredWith\` vanno portate a ${ratioLabel} e "${measuredWith.preprocess}", altrimenti la guardia di §6.4 tiene la regola spenta.`,
    );
  }

  lines.push(
    '',
    `## Per immagine e variante (soglia di unione ${ratioLabel})`,
    '',
    '| Referto | Scatto | Variante | Attese | Trovate | Mancanti | In più | Voce | Valore | Unità | Range | Pre-processing ms/pagina | Lettura ms/pagina |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of all) {
    if (r.error) {
      lines.push(
        `| ${r.report} | ${r.shot} | ${r.variant} | errore: ${cleanText(r.error)} |${' — |'.repeat(9)}`,
      );
      continue;
    }
    const t = tally(at(r, focusRatio));
    lines.push(
      `| ${r.report} | ${r.shot} | ${r.variant} | ${t.expected} | ${t.found} | ${t.missing} | ${t.extra} | ${WRONG.map((o) => t.byOutcome[o]).join(' | ')} | ${mean(r.output.preprocessMs)} | ${mean(r.output.recognizeMs)} |`,
    );
  }

  lines.push(
    '',
    `## Per condizione e variante (soglia di unione ${ratioLabel})`,
    '',
    'Ogni cella: mancanti + sbagliate (di cui valore sbagliato).',
    '',
    `| Condizione | ${variants.join(' | ')} |`,
    `| --- |${variants.map(() => ' --- |').join('')}`,
  );
  for (const condition of [...new Set(results.map((r) => r.condition))]) {
    const cells = variants.map((v) =>
      cell(
        results.filter((r) => r.condition === condition && r.variant === v),
        focusRatio,
      ),
    );
    lines.push(`| ${condition} | ${cells.join(' | ')} |`);
  }

  lines.push(
    '',
    '## Per variante e soglia di unione',
    '',
    'Ogni cella: mancanti + sbagliate (di cui valore sbagliato), su tutte le immagini.',
    '',
    `| Variante | ${RATIOS.map(fmt).join(' | ')} |`,
    `| --- |${RATIOS.map(() => ' --- |').join('')}`,
  );
  for (const v of variants) {
    const mine = results.filter((r) => r.variant === v);
    const ms = mine.flatMap((r) => r.output.preprocessMs);
    lines.push(
      `| ${v} (pre-processing ${mean(ms)} ms/pagina) | ${RATIOS.map((ratio) => cell(mine, ratio)).join(' | ')} |`,
    );
  }

  const { focus, rows: matched, extras } = focusRows(results);
  const pipeline = `variante ${focusVariant}, soglia di unione ${ratioLabel}`;

  const wrongUnits = matched.filter((r) => r.outcome === 'unità sbagliata');
  lines.push(
    '',
    `## Unità rimaste sbagliate (${pipeline})`,
    '',
    `Unità corrette da §5 e giuste: ${matched.filter((r) => r.unitRepaired && r.outcome === 'giusta').length}. Unità sbagliate perché lette vuote: ${wrongUnits.filter((r) => r.readUnit === '').length} su ${wrongUnits.length}.`,
    '',
    '| Referto | Riga | Letta | Attesa | Corretta da §5 |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const row of wrongUnits) {
    lines.push(
      `| ${row.report} | ${row.name} | ${row.readUnit === '' ? '(vuota)' : row.readUnit} | ${row.expectedUnit ?? '—'} | ${row.unitRepaired ? 'sì' : 'no'} |`,
    );
  }

  // Matched rows the OCR read, and rows read that match none: both could skip review (§6.3).
  const read = matched.filter((r) => r.outcome !== 'mancante');
  const allRead = read.length + extras.length;
  lines.push(
    '',
    `## Confidenza (${pipeline})`,
    '',
    '"Soddisfano §6.2": le condizioni 2–6 più quelle aggiunte (nessuna sovrapposizione, valore senza punto, riga allineata), cioè `ocr.trustable`. Le righe in più sono righe lette che non corrispondono a nessuna riga del referto.',
    '',
    '### Per fascia di `rowOcrConfidence`',
    '',
    '| Fascia | Righe abbinate | Soddisfano §6.2 | Valore sbagliato | Righe in più | In più che soddisfano §6.2 |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  const inBand = (rows, low, high) =>
    rows.filter(
      (r) => r.ocrConfidence !== null && r.ocrConfidence >= low && r.ocrConfidence < high,
    );
  BANDS.forEach((low, i) => {
    const high = BANDS[i + 1] ?? Infinity;
    const band = inBand(read, low, high);
    const extraBand = inBand(extras, low, high);
    const label = i === 0 ? `sotto ${fmt(BANDS[1])}` : `${fmt(low)}–${fmt(BANDS[i + 1] ?? 1)}`;
    lines.push(
      `| ${label} | ${band.length} | ${band.filter((r) => r.trustable).length} | ${band.filter((r) => r.outcome === 'valore sbagliato').length} | ${extraBand.length} | ${extraBand.filter((r) => r.trustable).length} |`,
    );
  });
  const noConfidence = (rows) => rows.filter((r) => r.ocrConfidence === null).length;
  lines.push(`| senza confidenza | ${noConfidence(read)} | — | — | ${noConfidence(extras)} | — |`);

  lines.push(
    '',
    '### Per soglia (§6.3)',
    '',
    `Righe OCR lette: ${allRead} (abbinate ${read.length}, in più ${extras.length}). Passano: righe che soddisfano §6.2 con \`rowOcrConfidence\` almeno pari alla soglia. Errori: righe abbinate che passano e non sono giuste, più ogni riga in più che passa. Quota: passano / righe lette.`,
    '',
    criterionLine(criterion),
    '',
    '| Soglia | Passano | Errori | Di cui valore sbagliato | Di cui in più | Quota | Referto più presente |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const threshold of THRESHOLDS) {
    const passMatched = read.filter((r) => trustedAt(r, threshold));
    const passExtra = extras.filter((r) => trustedAt(r, threshold));
    const passing = [...passMatched, ...passExtra];
    const byReport = new Map();
    for (const r of passing) byReport.set(r.report, (byReport.get(r.report) ?? 0) + 1);
    const [top, topCount] = [...byReport.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const errors = passMatched.filter((r) => r.outcome !== 'giusta').length + passExtra.length;
    lines.push(
      `| ${fmt(threshold)} | ${passing.length} | ${errors} | ${passMatched.filter((r) => r.outcome === 'valore sbagliato').length} | ${passExtra.length} | ${share(passing.length, allRead)} | ${top === undefined ? '—' : `${top} (${share(topCount, passing.length)})`} |`,
    );
  }

  const alignment = focus.flatMap((r) =>
    (entry(r, focusRatio).alignment ?? []).map((row) => ({
      ...row,
      report: r.report,
      shot: r.shot,
    })),
  );
  const generic = focus.filter((r) => entry(r, focusRatio).alignment === null).length;
  lines.push(
    '',
    `## Allineamento (${pipeline})`,
    '',
    `Scarto dalla linea di base del nome, in altezze del nome, di valore, unità e prima riga del range, per le righe che l'adapter del laboratorio ha tagliato dalla lettura (abbinate o no). Tolleranze di \`isAligned\` (\`src/parsers/layout.ts\`): valore ${fmt(ALIGN.value)}, unità ${fmt(ALIGN.unit)}, range ${fmt(ALIGN.ref)}. "Senza dato": righe senza valore, per cui l'adapter non dice nulla. Gli scarti massimi contano solo i campi ritrovati per testo nella pagina. "Giuste": righe tagliate con pagina, nome e valore letto di una riga del referto il cui esito è giusta; le colonne "giuste" ricontano solo quelle, per vedere se le tolleranze scartano righe lette bene.${generic > 0 ? ` Letture finite all'adapter generico, che non allinea, escluse: ${generic}.` : ''}`,
    '',
    '| Referto | Righe | Non allineate | Senza dato | Valore max | Oltre | Unità max | Oltre | Range max | Oltre | Giuste | Giuste non allineate | Valore max giuste | Unità max giuste | Range max giuste |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const name of [...new Set(alignment.map((r) => r.report))]) {
    const mine = alignment.filter((r) => r.report === name);
    const over = (field) =>
      mine.filter((r) => r.offsets[field] !== null && r.offsets[field] > ALIGN[field]).length;
    const max = (field, rows = mine) => fmt2(maxOf(rows.map((r) => r.offsets[field])));
    const right = mine.filter((r) => r.outcome === 'giusta');
    lines.push(
      `| ${name} | ${mine.length} | ${mine.filter((r) => r.aligned === false).length} | ${mine.filter((r) => r.aligned === null).length} | ${max('value')} | ${over('value')} | ${max('unit')} | ${over('unit')} | ${max('ref')} | ${over('ref')} | ${right.length} | ${right.filter((r) => r.aligned === false).length} | ${max('value', right)} | ${max('unit', right)} | ${max('ref', right)} |`,
    );
  }
  const misaligned = alignment.filter((r) => r.aligned === false);
  if (misaligned.length > 0) {
    lines.push(
      '',
      `Righe non allineate${misaligned.length > MAX_LISTED ? ` (le prime ${MAX_LISTED} di ${misaligned.length})` : ''}:`,
      '',
      '| Referto | Scatto | Pagina | Nome letto | Valore letto | Valore | Unità | Range | Esito |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const r of misaligned.slice(0, MAX_LISTED)) {
      lines.push(
        `| ${r.report} | ${r.shot} | ${r.page + 1} | ${r.name} | ${r.value} | ${fmt2(r.offsets.value)} | ${fmt2(r.offsets.unit)} | ${fmt2(r.offsets.ref)} | ${r.outcome ?? 'nessuna riga del referto'} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

const key = (r) => `${r.report}\u0000${r.shot}\u0000${r.variant}`;

execFileSync(process.execPath, ['scripts/copy-ocr-assets.mjs'], { stdio: 'inherit' });
let server;
let browser;
try {
  // base '/': tools/ocr-measure/index.html sets <base href="/">, whatever BASE_PATH says.
  server = await createServer({ base: '/', server: { host: '127.0.0.1' }, logLevel: 'warn' });
  await server.listen();
  browser = await chromium.launch();
  const shots = corpus === 'synthetic' ? await syntheticShots(browser) : await photoShots();
  if (shots.length === 0) {
    throw new Error('No photos: put them in examples/photos/<fixture>/ (spec §3.2)');
  }
  const pageUrl = new URL('tools/ocr-measure/index.html', server.resolvedUrls.local[0]).href;
  // A new page also means a new tesseract worker: the old one goes with the page it ran in.
  const openPage = async () => {
    const opened = await browser.newPage();
    opened.on('pageerror', (error) => console.error(error));
    await opened.goto(pageUrl);
    await opened.waitForFunction(() => document.body.dataset.ready === 'true');
    return opened;
  };
  let page = await openPage();
  const header = {
    ocrHash: ocrHash(),
    chromium: browser.version(),
    ...(await page.evaluate((ratio) => window.settings(ratio), focusRatio)),
  };

  let results = [];
  if (flags.has('resume') && existsSync(partialPath)) {
    const saved = JSON.parse(await readFile(partialPath, 'utf8'));
    if (saved.corpus !== corpus) throw new Error(`${partialPath} holds a ${saved.corpus} run`);
    // Failed shots are tried again.
    results = saved.results.filter((r) => !r.error);
    console.log(`measure-ocr: resuming, ${results.length} measures from ${partialPath}`);
  }
  const done = new Set(results.map(key));
  await mkdir(dirname(target), { recursive: true });
  const timeoutMs = timeoutMinutes * 60_000;
  for (const shot of shots) {
    for (const variant of variantNames) {
      const base = { report: shot.report, shot: shot.shot, condition: shot.condition, variant };
      if (done.has(key(base))) continue;
      process.stdout.write(`${shot.report} ${shot.shot} ${variant}… `);
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`no answer within ${timeoutMinutes} min`)),
            timeoutMs,
          );
        });
        const measuring = page.evaluate((input) => window.measure(input), {
          images: shot.images,
          truth: shot.truth,
          steps: VARIANTS[variant],
          ratios: RATIOS,
        });
        results.push({ ...base, output: await Promise.race([measuring, timeout]) });
        console.log('ok');
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        results.push({ ...base, error: message });
        console.log(`error: ${message}`);
        // The page may still be reading, or be gone: start afresh for the next shot.
        await page.close().catch(() => {});
        page = await openPage();
      } finally {
        clearTimeout(timer);
      }
      await writeFile(partialPath, JSON.stringify({ corpus, results }));
    }
  }

  // In shot order, also after a resume.
  const order = new Map(
    shots.flatMap((shot, i) =>
      variantNames.map((variant, j) => [
        key({ report: shot.report, shot: shot.shot, variant }),
        i * variantNames.length + j,
      ]),
    ),
  );
  results.sort((a, b) => (order.get(key(a)) ?? Infinity) - (order.get(key(b)) ?? Infinity));
  // Each alignment row of the focus pipeline gets the outcome of the truth row it reads, if any.
  for (const r of results) {
    if (r.error || r.variant !== focusVariant) continue;
    const e = entry(r, focusRatio);
    if (!e.alignment) continue;
    const outcomes = await page.evaluate(
      ([truth, rows, cut]) => window.alignmentOutcomes(truth, rows, cut),
      [await fixture(r.report), e.comparison.rows, e.alignment],
    );
    e.alignment = e.alignment.map((row, i) => ({ ...row, outcome: outcomes[i] }));
  }
  const { rows, extras } = focusRows(results.filter((r) => !r.error));
  const criterionRows = [
    ...rows.map(({ outcome, ocrConfidence, trustable }) => ({ outcome, ocrConfidence, trustable })),
    ...extras.map(({ ocrConfidence, trustable }) => ({
      outcome: 'in più',
      ocrConfidence,
      trustable,
    })),
  ];
  const criterion = await page
    .evaluate(
      ([input, synthetic]) => window.lowestThreshold(input, { synthetic }),
      [criterionRows, corpus === 'synthetic'],
    )
    .catch((error) => {
      console.error(error);
      return null;
    });
  await writeFile(target, report(results, header, criterion));
  await rm(partialPath, { force: true });
  console.log(`measure-ocr: ${target}`);
} finally {
  await browser?.close();
  await server?.close();
}
