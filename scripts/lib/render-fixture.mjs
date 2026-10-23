/* global OffscreenCanvas */
// Draws one page of a positioned-text fixture as a PNG in a browser page: black text on white at
// 300 DPI, each item at its recorded baseline. This is the synthetic "scan" read by
// scripts/make-ocr-fixture.mjs and by the end-to-end tests; no image ever enters the repository.

/** Pixels per PDF point at 300 DPI. */
export const SCAN_SCALE = 300 / 72;

/**
 * @param {import('@playwright/test').Page} page any page; a blank one keeps the app's CSP out of the way
 * @param {{ width: number, height: number, items: { text: string, x: number, y: number, h: number }[] }} fixturePage
 * @returns {Promise<Buffer>}
 */
export async function renderFixturePage(page, fixturePage) {
  const base64 = await page.evaluate(
    async ({ source, scale }) => {
      const canvas = new OffscreenCanvas(
        Math.round(source.width * scale),
        Math.round(source.height * scale),
      );
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000000';
      for (const item of source.items) {
        context.font = `${item.h * scale}px Arial, Helvetica, sans-serif`;
        context.fillText(item.text, item.x * scale, item.y * scale);
      }
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { source: fixturePage, scale: SCAN_SCALE },
  );
  return Buffer.from(base64, 'base64');
}
