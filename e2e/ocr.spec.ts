import type { BrowserContext, Page, Response } from '@playwright/test';
import { degradeImage } from '../scripts/lib/degrade.mjs';
import { renderFixturePage } from '../scripts/lib/render-fixture.mjs';
import { buildImagePdf } from '../tests/fixtures/build-pdf';
import { loadFixture } from '../tests/fixtures/load';
import { expect, test } from './test';

// Loading the models and reading a page at 300 DPI takes a few seconds per test.
test.describe.configure({ timeout: 120_000 });

const READ = 60_000;
const SIX_ROWS = '6 valori letti, 6 da controllare. Niente viene salvato finché non confermi.';
const UNAVAILABLE =
  'Non riesco a preparare la lettura delle immagini. La prima volta serve la connessione.';
const OCR_OFFLINE = 'Anche la lettura di foto e scansioni funziona senza connessione.';

/** The PROAVIS fixture drawn as a 300 DPI scan, in a blank page outside the app. */
async function scanOfReport(context: BrowserContext): Promise<Buffer> {
  const blank = await context.newPage();
  try {
    return await renderFixturePage(blank, loadFixture('proavis-2021-07-10').pages[0]!);
  } finally {
    await blank.close();
  }
}

/** The same scan as a phone photo: tilted, shaded, noisy, JPEG (scripts/lib/degrade.mjs). */
async function photoOfReport(
  context: BrowserContext,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const blank = await context.newPage();
  try {
    const png = await renderFixturePage(blank, loadFixture('proavis-2021-07-10').pages[0]!);
    return await degradeImage(blank, png, 'foto');
  } finally {
    await blank.close();
  }
}

/**
 * Save-Data keeps the background download (src/pwa/ocr-offline.ts) from fetching the models:
 * every model request is then the reading's own.
 */
async function sparingData(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
  });
}

async function openImport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
}

const photo = (buffer: Buffer, name = 'foto.png') => ({ name, mimeType: 'image/png', buffer });

test('a photographed report is read, checked and saved', async ({ page, context }) => {
  // The models are downloaded by tesseract's worker: seeing that download at the context level
  // shows the privacy guard's request watch (e2e/test.ts) covers the worker's requests too.
  const modelDownloads: string[] = [];
  context.on('request', (request) => {
    if (request.method() === 'GET' && /\/ocr\/[0-9a-f]{8}\/lang\//.test(request.url())) {
      modelDownloads.push(request.url());
    }
  });
  const scan = await scanOfReport(context);
  // So every model download counted here comes from tesseract's worker.
  await sparingData(context);
  await openImport(page);
  await page.locator('#report-file').setInputFiles(photo(scan));

  await expect(page.getByText(SIX_ROWS)).toBeVisible({ timeout: READ });
  expect(modelDownloads.length, 'model downloads seen by the context').toBeGreaterThan(0);
  await expect(
    page.getByText(
      'Valori letti da un’immagine: confronta ognuno con il referto prima di salvare.',
    ),
  ).toBeVisible();
  await expect(page.locator('#sample-date')).toHaveValue('2021-07-10');
  await expect(page.locator('#report-lab')).toHaveValue('PROAVIS');
  const tsh = page.getByRole('article', { name: 'TSH', exact: true });
  await expect(tsh.getByLabel('Valore')).toHaveValue('2,34');
  await expect(tsh.getByText('Letto da un’immagine. Confronta con il referto.')).toBeVisible();

  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '10 luglio 2021' })).toBeVisible();
});

test('a tilted, shaded photo is read with the chosen pre-processing', async ({ page, context }) => {
  const shot = await photoOfReport(context);
  await sparingData(context);
  await openImport(page);
  await page
    .locator('#report-file')
    .setInputFiles({ name: 'foto.jpg', mimeType: shot.mimeType, buffer: shot.buffer });

  await expect(page.getByText(SIX_ROWS)).toBeVisible({ timeout: READ });
  for (const [name, value] of [
    ['Tireoglobulina', '52,4'],
    ['TSH', '2,34'],
    ['FT4', '1,56'],
  ] as const) {
    const row = page.getByRole('article', { name, exact: true });
    await expect(row.getByLabel('Valore'), name).toHaveValue(value);
  }
  await expect(
    page.getByRole('article', { name: 'TSH', exact: true }).getByLabel('Unità'),
  ).toHaveValue('µUI/mL');
});

test('a PDF without text goes through the same reading', async ({ page, context }) => {
  const pdf = await buildImagePdf(await scanOfReport(context), 612, 792);
  await openImport(page);
  await page.locator('#report-file').setInputFiles({
    name: 'scansione.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  });
  await expect(page.getByText(SIX_ROWS)).toBeVisible({ timeout: READ });
  await expect(page.locator('#sample-date')).toHaveValue('2021-07-10');
});

test('two photos make one report', async ({ page, context }) => {
  const scan = await scanOfReport(context);
  await openImport(page);
  await page
    .locator('#report-file')
    .setInputFiles([photo(scan, 'pagina-2.png'), photo(scan, 'pagina-1.png')]);
  await expect(
    page.getByText('12 valori letti, 12 da controllare. Niente viene salvato finché non confermi.'),
  ).toBeVisible({ timeout: READ });
});

test('the reading can be cancelled while the models download', async ({ page, context }) => {
  const scan = await scanOfReport(context);
  await sparingData(context);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let downloadStarted!: () => void;
  const downloading = new Promise<void>((resolve) => (downloadStarted = resolve));
  await context.route('**/ocr/*/lang/*.traineddata.gz', async (route) => {
    // The engine first checks the models are there (HEAD): let that through and hold the download.
    if (route.request().method() !== 'GET') return route.continue();
    downloadStarted();
    await held;
    await route.continue().catch(() => {});
  });
  // Released whatever happens, so a failed assertion never leaves the download held.
  try {
    await openImport(page);
    await page.locator('#report-file').setInputFiles(photo(scan));

    // The label is also announced by a hidden status: the progress bar names it once.
    await expect(
      page.getByRole('progressbar', { name: 'Preparazione della lettura…' }),
    ).toBeVisible();
    await downloading;
    await page.getByRole('button', { name: 'Annulla' }).click();
    await expect(page.getByText('Lettura annullata.')).toBeVisible();
    await expect(page.locator('#report-file')).toBeFocused();
  } finally {
    release();
  }

  await page.goto('/#/');
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();
});

test('missing models or worker give a clear message', async ({ page, context }) => {
  const scan = await scanOfReport(context);
  await context.route('**/ocr/*/lang/*.traineddata.gz', (route) => route.abort());
  await openImport(page);
  await page.locator('#report-file').setInputFiles(photo(scan));
  await expect(page.getByRole('alert')).toHaveText(UNAVAILABLE, { timeout: READ });

  await context.unroute('**/ocr/*/lang/*.traineddata.gz');
  await context.route('**/ocr/*/worker.min.js', (route) => route.abort());
  await page.locator('#report-file').setInputFiles(photo(scan, 'foto-2.png'));
  await expect(page.getByRole('alert')).toHaveText(UNAVAILABLE, { timeout: READ });
});

test('once its files are downloaded, a photo is read offline', async ({ page, context }) => {
  const scan = await scanOfReport(context);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.getByRole('link', { name: 'Impostazioni' }).click();
  // The download starts by itself once the service worker is active and the browser is idle.
  await expect(page.getByText(OCR_OFFLINE)).toBeVisible({ timeout: READ });

  await context.setOffline(true);
  const ocrFiles: Response[] = [];
  context.on('response', (response) => {
    if (/\/ocr\/[0-9a-f]{8}\//.test(response.url())) ocrFiles.push(response);
  });
  // Served by the service worker, which from now on controls the page and the OCR worker.
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker(), 'index.html from the service worker').toBe(true);
  await page.getByRole('link', { name: 'Carica un referto' }).first().click();
  await page.locator('#report-file').setInputFiles(photo(scan));

  await expect(page.getByText(SIX_ROWS)).toBeVisible({ timeout: READ });
  await expect(page.locator('#sample-date')).toHaveValue('2021-07-10');
  // Worker, core and both models, all from the service worker's cache.
  expect(
    ocrFiles.map((response) => response.fromServiceWorker()),
    'OCR files from the service worker',
  ).toEqual([true, true, true, true]);
});
