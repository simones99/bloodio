import { describe, expect, it } from 'vitest';
import { searchByName } from '../../src/ui/analyte/search';

const items = [
  { name: 'Glicemia', aliases: ['Glucosio'] },
  { name: 'Colesterolo HDL', aliases: [] },
  { name: 'Emoglobina glicata', aliases: ['HbA1c'] },
  { name: 'FT4', aliases: ['Tiroxina libera'] },
];
const names = (item: (typeof items)[number]) => [item.name, ...item.aliases];
const found = (query: string) => searchByName(items, query, names).map((i) => i.name);

describe('searchByName', () => {
  it('puts names that start with the query before names that contain it', () => {
    expect(found('gli')).toEqual(['Glicemia', 'Emoglobina glicata']);
  });

  it('finds by any alternative name', () => {
    expect(found('glucosio')).toEqual(['Glicemia']);
    expect(found('hba1c')).toEqual(['Emoglobina glicata']);
    expect(found('tiroxina')).toEqual(['FT4']);
  });

  it('ignores case, accents and punctuation', () => {
    expect(found('GLUCÒSIO')).toEqual(['Glicemia']);
    expect(found('colesterolo-hdl')).toEqual(['Colesterolo HDL']);
  });

  it('returns every item, in order, for an empty or blank query', () => {
    expect(found('')).toEqual(items.map((i) => i.name));
    expect(found('   ')).toEqual(items.map((i) => i.name));
  });

  it('returns nothing when nothing matches', () => {
    expect(found('zzz')).toEqual([]);
  });
});
