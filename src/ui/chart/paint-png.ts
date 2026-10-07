import { it } from '../i18n/it';
import {
  bandShapes,
  buildChartModel,
  type ChartModel,
  type ChartPoint,
  type PlottedPoint,
  type Polyline,
} from './chart-model';

/**
 * The "carta" theme of tokens.css (a test keeps the two in sync). Exported images are always
 * light: they end up printed, in chats and next to other documents.
 */
export const CARTA = {
  nero: '#ffffff',
  grafite: '#f1f1f1',
  filetto: '#dcdcdc',
  binario: '#c4c4c4',
  testo: '#000000',
  cenere: '#5c5c5c',
  arterioso: '#e8151f',
} as const;

export const IMAGE_WIDTH = 600;
export const IMAGE_HEIGHT = 440;
export const IMAGE_SCALE = 2;

const PAD = 28;
const CHART_TOP = 92;
const CHART_HEIGHT = 240;
const FONT = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif";

export interface ChartImage {
  title: string;
  /** Unit and period, already worded ("µUI/mL · luglio 2021 – agosto 2022"). */
  subtitle: string;
  points: ChartPoint[];
}

/** The part of a 2D context the painter uses: a real canvas, or a recorder in tests. */
export type Painter = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'fillRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'arc'
  | 'fill'
  | 'stroke'
  | 'fillText'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'lineJoin'
  | 'lineCap'
>;

function trace(ctx: Painter, line: Polyline, close: boolean) {
  ctx.beginPath();
  line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
}

function diamond(ctx: Painter, x: number, y: number, half: number) {
  trace(
    ctx,
    [
      [x, y - half],
      [x + half, y],
      [x, y + half],
      [x - half, y],
    ],
    true,
  );
}

function circle(ctx: Painter, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

/** The same marks as the SVG: halo in the page color, then the shape. Sizes match TrendChart. */
function paintMark(
  ctx: Painter,
  point: { x: number; y: number; shape: PlottedPoint['shape']; latest: boolean },
) {
  const { x, y } = point;
  ctx.fillStyle = CARTA.nero;
  if (point.shape === 'out') {
    diamond(ctx, x, y, 9.19);
    ctx.fill();
    ctx.fillStyle = CARTA.arterioso;
    diamond(ctx, x, y, 6.36);
    ctx.fill();
  } else {
    circle(ctx, x, y, 6.5);
    ctx.fill();
    if (point.shape === 'in') {
      ctx.fillStyle = CARTA.testo;
      circle(ctx, x, y, 4.5);
      ctx.fill();
    } else {
      ctx.strokeStyle = CARTA.testo;
      ctx.lineWidth = 1.5;
      circle(ctx, x, y, 3.75);
      ctx.stroke();
    }
  }
  if (point.latest) {
    ctx.strokeStyle = CARTA.testo;
    ctx.lineWidth = 1.5;
    if (point.shape === 'out') diamond(ctx, x, y, 11.31);
    else circle(ctx, x, y, 8.5);
    ctx.stroke();
  }
}

function paintChart(ctx: Painter, model: ChartModel) {
  const { plot } = model;
  const { fills, edges } = bandShapes(model.segments);

  ctx.fillStyle = CARTA.grafite;
  for (const polygon of fills) {
    trace(ctx, polygon, true);
    ctx.fill();
  }
  ctx.strokeStyle = CARTA.filetto;
  ctx.lineWidth = 1;
  for (const tick of model.yTicks) {
    trace(
      ctx,
      [
        [plot.left, tick.position],
        [plot.right, tick.position],
      ],
      false,
    );
    ctx.stroke();
  }
  ctx.strokeStyle = CARTA.binario;
  for (const edge of edges) {
    trace(ctx, edge, false);
    ctx.stroke();
  }

  ctx.fillStyle = CARTA.cenere;
  ctx.font = `400 11px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  for (const tick of model.yTicks) ctx.fillText(tick.label, plot.left - 8, tick.position + 4);
  ctx.textAlign = 'left';
  if (model.bandLabel) ctx.fillText(it.analyte.bandLabel, model.bandLabel.x, model.bandLabel.y);
  ctx.textAlign = 'center';
  for (const tick of model.xTicks) ctx.fillText(tick.label, tick.position, model.height - 8);

  ctx.strokeStyle = CARTA.cenere;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  trace(
    ctx,
    model.points.map((p): [number, number] => [p.x, p.y]),
    false,
  );
  ctx.stroke();

  for (const point of model.points) paintMark(ctx, point);
}

function paintLegend(ctx: Painter, top: number) {
  const items: { label: string; draw: (x: number, y: number) => void }[] = [
    {
      label: it.analyte.legendIn,
      draw: (x, y) => paintMark(ctx, { x, y, shape: 'in', latest: false }),
    },
    {
      label: it.analyte.legendOut,
      draw: (x, y) => paintMark(ctx, { x, y, shape: 'out', latest: false }),
    },
    {
      label: it.analyte.legendOpen,
      draw: (x, y) => paintMark(ctx, { x, y, shape: 'open', latest: false }),
    },
    {
      label: it.analyte.bandLabel,
      draw: (x, y) => {
        ctx.fillStyle = CARTA.grafite;
        ctx.fillRect(x - 8, y - 6, 16, 12);
        ctx.strokeStyle = CARTA.binario;
        ctx.lineWidth = 1;
        trace(
          ctx,
          [
            [x - 8, y - 6],
            [x + 8, y - 6],
          ],
          false,
        );
        ctx.stroke();
        trace(
          ctx,
          [
            [x - 8, y + 6],
            [x + 8, y + 6],
          ],
          false,
        );
        ctx.stroke();
      },
    },
  ];
  items.forEach((item, i) => {
    const x = PAD + 8 + (i % 2) * 280;
    const y = top + Math.floor(i / 2) * 24;
    item.draw(x, y);
    ctx.fillStyle = CARTA.testo;
    ctx.font = `400 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.label, x + 16, y);
  });
}

/** Draws the export image in logical pixels (IMAGE_WIDTH × IMAGE_HEIGHT); the caller scales. */
export function paintChartImage(ctx: Painter, image: ChartImage): void {
  ctx.save();
  ctx.fillStyle = CARTA.nero;
  ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CARTA.testo;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText(image.title, PAD, PAD + 24, IMAGE_WIDTH - 2 * PAD);
  ctx.fillStyle = CARTA.cenere;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(image.subtitle, PAD, PAD + 48, IMAGE_WIDTH - 2 * PAD);

  const model = buildChartModel(image.points, {
    width: IMAGE_WIDTH - 2 * PAD + 12,
    height: CHART_HEIGHT,
  });
  ctx.save();
  ctx.translate(PAD - 12, CHART_TOP);
  paintChart(ctx, model);
  ctx.restore();

  paintLegend(ctx, CHART_TOP + CHART_HEIGHT + 24);

  ctx.fillStyle = CARTA.cenere;
  ctx.font = `400 12px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(it.analyte.imageFooter, PAD, IMAGE_HEIGHT - PAD + 8);
  ctx.restore();
}
