import { expect, test, type Page } from '@playwright/test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import { watchNetwork } from './network';

const REMINDER = 'Ci sono dati non ancora esportati.';

async function startWithOneReport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();
  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2022-08-20')),
  });
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByText('Referto salvato')).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).click();
}

test('the Home sums up the latest report, and its reminder can wait', async ({ page, baseURL }) => {
  const external = watchNetwork(page, baseURL!);
  await startWithOneReport(page);

  await expect(
    page.getByRole('link', {
      name: 'Ultimo referto, 20 agosto 2022, PROAVIS, 11 valori fuori range',
    }),
  ).toBeVisible();
  const out = page.getByRole('region', { name: 'Fuori range' });
  await expect(out.getByRole('link', { name: /^TSH/ })).toBeVisible();
  await expect(out.getByRole('link')).toHaveCount(11);

  await expect(page.getByText(REMINDER)).toBeVisible();
  await page.getByRole('button', { name: 'Più tardi' }).click();
  await expect(page.getByText(REMINDER)).toBeHidden();
  await page.reload();
  await expect(page.getByRole('link', { name: /^Ultimo referto/ })).toBeVisible();
  await expect(page.getByText(REMINDER)).toBeHidden();

  expect(external).toEqual([]);
});

test('"Esporta ora" on the Home downloads the data and clears the reminder', async ({
  page,
  baseURL,
}) => {
  // Desktop and emulated phones may share files: force the download path, as the settings test does.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: undefined,
      configurable: true,
    });
  });
  const external = watchNetwork(page, baseURL!);
  await startWithOneReport(page);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta ora' }).click();
  expect((await download).suggestedFilename()).toMatch(/^bloodio-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText(REMINDER)).toBeHidden();

  expect(external).toEqual([]);
});
