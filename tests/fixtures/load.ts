import { readFileSync } from 'node:fs';
import type { PositionedText } from '../../src/parsers/types';

export const FIXTURE_NAMES = [
  'proavis-2022-08-20',
  'proavis-2021-10-04',
  'proavis-2021-07-10',
  'ast-2021-08-30',
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function loadFixture(name: FixtureName): PositionedText {
  return JSON.parse(
    readFileSync(`tests/fixtures/positioned/${name}.json`, 'utf8'),
  ) as PositionedText;
}
