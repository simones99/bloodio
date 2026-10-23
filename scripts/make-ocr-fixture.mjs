// Builds an OCR fixture from an anonymized positioned-text fixture: draws it as a 300 DPI scan in
// Chromium, reads it with tesseract.js in Node and keeps only what src/ocr/to-positioned.ts reads.
// Needs the models in public/ocr/<hash>/lang (scripts/copy-ocr-assets.mjs) and Playwright's Chromium.
// Usage: node scripts/make-ocr-fixture.mjs proavis-2021-07-10
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Tesseract from 'tesseract.js';
import { OCR_DIR, ocrHash } from './ocr-assets.mjs';
import { renderFixturePage } from './lib/render-fixture.mjs';

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/make-ocr-fixture.mjs <fixture name>');
  process.exit(1);
}
const fixture = JSON.parse(await readFile(`tests/fixtures/positioned/${name}.json`, 'utf8'));
if (fixture.pages.length !== 1) {
  console.error(`${name} has ${fixture.pages.length} pages: only one-page fixtures are supported`);
  process.exit(1);
}

const browser = await chromium.launch();
const png = await renderFixturePage(await browser.newPage(), fixture.pages[0]);
await browser.close();

const worker = await Tesseract.createWorker('ita+eng', 1, {
  langPath: `${OCR_DIR}/${ocrHash()}/lang`,
  gzip: true,
  cacheMethod: 'none',
});
const { data } = await worker.recognize(png, {}, { blocks: true });
await worker.terminate();

const box = ({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 });
const blocks = data.blocks.map((block) => ({
  paragraphs: block.paragraphs.map((paragraph) => ({
    lines: paragraph.lines.map((line) => ({
      bbox: box(line.bbox),
      baseline: box(line.baseline),
      rowAttributes: { rowHeight: Math.round(line.rowAttributes.rowHeight * 10) / 10 },
      words: line.words.map((word) => ({
        text: word.text,
        confidence: Math.round(word.confidence * 10) / 10,
        bbox: box(word.bbox),
      })),
    })),
  })),
}));

const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
await mkdir('tests/fixtures/ocr', { recursive: true });
const target = `tests/fixtures/ocr/${name}.json`;
await writeFile(target, JSON.stringify({ width, height, blocks }, null, 1) + '\n');
console.log(`make-ocr-fixture: ${target} (${width}×${height})`);
