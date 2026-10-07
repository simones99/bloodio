// Fails when the production bundle contains an external URL that is not allowlisted.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { findExternalUrls } from './lib/find-external-urls.mjs';

const DIST = 'dist';
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
const problems = [];
for await (const file of walk(DIST)) {
  if (!TEXT_EXTENSIONS.has(extname(file))) continue;
  const urls = findExternalUrls(await readFile(file, 'utf8'), allowlist);
  for (const url of urls) problems.push(`${file}: ${url}`);
}

if (problems.length > 0) {
  console.error('External URLs found in the production bundle:\n' + problems.join('\n'));
  console.error(
    '\nAllowlist an entry in scripts/bundle-url-allowlist.json only if the string is never fetched.',
  );
  process.exit(1);
}
console.log('check:bundle OK, no external URLs in dist/');
