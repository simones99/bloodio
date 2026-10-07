import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findPersonalPatterns } from '../../scripts/lib/pii-patterns.mjs';
import { FIXTURE_NAMES, loadFixture } from './load';

const DIR = 'tests/fixtures';

function allFixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? allFixtureFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('fixtures', () => {
  it.each(FIXTURE_NAMES)('%s is a non-empty pdf-text PositionedText', (name) => {
    const fixture = loadFixture(name);
    expect(fixture.source).toBe('pdf-text');
    expect(fixture.pages.length).toBeGreaterThan(0);
    for (const page of fixture.pages) expect(page.items.length).toBeGreaterThan(0);
  });

  it('contain no Italian tax code', () => {
    const taxCode = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/i;
    for (const file of allFixtureFiles(DIR)) {
      expect(taxCode.test(readFileSync(file, 'utf8')), file).toBe(false);
    }
  });

  it('carry only the placeholder birth date', () => {
    for (const name of FIXTURE_NAMES) {
      const text = loadFixture(name)
        .pages.flatMap((p) => p.items.map((i) => i.text))
        .join('\n');
      const births = [...text.matchAll(/Nato il:?\s*(\d{2}\/\d{2}\/\d{4})/g)].map((m) => m[1]);
      expect(births.length, name).toBeGreaterThan(0);
      for (const birth of births) expect(birth, name).toBe('01/01/1980');
    }
  });

  it('contain no personal-data pattern in any text item', () => {
    for (const name of FIXTURE_NAMES) {
      const fixture = loadFixture(name);
      for (const page of fixture.pages) {
        for (const item of page.items) {
          expect(findPersonalPatterns(item.text), `${name}: "${item.text}"`).toEqual([]);
        }
      }
    }
  });

  it('contain none of the local personal terms (only checked when pii.local.json exists)', () => {
    const local = 'examples/pii.local.json';
    if (!existsSync(local)) return;
    const { replacements } = JSON.parse(readFileSync(local, 'utf8')) as {
      replacements: Record<string, string>;
    };
    for (const file of allFixtureFiles(DIR)) {
      const content = readFileSync(file, 'utf8').toLowerCase();
      for (const term of Object.keys(replacements)) {
        expect(content.includes(term.toLowerCase()), `${file} leaks a personal term`).toBe(false);
      }
    }
  });
});
