// Fails when the production bundle contains an external URL that is not allowlisted,
// or when it lacks the pieces that enforce the privacy promise and offline use.
import { access, readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { checkCspMeta } from './lib/check-csp-meta.mjs';
import { inspectPrecache, precacheUrls } from './lib/find-duplicate-precache.mjs';
import { findExternalUrls } from './lib/find-external-urls.mjs';
import { OCR_ASSETS, ocrHash } from './ocr-assets.mjs';

const DIST = 'dist';
const OCR_HASH = ocrHash();
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.webmanifest',
  '.svg',
  '.txt',
  '.map',
]);
// _headers carries the policy to hosts that read it; sw.js and the manifest make the app
// installable and usable offline; the OCR files are what reads scans and photos.
const REQUIRED_FILES = [
  '_headers',
  'sw.js',
  'manifest.webmanifest',
  ...OCR_ASSETS.map((asset) => `ocr/${OCR_HASH}/${asset.to}`),
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const allowlist = JSON.parse(
  await readFile(new URL('./bundle-url-allowlist.json', import.meta.url), 'utf8'),
);
const external = [];
for await (const file of walk(DIST)) {
  if (!TEXT_EXTENSIONS.has(extname(file))) continue;
  const urls = findExternalUrls(await readFile(file, 'utf8'), allowlist);
  for (const url of urls) external.push(`${file}: ${url}`);
}

const missing = [];
for (const name of REQUIRED_FILES) {
  await access(join(DIST, name)).catch(() => missing.push(name));
}

const cspProblem = checkCspMeta(await readFile(join(DIST, 'index.html'), 'utf8').catch(() => ''));

const swSource = await readFile(join(DIST, 'sw.js'), 'utf8').catch(() => '');
const precache = inspectPrecache(swSource);
const precachedOcr = precacheUrls(swSource).filter((url) => url.startsWith('ocr/'));
// One folder only: a second one would be a stale copy that no code version asks for.
const ocrFolders = await readdir(join(DIST, 'ocr')).catch(() => []);

const ocrRouteOk =
  swSource.includes('"bloodio-ocr"') &&
  swSource.includes('cacheWillUpdate') &&
  swSource.includes('ignoreVary');

let failed = false;
if (!ocrRouteOk) {
  console.error('dist/sw.js: the read-only OCR route (cache bloodio-ocr) is missing');
  failed = true;
}
if (external.length > 0) {
  console.error('External URLs found in the production bundle:\n' + external.join('\n'));
  console.error(
    '\nAllowlist an entry in scripts/bundle-url-allowlist.json only if the string is never fetched.',
  );
  failed = true;
}
if (missing.length > 0) {
  console.error('Missing from dist/: ' + missing.join(', '));
  failed = true;
}
if (cspProblem) {
  console.error(`dist/index.html: ${cspProblem}`);
  failed = true;
}
if (precache.entries === 0) {
  console.error('dist/sw.js: no precache entries found');
  failed = true;
}
if (precache.duplicates.length > 0) {
  console.error(
    `dist/sw.js: precache lists these URLs more than once: ${precache.duplicates.join(', ')}`,
  );
  failed = true;
}
if (precachedOcr.length > 0) {
  console.error(`dist/sw.js: the OCR files must not be precached: ${precachedOcr.join(', ')}`);
  failed = true;
}
if (ocrFolders.length > 1) {
  console.error(`dist/ocr/: one folder expected, found ${ocrFolders.join(', ')}`);
  failed = true;
}
if (failed) process.exit(1);
console.log('check:bundle OK, no external URLs in dist/, CSP, OCR and required files in place');
