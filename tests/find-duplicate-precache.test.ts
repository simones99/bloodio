import { describe, expect, it } from 'vitest';
import { inspectPrecache, precacheUrls } from '../scripts/lib/find-duplicate-precache.mjs';

describe('inspectPrecache', () => {
  it('finds no duplicates when every URL is listed once', () => {
    const sw = 'e.precacheAndRoute([{url:"index.html",revision:"a"},{url:"sw.png",revision:"b"}])';
    expect(inspectPrecache(sw)).toEqual({ entries: 2, duplicates: [] });
  });

  it('reports a URL listed twice with two revisions', () => {
    const sw =
      'precacheAndRoute([{url:"manifest.webmanifest",revision:"a"},{url:"x.js",revision:null},' +
      '{url:"manifest.webmanifest",revision:"b"}])';
    expect(inspectPrecache(sw)).toEqual({ entries: 3, duplicates: ['manifest.webmanifest'] });
  });

  it('parses spaced and single-quoted entries and ignores other text', () => {
    const sw =
      "const curl=1;fetch(url);{ url: 'a.css', revision: 'x' },{url:'a.css',revision:'y'}," +
      '{url:"b.css",revision:"z"}';
    expect(inspectPrecache(sw)).toEqual({ entries: 3, duplicates: ['a.css'] });
  });

  it('counts entries whose keys are quoted', () => {
    const sw = '[{"url":"a.js","revision":"x"},{"url":"b.js","revision":null},{"url":"a.js"}]';
    expect(inspectPrecache(sw)).toEqual({ entries: 3, duplicates: ['a.js'] });
  });

  it('reports zero entries when there is nothing to read', () => {
    expect(inspectPrecache('')).toEqual({ entries: 0, duplicates: [] });
    expect(inspectPrecache('const curl=1;fetch(url);')).toEqual({ entries: 0, duplicates: [] });
  });
});

describe('precacheUrls', () => {
  it('lists every precached URL in order', () => {
    const sw = 'precacheAndRoute([{url:"index.html",revision:"a"},{"url":"ocr/worker.min.js"}])';
    expect(precacheUrls(sw)).toEqual(['index.html', 'ocr/worker.min.js']);
  });
});
