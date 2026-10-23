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
  const centre = centreOf(points);
  const angle = (-1.5 * Math.PI) / 180;
  const [dx, dy] = [centre.x - width / 2, centre.y - height / 2];
  const back = {
    x: (width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle)) / SCAN_SCALE,
    y: (height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle)) / SCAN_SCALE,
  };
  const box = tshRowBox('proavis-2021-07-10', '2,34');
  expect(back.x).toBeGreaterThan(box.left);
  expect(back.x).toBeLessThan(box.right);
  expect(back.y).toBeGreaterThan(box.top);
  expect(back.y).toBeLessThan(box.bottom);
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
