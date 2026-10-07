import { describe, expect, it } from 'vitest';
import { parseReference } from '../../src/domain/reference';

const plain = { derived: false, ageStratified: false };

describe('parseReference', () => {
  it.each([
    ['da 13 a 17', 13, 17],
    ['da 0,93 a 1,7', 0.93, 1.7],
    ['da 4.500.000 a 5.500.000', 4500000, 5500000],
    ['4,5-7,5', 4.5, 7.5],
    ['10 – 20', 10, 20],
  ])('reads the two-sided range %j', (text, refMin, refMax) => {
    expect(parseReference(text)).toEqual({ refMin, refMax, refText: text, ...plain });
  });

  it.each([
    ['< 6', 6],
    ['<= 6', 6],
    ['Fino a 77,0', 77],
    ['inferiore a 200', 200],
  ])('reads the upper limit %j', (text, refMax) => {
    expect(parseReference(text)).toEqual({ refMin: null, refMax, refText: text, ...plain });
  });

  it.each([
    ['> 30', 30],
    ['superiore a 40', 40],
  ])('reads the lower limit %j', (text, refMin) => {
    expect(parseReference(text)).toEqual({ refMin, refMax: null, refText: text, ...plain });
  });

  it('keeps qualitative references as text', () => {
    expect(parseReference('Assente')).toEqual({
      refMin: null,
      refMax: null,
      refText: 'Assente',
      ...plain,
    });
  });

  it('returns null text when nothing is printed', () => {
    expect(parseReference('')).toEqual({ refMin: null, refMax: null, refText: null, ...plain });
    expect(parseReference(' . ')).toEqual({ refMin: null, refMax: null, refText: null, ...plain });
  });

  it('honours the dot mode', () => {
    expect(parseReference('da 1.007 a 1.035', 'decimal')).toMatchObject({
      refMin: 1.007,
      refMax: 1.035,
    });
    expect(parseReference('da 4.000 a 10.000', 'thousands')).toMatchObject({
      refMin: 4000,
      refMax: 10000,
    });
  });

  it('derives the limit from the line labelled "Normale"', () => {
    const text = '4-10 Carenza grave\n10-30 Carenza moderata\n> 30 Normale\n.';
    expect(parseReference(text)).toEqual({
      refMin: 30,
      refMax: null,
      refText: '4-10 Carenza grave\n10-30 Carenza moderata\n> 30 Normale',
      derived: true,
      ageStratified: false,
    });
  });

  it('uses the adult band of an age-stratified reference', () => {
    const text = 'Fino a 10 anni: da 0,35 a 5,8\nDa 11 anni in poi: da 0,25 a 4';
    expect(parseReference(text)).toEqual({
      refMin: 0.25,
      refMax: 4,
      refText: text,
      derived: false,
      ageStratified: true,
    });
  });

  it('keeps unknown multi-line references as text only', () => {
    expect(parseReference('vedi note\nallegate')).toEqual({
      refMin: null,
      refMax: null,
      refText: 'vedi note\nallegate',
      ...plain,
    });
  });
});
