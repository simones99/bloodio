import {
  IMAGE_HEIGHT,
  IMAGE_SCALE,
  IMAGE_WIDTH,
  paintChartImage,
  type ChartImage,
} from './paint-png';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

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

function canShareFile(file: File): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/**
 * Shares the image only where the primary pointer is touch (`pointer: coarse`) and the platform
 * accepts the file; desktop browsers also report canShare but a share sheet is the wrong UX
 * there, so they download. If the system refuses the share (NotAllowedError, e.g. iOS transient
 * activation lapsed during the async render) it falls back to a download.
 * Nothing leaves the device unless the user picks a destination in the share sheet.
 */
export async function saveChartImage(image: ChartImage, fileName: string): Promise<SaveOutcome> {
  const blob = await renderChartPng(image);
  const file = new File([blob], fileName, { type: 'image/png' });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: image.title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari may show a download prompt; keep the URL valid until the user has had time to answer.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
  return 'downloaded';
}
