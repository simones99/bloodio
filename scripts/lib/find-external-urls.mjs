// Finds absolute or protocol-relative URLs in a text and drops the allowlisted ones.
// Absolute URLs anywhere; protocol-relative URLs only at the start of a string literal or url(),
// otherwise minified regex literals such as `/x//i.test(e)` look like hosts.
const URL_PATTERN =
  /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>\\]*|(?<=["'`(])\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`)<>\\]*/gi;

/**
 * @param {string} text
 * @param {{ prefix: string, reason: string }[]} allowlist
 * @returns {string[]} external URLs that are not allowlisted, deduplicated
 */
export function findExternalUrls(text, allowlist) {
  const found = new Set();
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    const normalized = url.startsWith('//') ? `https:${url}` : url;
    if (allowlist.some((entry) => normalized.startsWith(entry.prefix))) continue;
    found.add(url);
  }
  return [...found];
}
