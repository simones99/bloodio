import type { BrowserContext, Locator, Page } from '@playwright/test';
import { degradeImage } from '../scripts/lib/degrade.mjs';
import { renderFixturePage, SCAN_SCALE } from '../scripts/lib/render-fixture.mjs';
import { expect, test } from './test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import { loadFixture, type FixtureName } from '../tests/fixtures/load';

/** The TSH row as the fixture prints it: name, value, range and unit, in PDF points. */
function tshRowBox(fixture: FixtureName, value: string) {
  const items = loadFixture(fixture).pages[0]!.items.filter((item) =>
    ['TSH', value, 'da 0,27 a 4,20', 'μUI/ml'].includes(item.text),
  );
  expect(items).toHaveLength(4);
  return {
    left: Math.min(...items.map((i) => i.x)),
    right: Math.max(...items.map((i) => i.x + i.w)),
    top: Math.min(...items.map((i) => i.y - i.h)),
    bottom: Math.max(...items.map((i) => i.y)),
  };
}

/** The corners of the rectangle over the row, in the units of the original. */
async function polygonOf(original: Locator): Promise<[number, number][]> {
  return (await original.locator('polygon').getAttribute('points'))!
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number) as [number, number]);
}

/** Where a printed word of the fixture starts and ends, and its baseline, in PDF points. */
function wordOf(fixture: FixtureName, text: string) {
  const item = loadFixture(fixture).pages[0]!.items.find((i) => i.text === text);
  expect(item, `"${text}" printed in ${fixture}`).toBeDefined();
  return { left: item!.x, right: item!.x + item!.w, baseline: item!.y };
}

/** A stretch of the page from left to right, in the units of the original. */
interface Span {
  left: number;
  right: number;
}

/**
 * Below this luminance a pixel is ink. A PDF page is white; the photo's paper is shaded and noisy,
 * so its threshold sits lower, to keep the grey of the paper out of the ink.
 */
const INK_ON_PDF = 128;
const INK_ON_PHOTO = 90;

/** The ink of a word against the rectangle, in the units of the original. */
interface InkAgainstRectangle {
  /** The rectangle's top and bottom edges at the middle of the word. */
  top: number;
  bottom: number;
  inkTop: number;
  inkBottom: number;
  /** One CSS pixel: half of the 2-pixel border falls inside the edge, so ink must clear it. */
  cssPx: number;
}

/**
 * The ink in `span`: the run of dark lines of the canvas that holds the rectangle's middle, since
 * the rows above and below print in the same column.
 */
async function inkAgainstRectangle(
  original: Locator,
  span: Span,
  dark: number,
): Promise<InkAgainstRectangle> {
  const corners = await polygonOf(original);
  return original.evaluate(
    (element, { corners, span, dark }) => {
      const canvas = element.querySelector('canvas')!;
      const width = Number(element.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
      const s = canvas.width / width;
      const [a, b, c, d] = corners;
      const [x0, x1] = [span.left, span.right];
      const middle = (x0 + x1) / 2;
      const edgeAt = (p: [number, number], q: [number, number]) =>
        p[1] + ((q[1] - p[1]) * (middle - p[0])) / (q[0] - p[0]);
      const top = edgeAt(a!, b!);
      const bottom = edgeAt(d!, c!);
      const height = bottom - top;
      const [left, from] = [Math.round(x0 * s), Math.round((top - height) * s)];
      const pixels = canvas
        .getContext('2d')!
        .getImageData(left, from, Math.round(x1 * s) - left, Math.round(3 * height * s));
      const inked = Array.from({ length: pixels.height }, (_, y) => {
        let count = 0;
        for (let x = 0; x < pixels.width; x++) {
          const [r, g, b] = pixels.data.subarray((y * pixels.width + x) * 4);
          if (0.299 * r! + 0.587 * g! + 0.114 * b! < dark) count++;
        }
        return count >= 2;
      });
      let line = Math.round(((top + bottom) / 2) * s) - from;
      for (let k = 0; !inked[line] && k < pixels.height; k++) {
        if (inked[line + k]) line += k;
        else if (inked[line - k]) line -= k;
      }
      let [first, last] = [line, line];
      while (inked[first - 1]) first--;
      while (inked[last + 1]) last++;
      const zoom = Number(/scale\(([\d.]+)\)/.exec(element.style.transform)![1]);
      return {
        top,
        bottom,
        inkTop: (from + first) / s,
        inkBottom: (from + last + 1) / s,
        cssPx: 1 / zoom,
      };
    },
    { corners, span, dark },
  );
}

/** No ink of the word under the rectangle's border, nor past it. */
function expectInkInside(ink: InkAgainstRectangle) {
  expect(ink.inkTop - ink.cssPx).toBeGreaterThanOrEqual(ink.top);
  expect(ink.inkBottom + ink.cssPx).toBeLessThanOrEqual(ink.bottom);
}

/** A point of the photo turned by `degrees` about the photo's centre, as degrade.mjs turns it. */
function turnedAboutCentre(
  point: { x: number; y: number },
  degrees: number,
  width: number,
  height: number,
) {
  const angle = (degrees * Math.PI) / 180;
  const [dx, dy] = [point.x - width / 2, point.y - height / 2];
  return {
    x: width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

const centreOf = (points: [number, number][]) => ({
  x: points.reduce((sum, [x]) => sum + x, 0) / points.length,
  y: points.reduce((sum, [, y]) => sum + y, 0) / points.length,
});

async function openImport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
}

/** Imports the PDF with text built from the PROAVIS fixture, which lands on the verification. */
async function importProavisPdf(page: Page) {
  await openImport(page);
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2022-08-20')),
  });
}

test('"Vedi originale" shows the page of a PDF with text with a rectangle on the row', async ({
  page,
}) => {
  await importProavisPdf(page);

  const row = page.getByRole('article', { name: 'TSH', exact: true });
  const opener = row.getByRole('button', { name: 'Vedi originale' });
  await opener.click();

  const sheet = page.getByRole('dialog', { name: 'Pagina 1 di 1' });
  await expect(sheet.getByText('TSH 5,07 μUI/ml da 0,27 a 4,20')).toBeVisible();
  const original = sheet.getByRole('img', {
    name: 'Pagina 1 del referto, riga TSH evidenziata',
  });
  await expect(original).toBeVisible();
  await expect(original.locator('canvas')).toHaveCount(1);
  await expect(original.locator('svg')).toHaveAttribute('viewBox', '0 0 612 792');

  const centre = centreOf(await polygonOf(original));
  const box = tshRowBox('proavis-2022-08-20', '5,07');
  expect(centre.x).toBeGreaterThan(box.left);
  expect(centre.x).toBeLessThan(box.right);
  expect(centre.y).toBeGreaterThan(box.top);
  expect(centre.y).toBeLessThan(box.bottom);
  // The comma of "5,07" goes below the baseline: the border must not hide its tail.
  expectInkInside(
    await inkAgainstRectangle(original, wordOf('proavis-2022-08-20', '5,07'), INK_ON_PDF),
  );

  await sheet.getByRole('button', { name: 'Chiudi' }).click();
  await expect(sheet).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Back closes the sheet and the verification keeps its values', async ({ page }) => {
  await importProavisPdf(page);
  const row = page.getByRole('article', { name: 'TSH', exact: true });
  await row.getByLabel('Valore').fill('5,9');
  const opener = row.getByRole('button', { name: 'Vedi originale' });
  const sheet = page.getByRole('dialog', { name: 'Pagina 1 di 1' });

  await opener.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/#\/import\/verify$/);
  await expect(row.getByLabel('Valore')).toHaveValue('5,9');
  await expect(opener).toBeFocused();

  // Closed with "Chiudi", the sheet leaves nothing in the history: Back leaves the verification.
  await opener.click();
  await sheet.getByRole('button', { name: 'Chiudi' }).click();
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/#\/import$/);
});

test('a held Esc closes the sheet without leaving the verification', async ({ page }) => {
  await importProavisPdf(page);
  const row = page.getByRole('article', { name: 'TSH', exact: true });
  await row.getByRole('button', { name: 'Vedi originale' }).click();
  const sheet = page.getByRole('dialog', { name: 'Pagina 1 di 1' });
  await expect(sheet).toBeVisible();

  // The repeats of a held key, all before the history has moved back.
  await page.evaluate(() => {
    for (const repeat of [false, true, true]) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', repeat, bubbles: true }),
      );
    }
  });
  await expect(sheet).toBeHidden();
  // Give any extra step back the time to land: the URL would then leave the verification.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/#\/import\/verify$/);
});

/** The PROAVIS fixture as a phone photo: tilted by 1.5°, shaded, noisy, JPEG (scripts/lib/degrade.mjs). */
async function photoOfReport(context: BrowserContext) {
  const blank = await context.newPage();
  try {
    const png = await renderFixturePage(blank, loadFixture('proavis-2021-07-10').pages[0]!);
    return await degradeImage(blank, png, 'foto');
  } finally {
    await blank.close();
  }
}

test('"Vedi originale" shows the photo as taken, with the rectangle turned along the row', async ({
  page,
  context,
}) => {
  // Loading the models and reading a page at 300 DPI takes a few seconds.
  test.setTimeout(120_000);
  const shot = await photoOfReport(context);
  await openImport(page);
  await page
    .locator('#report-file')
    .setInputFiles({ name: 'foto.jpg', mimeType: shot.mimeType, buffer: shot.buffer });

  const row = page.getByRole('article', { name: 'TSH', exact: true });
  await row.getByRole('button', { name: 'Vedi originale' }).click({ timeout: 60_000 });
  const original = page.getByRole('dialog').getByRole('img', {
    name: 'Pagina 1 del referto, riga TSH evidenziata',
  });
  await expect(original).toBeVisible();
  // The photo in its own pixels: the fixture's 612 × 792 points at 300 DPI.
  const [width, height] = [Math.round(612 * SCAN_SCALE), Math.round(792 * SCAN_SCALE)];
  await expect(original.locator('svg')).toHaveAttribute('viewBox', `0 0 ${width} ${height}`);

  const points = await polygonOf(original);
  // Not a straight rectangle: the top side slopes down to the right with the photo.
  expect(points[1]![1] - points[0]![1]).toBeGreaterThan(5);

  // The fixture's row box, in pixels and turned by 1.5° about the centre as degrade.mjs drew it:
  // the centre is inside when, turned back by −1.5°, it falls in the box in points.
  const turned = (point: { x: number; y: number }, degrees: number) =>
    turnedAboutCentre(point, degrees, width, height);
  const unturned = turned(centreOf(points), -1.5);
  const back = { x: unturned.x / SCAN_SCALE, y: unturned.y / SCAN_SCALE };
  const box = tshRowBox('proavis-2021-07-10', '2,34');
  expect(back.x).toBeGreaterThan(box.left);
  expect(back.x).toBeLessThan(box.right);
  expect(back.y).toBeGreaterThan(box.top);
  expect(back.y).toBeLessThan(box.bottom);

  // "2,34" in the photo's pixels, turned by 1.5° as the photo was; the comma goes below the baseline.
  const value = wordOf('proavis-2021-07-10', '2,34');
  const inPhoto = (x: number) =>
    turned({ x: x * SCAN_SCALE, y: value.baseline * SCAN_SCALE }, 1.5).x;
  expectInkInside(
    await inkAgainstRectangle(
      original,
      { left: inPhoto(value.left), right: inPhoto(value.right) },
      INK_ON_PHOTO,
    ),
  );
});

test('the page zooms with the buttons and moves with the arrows and the mouse, at 375 pixels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await importProavisPdf(page);
  await page
    .getByRole('article', { name: 'TSH', exact: true })
    .getByRole('button', { name: 'Vedi originale' })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Pagina 1 di 1' });
  const original = sheet.getByRole('img', { name: 'Pagina 1 del referto, riga TSH evidenziata' });
  const area = original.locator('xpath=..');
  await expect(original).toBeVisible();
  const box = async () => (await original.boundingBox())!;
  // The page is moved inside its area, never by scrolling the app or the sheet sideways.
  const expectNoSideScroll = async () => {
    const sides = await sheet.evaluate((dialog) =>
      [document.documentElement, dialog].map(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    );
    expect(sides).toEqual([0, 0]);
  };

  const opened = await box();
  await sheet.getByRole('button', { name: 'Ingrandisci' }).click();
  await expect.poll(async () => (await box()).width).toBeCloseTo(opened.width * 1.5, 0);
  await expectNoSideScroll();
  await sheet.getByRole('button', { name: 'Riduci' }).click();
  await expect.poll(async () => (await box()).width).toBeCloseTo(opened.width, 0);

  await area.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await box()).x).toBeCloseTo(opened.x - 40, 0);
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await box()).y).toBeCloseTo(opened.y - 40, 0);

  // A mouse drag of 60 pixels to the right and 30 down moves the page with it.
  const before = await box();
  const start = (await area.boundingBox())!;
  const [x, y] = [start.x + start.width / 2, start.y + start.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await box()).x).toBeCloseTo(before.x + 60, 0);
  expect((await box()).y).toBeCloseTo(before.y + 30, 0);

  await sheet.getByRole('button', { name: 'Adatta alla larghezza' }).click();
  await expect.poll(async () => (await box()).width).toBeCloseTo(start.width, 0);
  await expectNoSideScroll();
});
