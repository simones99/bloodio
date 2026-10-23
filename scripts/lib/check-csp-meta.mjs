// Checks that a built index.html enforces the policy of scripts/csp.mjs.
import { META_CSP } from '../csp.mjs';

const META = /<meta\b[^>]*(?<![\w-])http-equiv=["']Content-Security-Policy["'][^>]*>/i;
const ENTITIES = { '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&quot;': '"', '&amp;': '&' };

/**
 * Why the page does not enforce the policy, or null when it does.
 * @param {string} source
 * @param {string} [expected]
 * @returns {string | null}
 */
export function checkCspMeta(source, expected = META_CSP) {
  // A policy inside a comment is not a policy.
  const html = source.replace(/<!--[\s\S]*?-->/g, '');
  const meta = META.exec(html);
  if (!meta) return 'no Content-Security-Policy meta tag';
  const content = /(?<![\w-])content="([^"]*)"/i.exec(meta[0])?.[1];
  const policy = content?.replace(
    /&#39;|&#x27;|&apos;|&quot;|&amp;/g,
    (entity) => ENTITIES[entity],
  );
  if (policy !== expected)
    return 'the Content-Security-Policy meta tag differs from scripts/csp.mjs';
  const endOfHead = [html.search(/<\/head\b/i), html.search(/<body\b/i)].filter((i) => i !== -1);
  if (endOfHead.some((i) => i < meta.index))
    return 'the Content-Security-Policy meta tag must be inside <head>';
  // A meta policy only covers what the parser meets after it.
  const firstResource = html.search(/<(script|link|base|style)\b/i);
  if (firstResource !== -1 && firstResource < meta.index)
    return 'the Content-Security-Policy meta tag must come before every script, link, base and style';
  return null;
}
