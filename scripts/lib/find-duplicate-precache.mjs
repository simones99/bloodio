// Reads the precache manifest out of a generated sw.js. Workbox throws
// add-to-cache-list-conflicting-entries when the same URL is precached with two revisions, and the
// service worker then precaches nothing. inspectPrecache returns how many entries were found (0
// means the pattern no longer matches the output, so the duplicate check proves nothing) and the
// URLs listed more than once.
const ENTRY = /["']?\burl["']?\s*:\s*(["'])(.*?)\1/g;

/** Every precached URL, in the order sw.js lists them. */
export function precacheUrls(swSource) {
  return [...swSource.matchAll(ENTRY)].map((match) => match[2]);
}

export function inspectPrecache(swSource) {
  const seen = new Set();
  const duplicates = new Set();
  const urls = precacheUrls(swSource);
  for (const url of urls) {
    if (seen.has(url)) duplicates.add(url);
    seen.add(url);
  }
  return { entries: urls.length, duplicates: [...duplicates] };
}
