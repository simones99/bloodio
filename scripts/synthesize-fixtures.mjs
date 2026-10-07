// Rewrites every PositionedText fixture in tests/fixtures/positioned/ with invented data.
//
// The fixtures keep the exact layout of the lab reports the parsers were written against
// (text items, positions, analyte names, units, reference ranges, number formatting), but
// everything that describes a person is synthetic:
//   - analyte values are drawn at random (fixed seed) around the printed reference range, with
//     a share of out-of-range values so the flagging logic stays exercised; white-cell counts
//     and red-cell indices are derived from each other so a report stays internally coherent;
//   - qualitative results (urine colour, sediment) are drawn from a list of common findings;
//   - dates are moved to 2021-2022 (same order between reports, one offset per report) and
//     clock times are redrawn;
//   - any identifier of five or more digits is replaced with random digits, except the
//     all-zero and "00100" placeholders;
//   - the place name in the letterhead ("... - CITY") and before the report date ("City, date")
//     becomes the invented town of PLACEHOLDER_CITY, so the fixtures do not reveal where the
//     reports come from.
// Patient fields were already placeholders (ROSSI MARIO, 01/01/1980, ...) and are left alone.
// Each file is renamed after its new sample date.
//
// The output only depends on the layout and on the seed, so running the script again on its own
// output is a no-op.
// Usage:
//   node scripts/synthesize-fixtures.mjs                              rewrite the committed fixtures in place
//   node scripts/synthesize-fixtures.mjs --from examples/positioned   synthesize the local output of
//                                                                     make-fixtures.mjs into tests/fixtures/positioned
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const DIR = 'tests/fixtures/positioned';
const SEED = 20210301;
const OUT_OF_RANGE_SHARE = 0.25;
const PLACEHOLDER_DATES = new Set(['01/01/1980']);
const PLACEHOLDER_IDS = new Set(['00100']);
const PLACEHOLDER_CITY = 'Vallerosa';
// "Azienda Sanitaria Territoriale - CITY", "PRESIDIO OSPEDALIERO - CITY".
const LETTERHEAD_CITY =
  /^((?:Azienda Sanitaria Territoriale|Presidio Ospedaliero)\s*[-–]\s*)\S.*$/i;
// "City, 04/10/2021" before the report date.
const PLACE_DATE = /^\p{Lu}[\p{L}' ]*(?=,\s*\d{2}\/\d{2}\/\d{4})/u;

// Reference ranges that are a classification table rather than "da A a B".
const RANGE_OVERRIDES = { 'Vitamina D (25 OH)': [30, 100] };

const QUALITATIVE = {
  Colore: ['Giallo', 'Giallo chiaro', 'Paglierino', 'Giallo ambrato'],
  Aspetto: ['Limpido', 'Leggermente torbido'],
  Cristalli: ['Rari, di acido urico', 'Alcuni, di fosfati amorfi', 'Rari, di fosfato triplo'],
  'Cellule epiteliali squamose': ['Assenti', 'Alcune', 'Scarse'],
};

// ---------------------------------------------------------------------------------------------
// Deterministic randomness

function hash(text) {
  let h = 2166136261 ^ SEED;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function rng(key) {
  let a = hash(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r, lo, hi) => lo + r() * (hi - lo);

// ---------------------------------------------------------------------------------------------
// Numbers as the labs print them

const GROUPED = /^\d{1,3}(\.\d{3})+$/;

/** "4.500.000" -> 4500000, "0,27" -> 0.27, "1.007" -> 1007 (the lab groups thousands with dots). */
function parseLabNumber(text) {
  const t = text.trim();
  if (GROUPED.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return null;
}

function group(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formats like `template`: same decimals, decimal comma, dot-grouped integers. */
function formatLike(template, n, unit) {
  const t = template.trim();
  const comma = /^\d+,(\d+)$/.exec(t);
  if (comma) {
    // Some rows print one decimal padded with a zero ("12,30"): keep that habit.
    const decimals = comma[1].length;
    const padded = decimals > 1 && comma[1].endsWith('0');
    return (padded ? n.toFixed(decimals - 1) + '0' : n.toFixed(decimals)).replace('.', ',');
  }
  const step = integerStep(n, unit);
  // A small integer ("1" against "< 1,75") would round most draws back to the printed value,
  // so it gets one decimal instead.
  if (/^\d+$/.test(t) && step === 1 && n < 10) return n.toFixed(1).replace('.', ',');
  const rounded = Math.max(step === 1 ? 1 : step, Math.round(n / step) * step);
  return rounded >= 1000 ? group(rounded) : String(rounded);
}

/** Cell counts are printed with three significant digits and never below tens. */
function integerStep(n, unit) {
  if (!/\/\s*[μµu]l/i.test(unit)) return 1;
  const digits = String(Math.round(Math.abs(n))).length;
  return Math.max(10, 10 ** (digits - 3));
}

/** [min, max] from a printed reference; null when the reference is not numeric. */
function parseRange(lines, name) {
  if (RANGE_OVERRIDES[name]) return RANGE_OVERRIDES[name];
  const adult = lines.find((l) => /Da 11 anni in poi/i.test(l));
  const candidates = adult ? [adult.replace(/^.*?:\s*/, '')] : lines;
  for (const line of candidates) {
    const l = line.trim();
    let m;
    if ((m = /^da\s+(\S+)\s+a\s+(\S+)$/i.exec(l)))
      return [parseLabNumber(m[1]), parseLabNumber(m[2])];
    if ((m = /^(?:<|Fino a)\s*(\S+)$/i.exec(l))) return [null, parseLabNumber(m[1])];
    if ((m = /^>\s*(\S+)$/.exec(l))) return [parseLabNumber(m[1]), null];
    if ((m = /^(\d[\d,]*)-(\d[\d,]*)$/.exec(l)))
      return [parseLabNumber(m[1]), parseLabNumber(m[2])];
  }
  return null;
}

function drawValue(r, range) {
  const [lo, hi] = range;
  const out = r() < OUT_OF_RANGE_SHARE;
  if (lo !== null && hi !== null) {
    const span = hi - lo;
    if (!out) return between(r, lo + span * 0.08, hi - span * 0.08);
    // Going below the range must not change the printed magnitude (specific gravity 1.0xx).
    const floor = lo - span * 0.35;
    const low =
      r() < 0.4 &&
      floor > 0 &&
      Math.round(floor).toString().length === Math.round(lo).toString().length;
    return low
      ? between(r, lo - span * 0.35, lo - span * 0.05)
      : between(r, hi + span * 0.05, hi + span * 0.45);
  }
  if (hi !== null) return out ? between(r, hi * 1.08, hi * 1.9) : between(r, hi * 0.15, hi * 0.9);
  return out ? between(r, lo * 0.4, lo * 0.9) : between(r, lo * 1.05, lo * 2);
}

// ---------------------------------------------------------------------------------------------
// Layout helpers (same column logic as the parsers)

const center = (i) => i.x + i.w / 2;
const find = (page, re) => page.items.find((i) => re.test(i.text.trim()));

function columns(page) {
  const refH = find(page, /^(Valori di riferimento|Val\. riferimento)$/i);
  const unitH = find(page, /^U\.?M\.?$/i);
  if (!refH || !unitH) return null;
  const refLeft = refH.x - refH.w * 0.25;
  const counts = new Map();
  for (const i of page.items)
    if (i.y > refH.y && i.x < refLeft && i.x > 150 && /^[<>]?\s*\d/.test(i.text))
      counts.set(Math.round(i.x), (counts.get(Math.round(i.x)) ?? 0) + 1);
  const valueX = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (valueX === undefined) return null;
  // Reference, unit and method are centred under their headings: pick the closest heading.
  const headers = [
    ['ref', refH],
    ['unit', unitH],
    ['method', find(page, /^Metodica$/i)],
  ].filter(([, h]) => h);
  const columnOf = (i) =>
    i.x < refLeft
      ? null
      : headers.reduce((best, [col, h]) =>
          Math.abs(center(i) - center(h)) < Math.abs(center(i) - center(best[1])) ? [col, h] : best,
        )[0];
  const isRef = (i) => columnOf(i) === 'ref';
  const isUnit = (i) => columnOf(i) === 'unit';
  return { top: refH.y, valueX, isRef, isUnit };
}

// ---------------------------------------------------------------------------------------------

let widthFont;
async function textWidth(text) {
  if (!widthFont) {
    const pdf = await PDFDocument.create();
    widthFont = await pdf.embedFont(StandardFonts.Helvetica);
  }
  return widthFont.widthOfTextAtSize(text.replace(/[μ]/g, 'µ'), 1);
}

async function setText(item, text) {
  if (item.text === text) return;
  const ratio = (await textWidth(text)) / (await textWidth(item.text));
  item.text = text;
  item.w = Number((item.w * ratio).toFixed(1));
}

function sampleDateOf(fixture) {
  const text = fixture.pages.flatMap((p) => p.items.map((i) => i.text)).join('\n');
  const m =
    /\p{Lu}[\p{L}' ]*,\s*(\d{2})\/(\d{2})\/(\d{4})/u.exec(text) ??
    /(\d{2})\/(\d{2})\/(\d{4})\s+\d{2}:\d{2}\s*\nCheck-in/.exec(text);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const any = [...text.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].find(
    (d) => !PLACEHOLDER_DATES.has(d[0]),
  );
  if (!any) throw new Error('No sample date found');
  return new Date(Date.UTC(+any[3], +any[2] - 1, +any[1]));
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.toISOString().slice(0, 10);
const DAY = 86400000;

/** Sorted, distinct sample dates in 2021-2022, at least five weeks apart. */
function syntheticDates(count) {
  const r = rng('dates');
  const start = Date.UTC(2021, 0, 11);
  const span = Date.UTC(2022, 11, 16) - start;
  for (;;) {
    const days = Array.from({ length: count }, () => Math.floor(r() * (span / DAY))).sort(
      (a, b) => a - b,
    );
    if (days.every((d, i) => i === 0 || d - days[i - 1] >= 35))
      return days.map((d) => new Date(start + d * DAY));
  }
}

async function synthesize(fixture, rank, newDate) {
  const sampleDate = sampleDateOf(fixture);
  const shift = newDate - sampleDate;
  const r = rng(`report-${rank}`);

  // Clock times: same count and order, redrawn within a working day.
  const times = [
    ...new Set(
      fixture.pages.flatMap((p) => p.items.flatMap((i) => i.text.match(/\b\d{2}:\d{2}\b/g) ?? [])),
    ),
  ].sort();
  let minute = Math.floor(between(r, 7 * 60, 10 * 60));
  const timeMap = new Map();
  for (const t of times) {
    timeMap.set(t, `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`);
    minute += Math.floor(between(r, 45, 240));
  }

  for (const [pageIndex, page] of fixture.pages.entries()) {
    for (const item of page.items) {
      let text = item.text.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (whole, d, m, y) => {
        const date = Date.UTC(+y, +m - 1, +d);
        // Dates far from the sample (birth date placeholder, laws quoted in the footer) stay.
        if (PLACEHOLDER_DATES.has(whole) || Math.abs(date - sampleDate) > 400 * DAY) return whole;
        const moved = new Date(date + shift);
        return `${pad(moved.getUTCDate())}/${pad(moved.getUTCMonth() + 1)}/${moved.getUTCFullYear()}`;
      });
      text = text.replace(/\b\d{2}:\d{2}\b/g, (t) => timeMap.get(t) ?? t);
      text = text
        .replace(LETTERHEAD_CITY, (_, prefix) => prefix + PLACEHOLDER_CITY.toUpperCase())
        .replace(PLACE_DATE, PLACEHOLDER_CITY);
      text = text.replace(/(?<![\d.,/])\d{5,}(?![\d.,/])/g, (digits, offset) => {
        if (/^0+$/.test(digits) || PLACEHOLDER_IDS.has(digits)) return digits;
        const ri = rng(`id-${rank}-${pageIndex}-${offset}-${digits.length}`);
        return Array.from(digits, (_, k) =>
          String(Math.floor(ri() * 10) || (k === 0 ? 1 : 0)),
        ).join('');
      });
      await setText(item, text);
    }

    const cols = columns(page);
    if (!cols) continue;
    const rows = new Map();
    const valueItems = page.items.filter((i) => i.y > cols.top && Math.abs(i.x - cols.valueX) < 2);
    for (const [k, item] of valueItems.entries()) {
      const near = (i, below) => i !== item && i.y - item.y > -4 && i.y - item.y < below;
      const name = page.items
        .filter((i) => i.x < cols.valueX - 10 && near(i, 4))
        .sort((a, b) => Math.abs(a.y - item.y) - Math.abs(b.y - item.y))[0]
        ?.text.trim();
      if (!name) continue;
      const unit = page.items.find((i) => cols.isUnit(i) && near(i, 4))?.text.trim() ?? '';
      // The reference sits on the row; a second line only belongs to it when the first one is
      // not a range by itself (age-stratified references), otherwise it is the next row's.
      const refs = page.items
        .filter((i) => cols.isRef(i) && near(i, 11.5))
        .sort((a, b) => a.y - b.y);
      const onRow = refs.filter((i) => i.y - item.y < 4).map((i) => i.text);
      const ri = rng(`value-${rank}-${pageIndex}-${k}`);
      const t = item.text.trim();

      if (QUALITATIVE[name]) {
        const options = QUALITATIVE[name];
        await setText(item, options[Math.floor(ri() * options.length)]);
        continue;
      }
      const comparator = /^([<>])\s*(\d+)$/.exec(t);
      if (comparator) {
        await setText(item, `${comparator[1]}${Math.floor(between(ri, 5, 13))}`);
        continue;
      }
      if (parseLabNumber(t) === null) continue;
      const range =
        parseRange(onRow, name) ??
        parseRange(
          refs.map((i) => i.text),
          name,
        );
      if (!range) continue;
      const n = drawValue(ri, range);
      rows.set(name, { item, unit, n });
    }

    await deriveCoherentValues(rows);
    for (const { item, unit, n } of rows.values())
      await setText(item, formatLike(item.text, n, unit));
  }
}

/** Keeps red-cell indices and the white-cell formula consistent with the counts they come from. */
async function deriveCoherentValues(rows) {
  const v = (name) => rows.get(name)?.n;
  const set = (name, n) => {
    const row = rows.get(name);
    if (row) row.n = n;
  };
  // Hematocrit and hemoglobin follow from the red-cell count and the drawn indices.
  const rbc = v('Globuli rossi'),
    mcv = v('MCV'),
    mchc = v('MCHC');
  if (rbc && mcv && mchc && v('Emoglobina') && v('Valore Ematocrito') && v('MCH')) {
    const hct = ((rbc / 1e6) * mcv) / 10;
    set('Valore Ematocrito', hct);
    set('Emoglobina', (hct * mchc) / 100);
    set('MCH', (mcv * mchc) / 100);
  }
  const pct = ['Eosinofili', 'Basofili', 'Linfociti', 'Monociti'];
  const wbc = v('Globuli bianchi');
  if (wbc && v('Neutrofili') !== undefined && pct.every((n) => v(n) !== undefined)) {
    for (const n of pct) set(n, Math.round(v(n) * 10) / 10);
    set('Neutrofili', Math.round((100 - pct.reduce((s, n) => s + v(n), 0)) * 10) / 10);
    const absolute = {
      Neutrofili: 'NEUTROFILI',
      Eosinofili: 'EOSINOFILI',
      Basofili: 'BASOFILI',
      Linfociti: 'LINFOCITI',
      Monociti: 'MONOCITI',
    };
    for (const [p, a] of Object.entries(absolute)) set(a, (wbc * v(p)) / 100);
  }
}

// ---------------------------------------------------------------------------------------------

const fromFlag = process.argv.indexOf('--from');
const SOURCE = fromFlag === -1 ? DIR : process.argv[fromFlag + 1];
if (!SOURCE) throw new Error('--from needs a directory');
const files = (await readdir(SOURCE)).filter((f) => f.endsWith('.json'));
const fixtures = await Promise.all(
  files.map(async (file) => ({
    file,
    data: JSON.parse(await readFile(join(SOURCE, file), 'utf8')),
  })),
);
fixtures.sort(
  (a, b) => sampleDateOf(a.data) - sampleDateOf(b.data) || a.file.localeCompare(b.file),
);
const dates = syntheticDates(fixtures.length);

for (const [rank, { file, data }] of fixtures.entries()) {
  await synthesize(data, rank, dates[rank]);
  const name = `${file.replace(/-\d{4}-\d{2}-\d{2}\.json$/, '')}-${iso(dates[rank])}.json`;
  await writeFile(join(DIR, name), JSON.stringify(data) + '\n');
  if (SOURCE === DIR && name !== file) await rm(join(DIR, file));
  console.log(`${file} -> ${name}`);
}
