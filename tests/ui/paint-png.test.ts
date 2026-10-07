import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ChartPoint } from '../../src/ui/chart/chart-model';
import { CARTA, IMAGE_HEIGHT, IMAGE_WIDTH, paintChartImage } from '../../src/ui/chart/paint-png';
import { canvasRecorder } from './canvas-recorder';

const points: ChartPoint[] = [
  {
    key: 'a',
    date: '2021-07-10',
    value: 5.48,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: true,
  },
  {
    key: 'b',
    date: '2021-10-04',
    value: 3.1,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: false,
  },
  {
    key: 'c',
    date: '2022-08-20',
    value: 0.2,
    comparator: '<',
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: false,
  },
];

const image = { title: 'TSH', subtitle: 'µUI/mL · luglio 2021 – agosto 2022', points };

function tokenBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
  );
}

describe('CARTA', () => {
  it('matches the carta theme in tokens.css', () => {
    const css = readFileSync('src/ui/styles/tokens.css', 'utf8');
    const root = tokenBlock(css, ':root {');
    const carta = tokenBlock(css, ":root[data-theme='carta']");
    expect(CARTA).toEqual({
      nero: carta.nero,
      grafite: carta.grafite,
      filetto: carta.filetto,
      binario: carta.binario,
      testo: carta.testo,
      cenere: carta.cenere,
      arterioso: root.arterioso,
    });
  });
});

describe('paintChartImage', () => {
  it('starts from a white page of the image size', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, image);
    expect(calls[0]?.op === 'save' ? calls[1] : calls[0]).toMatchObject({
      op: 'fillRect',
      args: [0, 0, IMAGE_WIDTH, IMAGE_HEIGHT],
      fillStyle: CARTA.nero,
    });
  });

  it('writes the title in Archivo, the subtitle, the legend and the footer', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, image);
    const texts = calls.filter((c) => c.op === 'fillText');
    const words = texts.map((c) => c.args[0]);
    expect(words).toEqual(
      expect.arrayContaining([
        'TSH',
        'µUI/mL · luglio 2021 – agosto 2022',
        'dentro il range stampato',
        'fuori dal range stampato',
        'valore con < o >',
        'range stampato',
        'Da Bloodio, non è un referto medico',
        'lug 21',
        'ago 22',
      ]),
    );
    const title = texts.find((c) => c.args[0] === 'TSH')!;
    expect(title.font).toContain('800');
    expect(title.font).toContain('Archivo Variable');
    expect(title.fillStyle).toBe(CARTA.testo);
  });

  it('caps the title and subtitle width so long names are not clipped', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, image);
    const texts = calls.filter((c) => c.op === 'fillText');
    const maxWidth = IMAGE_WIDTH - 2 * 28;
    expect(texts.find((c) => c.args[0] === 'TSH')!.args[3]).toBe(maxWidth);
    expect(texts.find((c) => c.args[0] === image.subtitle)!.args[3]).toBe(maxWidth);
  });

  it('fills the band in grafite and the out-of-range point in red', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, image);
    const fills = calls.filter((c) => c.op === 'fill').map((c) => c.fillStyle);
    expect(fills).toContain(CARTA.grafite);
    expect(fills).toContain(CARTA.arterioso);
  });

  it('uses red only for data: no red when every point is in range', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, {
      ...image,
      points: points.map((p) => ({ ...p, outOfRange: false, comparator: null })),
    });
    const red = calls.filter(
      (c) =>
        (c.op === 'fill' && c.fillStyle === CARTA.arterioso) ||
        (c.strokeStyle === CARTA.arterioso && c.op === 'stroke'),
    );
    // the legend's "fuori dal range" diamond is the only red mark left
    expect(red).toHaveLength(1);
  });

  it('balances every save with a restore', () => {
    const { ctx, calls } = canvasRecorder();
    paintChartImage(ctx, image);
    const saves = calls.filter((c) => c.op === 'save').length;
    expect(saves).toBeGreaterThan(0);
    expect(calls.filter((c) => c.op === 'restore')).toHaveLength(saves);
  });
});
