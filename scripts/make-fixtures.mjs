// Extracts the text layout of local reports in examples/ (git-ignored) as PositionedText JSON,
// with names, addresses, tax codes and birth dates replaced by placeholders.
// The output still carries the report's real values and dates, so it is written inside
// examples/ and never committed. Turn it into a committable fixture with synthetic data:
//   node scripts/synthesize-fixtures.mjs --from examples/positioned
// Usage:
//   node scripts/make-fixtures.mjs --inspect   print header/footer strings to help fill pii.local.json
//   node scripts/make-fixtures.mjs             write examples/positioned/*.json
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { findPersonalPatterns } from './lib/pii-patterns.mjs';

const EXAMPLES = 'examples';
const OUT = join(EXAMPLES, 'positioned');

const config = JSON.parse(await readFile(join(EXAMPLES, 'pii.local.json'), 'utf8'));
const replacements = Object.entries(config.replacements);
const inspect = process.argv.includes('--inspect');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function anonymize(text) {
  let out = text;
  for (const [term, replacement] of replacements) {
    out = out.replace(new RegExp(escapeRegExp(term), 'gi'), replacement);
  }
  return out;
}

async function extract(file) {
  const data = new Uint8Array(await readFile(join(EXAMPLES, file)));
  const doc = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => 'str' in item && item.str.trim() !== '')
      .map((item) => ({
        text: item.str,
        x: Number(item.transform[4].toFixed(1)),
        y: Number((viewport.height - item.transform[5]).toFixed(1)),
        w: Number(item.width.toFixed(1)),
        h: Number(item.height.toFixed(1)),
      }));
    pages.push({ width: viewport.width, height: viewport.height, items });
  }
  return { source: 'pdf-text', pages };
}

await mkdir(OUT, { recursive: true });
for (const [file, name] of Object.entries(config.files)) {
  const positioned = await extract(file);

  if (inspect) {
    console.log(`\n== ${file}`);
    for (const page of positioned.pages) {
      // Personal data lives above the table, in the footer, and next to titles such as "Dott.".
      const header = page.items.find((i) => /^(Valori di riferimento|Esame)$/i.test(i.text.trim()));
      const tableTop = header ? header.y : page.height * 0.37;
      for (const item of page.items) {
        const outsideTable = item.y < tableTop || item.y > page.height * 0.85;
        if (outsideTable || /dott|sig\./i.test(item.text)) console.log('  ' + item.text);
      }
    }
    continue;
  }

  for (const page of positioned.pages) {
    for (const item of page.items) item.text = anonymize(item.text);
  }
  const json = JSON.stringify(positioned);
  for (const [term] of replacements) {
    if (json.toLowerCase().includes(term.toLowerCase())) {
      throw new Error(`Personal term survived anonymization in ${file}. Fix pii.local.json.`);
    }
  }
  for (const page of positioned.pages) {
    for (const [index, item] of page.items.entries()) {
      const problems = findPersonalPatterns(item.text);
      if (problems.length > 0) {
        throw new Error(`Personal data pattern in ${file}: ${problems.join(', ')} (item ${index})`);
      }
    }
  }
  await writeFile(join(OUT, `${name}.json`), json + '\n');
  console.log(`${file} -> ${OUT}/${name}.json (${positioned.pages.length} pages)`);
}
