// Puts the Content Security Policy into production builds: a <meta> tag at the top of
// index.html, and a _headers file for hosts that read it (Netlify, Cloudflare Pages).
// The dev server is left alone: its client and React refresh rely on inline scripts.
import type { HtmlTagDescriptor, Plugin } from 'vite';
import { HEADER_CSP, META_CSP } from './csp.mjs';

export function cspMetaTag(): HtmlTagDescriptor {
  return {
    tag: 'meta',
    attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
    injectTo: 'head-prepend',
  };
}

/** The response headers of the production build: _headers, and vite preview. */
export function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': HEADER_CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}

export function headersFile(): string {
  return [
    '/*',
    ...Object.entries(securityHeaders()).map(([name, value]) => `  ${name}: ${value}`),
    '',
  ].join('\n');
}

export function cspPlugin(): Plugin {
  return {
    name: 'bloodio-csp',
    apply: 'build',
    // After the other plugins, so nothing lands above the policy.
    transformIndexHtml: { order: 'post', handler: () => [cspMetaTag()] },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}
