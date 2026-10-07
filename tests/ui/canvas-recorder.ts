import type { Painter } from '../../src/ui/chart/paint-png';

export interface RecordedCall {
  op: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
}

const METHODS = [
  'save',
  'restore',
  'translate',
  'scale',
  'fillRect',
  'beginPath',
  'moveTo',
  'lineTo',
  'closePath',
  'arc',
  'fill',
  'stroke',
  'fillText',
] as const;

/** A 2D context that only records what is drawn, with the styles in effect at each call. */
export function canvasRecorder() {
  const calls: RecordedCall[] = [];
  const state = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineJoin: 'miter',
    lineCap: 'butt',
  };
  const ctx: Record<string, unknown> = state;
  for (const op of METHODS) {
    ctx[op] = (...args: unknown[]) =>
      calls.push({
        op,
        args,
        fillStyle: state.fillStyle,
        strokeStyle: state.strokeStyle,
        font: state.font,
      });
  }
  return { ctx: ctx as unknown as Painter & { scale(x: number, y: number): void }, calls };
}
