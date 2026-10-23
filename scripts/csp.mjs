// The Content Security Policy of the production build: one source for the <meta> tag in
// index.html and for the _headers file. 'wasm-unsafe-eval' lets tesseract's WASM core compile in
// its worker; it allows WebAssembly and nothing else (no eval, no new Function).
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'wasm-unsafe-eval'"],
  'worker-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'none'"],
};

/** @param {Record<string, string[]>} directives */
export function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/** The policy in index.html. */
export const META_CSP = serializeCsp(CSP_DIRECTIVES);

/** frame-ancestors is ignored in a <meta> tag: it only works as a real header. */
export const HEADER_CSP = serializeCsp({ ...CSP_DIRECTIVES, 'frame-ancestors': ["'none'"] });
