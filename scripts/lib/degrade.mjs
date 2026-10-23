/* global OffscreenCanvas, createImageBitmap */
// Degrades a synthetic scan the way a phone photo does (spec 2026-10-16 §3.2), inside a browser
// page. Used by scripts/measure-ocr.mjs and by the end-to-end tests, so the image the CI checks is
// the one that was measured. The noise uses a fixed seed: every run makes the same image.

/** The degradations, in report order. */
export const DEGRADATIONS = [
  'pulita',
  'ruotata-2°',
  'sfocata',
  'rumore',
  'ombra',
  'jpeg-60',
  'foto',
];

/**
 * @param {import('@playwright/test').Page} page any page; a blank one keeps the app's CSP out of the way
 * @param {Buffer} png the scan from render-fixture.mjs
 * @param {string} name one of DEGRADATIONS
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function degradeImage(page, png, name) {
  if (!DEGRADATIONS.includes(name)) throw new Error(`Unknown degradation: ${name}`);
  const { base64, mimeType } = await page.evaluate(
    async ({ source, name }) => {
      const bytes = Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const { width, height } = bitmap;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);

      const degrees = name === 'ruotata-2°' ? 2 : name === 'foto' ? 1.5 : 0;
      if (degrees !== 0) {
        context.translate(width / 2, height / 2);
        context.rotate((degrees * Math.PI) / 180);
        context.drawImage(bitmap, -width / 2, -height / 2);
        context.setTransform(1, 0, 0, 1, 0, 0);
      } else if (name === 'sfocata') {
        context.filter = 'blur(2px)';
        context.drawImage(bitmap, 0, 0);
        context.filter = 'none';
      } else {
        context.drawImage(bitmap, 0, 0);
      }

      if (name === 'ombra' || name === 'foto') {
        // Light from the top left, a shadow growing towards the bottom right.
        const shade = context.createLinearGradient(0, 0, width, height);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
        context.fillStyle = shade;
        context.fillRect(0, 0, width, height);
      }

      if (name === 'rumore' || name === 'foto') {
        const pixels = context.getImageData(0, 0, width, height);
        const data = pixels.data;
        let seed = 20261016;
        const random = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        const amount = name === 'rumore' ? 60 : 40;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (random() - 0.5) * amount;
          // Uint8ClampedArray: values clamp to 0..255.
          data[i] += noise;
          data[i + 1] += noise;
          data[i + 2] += noise;
        }
        context.putImageData(pixels, 0, 0);
      }

      const quality = name === 'jpeg-60' ? 0.6 : name === 'foto' ? 0.7 : null;
      const type = quality === null ? 'image/png' : 'image/jpeg';
      const blob = await canvas.convertToBlob(quality === null ? { type } : { type, quality });
      const out = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of out) binary += String.fromCharCode(byte);
      return { base64: btoa(binary), mimeType: type };
    },
    { source: png.toString('base64'), name },
  );
  return { buffer: Buffer.from(base64, 'base64'), mimeType };
}
