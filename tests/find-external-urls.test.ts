import { describe, expect, it } from 'vitest';
import { findExternalUrls } from '../scripts/lib/find-external-urls.mjs';

const allowlist = [{ prefix: 'http://www.w3.org/', reason: 'namespace' }];

describe('findExternalUrls', () => {
  it('reports absolute and protocol-relative URLs', () => {
    const text = 'fetch("https://cdn.example.com/x.js"); var a="//fonts.example.org/f.woff2";';
    expect(findExternalUrls(text, [])).toEqual([
      'https://cdn.example.com/x.js',
      '//fonts.example.org/f.woff2',
    ]);
  });

  it('ignores allowlisted prefixes and relative paths', () => {
    const text = 'xmlns="http://www.w3.org/2000/svg" src="./assets/a.js" // comment';
    expect(findExternalUrls(text, allowlist)).toEqual([]);
  });

  it('does not mistake a minified regex literal for a protocol-relative URL', () => {
    expect(findExternalUrls('if(/^a//i.test(e))return', [])).toEqual([]);
    expect(findExternalUrls('url(//cdn.example.com/f.woff2)', [])).toEqual([
      '//cdn.example.com/f.woff2',
    ]);
  });

  it('deduplicates repeated URLs', () => {
    const text = 'https://a.example.com/x https://a.example.com/x';
    expect(findExternalUrls(text, [])).toEqual(['https://a.example.com/x']);
  });
});
