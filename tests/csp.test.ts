import { describe, expect, it } from 'vitest';
import { HEADER_CSP, META_CSP } from '../scripts/csp.mjs';
import { checkCspMeta } from '../scripts/lib/check-csp-meta.mjs';
import { cspMetaTag, cspPlugin, headersFile, securityHeaders } from '../scripts/vite-plugin-csp.ts';

describe('Content Security Policy', () => {
  it('allows only the app origin, plus blob and data images and WebAssembly', () => {
    expect(META_CSP).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; " +
        "style-src 'self'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; " +
        "manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'",
    );
  });

  it('adds frame-ancestors to the header only, where browsers honour it', () => {
    expect(HEADER_CSP).toBe(`${META_CSP}; frame-ancestors 'none'`);
  });
});

describe('cspPlugin', () => {
  it('runs on production builds only', () => {
    expect(cspPlugin().apply).toBe('build');
  });

  it('puts the policy at the top of the head', () => {
    expect(cspMetaTag()).toEqual({
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
      injectTo: 'head-prepend',
    });
  });

  it('writes a _headers file with the policy and two hardening headers', () => {
    expect(headersFile().split('\n')).toEqual([
      '/*',
      `  Content-Security-Policy: ${HEADER_CSP}`,
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: no-referrer',
      '',
    ]);
  });

  it('gives the preview server the same headers as _headers', () => {
    expect(securityHeaders()).toEqual({
      'Content-Security-Policy': HEADER_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
  });
});

describe('checkCspMeta', () => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${META_CSP}">`;

  it('accepts the policy placed before every script and link', () => {
    const html = `<head><meta charset="utf-8">${meta}<link rel="icon" href="favicon.ico"><script type="module" src="a.js"></script></head>`;
    expect(checkCspMeta(html)).toBeNull();
  });

  it('reads the quotes Vite may escape', () => {
    expect(checkCspMeta(`<head>${meta.replaceAll("'", '&#39;')}</head>`)).toBeNull();
  });

  it('reports a missing tag', () => {
    expect(checkCspMeta('<head><script src="a.js"></script></head>')).toMatch(
      /no Content-Security-Policy meta tag/,
    );
  });

  it('reports a policy other than scripts/csp.mjs', () => {
    const html = '<head><meta http-equiv="Content-Security-Policy" content="default-src *"></head>';
    expect(checkCspMeta(html)).toMatch(/differs from scripts\/csp\.mjs/);
  });

  it('reports a tag that comes after a script', () => {
    expect(checkCspMeta(`<head><script src="a.js"></script>${meta}</head>`)).toMatch(
      /before every script, link, base and style/,
    );
  });

  it('ignores a policy that sits inside a comment', () => {
    expect(checkCspMeta(`<head><!-- ${meta} --><meta charset="utf-8"></head>`)).toMatch(
      /no Content-Security-Policy meta tag/,
    );
  });

  it('does not take data-* attributes for the real ones', () => {
    const decoy = `<meta data-http-equiv="Content-Security-Policy" data-content="${META_CSP}" http-equiv="Content-Security-Policy" content="default-src *">`;
    expect(checkCspMeta(`<head>${decoy}</head>`)).toMatch(/differs from scripts\/csp\.mjs/);
    expect(
      checkCspMeta(`<head><meta data-http-equiv="Content-Security-Policy" content="x"></head>`),
    ).toMatch(/no Content-Security-Policy meta tag/);
  });

  it('reports a base or style that comes before the policy', () => {
    expect(checkCspMeta(`<head><base href="/x/">${meta}</head>`)).toMatch(/base and style/);
    expect(checkCspMeta(`<head><style>a{}</style>${meta}</head>`)).toMatch(/base and style/);
  });

  it('reports a policy outside the head', () => {
    expect(checkCspMeta(`<head></head><body>${meta}</body>`)).toMatch(/inside <head>/);
    expect(checkCspMeta(`<body>${meta}</body>`)).toMatch(/inside <head>/);
  });
});
