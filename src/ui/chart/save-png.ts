import {
  IMAGE_HEIGHT,
  IMAGE_SCALE,
  IMAGE_WIDTH,
  paintChartImage,
  type ChartImage,
} from './paint-png';
import { deliverFile, type DeliveryOutcome } from '../share/deliver-file';

export type SaveOutcome = DeliveryOutcome;

/** "bloodio-tsh-2022-08-20.png": only [a-z0-9-] from the analyte ref, whatever it contains. */
export function imageFileName(refKey: string, date: string): string {
  const slug = refKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `bloodio-${slug}-${date}.png`;
}

/** Paints the image on an off-screen canvas at 2x and encodes it as PNG. */
export async function renderChartPng(image: ChartImage): Promise<Blob> {
  // Archivo is bundled and already used by the page; wait so the canvas does not fall back.
  if ('fonts' in document) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_WIDTH * IMAGE_SCALE;
  canvas.height = IMAGE_HEIGHT * IMAGE_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.scale(IMAGE_SCALE, IMAGE_SCALE);
  paintChartImage(ctx, image);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    ),
  );
}

/** Renders the chart image and hands it over (see deliverFile for share versus download). */
export async function saveChartImage(image: ChartImage, fileName: string): Promise<SaveOutcome> {
  return deliverFile(await renderChartPng(image), fileName, image.title);
}
