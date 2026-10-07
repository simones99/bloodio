import { expect, test, type Page } from '@playwright/test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import type { FixtureName } from '../tests/fixtures/load';
import { watchNetwork } from './network';

async function importFixture(page: Page, fixture: FixtureName) {
  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles({
    name: `${fixture}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture(fixture)),
  });
  await expect(page.getByRole('heading', { name: 'Controlla i valori letti' })).toBeVisible();
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByText('Referto salvato')).toBeVisible();
}

test('from a report to the history of one of its values', async ({ page, baseURL }) => {
  const external = watchNetwork(page, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();

  await importFixture(page, 'proavis-2021-10-04');
  await importFixture(page, 'proavis-2022-08-20');

  await page.getByRole('link', { name: 'TSH', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'TSH' })).toBeVisible();
  await expect(page.getByText('20 agosto 2022, PROAVIS')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /^TSH da ottobre 2021 ad agosto 2022: 2 misure/ }),
  ).toBeVisible();
  const rows = page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('5,07');
  await expect(rows.nth(2)).toContainText('1,9');

  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByRole('heading', { name: '20 agosto 2022' })).toBeVisible();

  expect(external).toEqual([]);
});

test('a point of the chart opens its report', async ({ page, baseURL }) => {
  const external = watchNetwork(page, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await importFixture(page, 'proavis-2021-10-04');
  await importFixture(page, 'proavis-2022-08-20');
  await page.getByRole('link', { name: 'TSH', exact: true }).click();

  await page.getByRole('button', { name: /^4 ott 2021: 1,9 / }).click();
  await page.getByRole('link', { name: 'Apri il referto' }).click();
  await expect(page.getByRole('heading', { name: '4 ottobre 2021' })).toBeVisible();
  expect(external).toEqual([]);
});

test('the chart is saved as a PNG on the device', async ({ page, baseURL }) => {
  // Desktop browsers that can share files would open a share sheet: force the download path.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: undefined,
      configurable: true,
    });
  });
  const external = watchNetwork(page, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await importFixture(page, 'proavis-2021-10-04');
  await importFixture(page, 'proavis-2022-08-20');
  await page.getByRole('link', { name: 'TSH', exact: true }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Salva immagine' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('bloodio-tsh-2022-08-20.png');
  const bytes = await (await file.createReadStream()).toArray();
  const head = Buffer.concat(bytes).subarray(0, 8);
  expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(external).toEqual([]);
});

test('the values list finds an entry and opens its history', async ({ page, baseURL }) => {
  const external = watchNetwork(page, baseURL!);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await importFixture(page, 'proavis-2022-08-20');

  await page.getByRole('link', { name: 'Valori' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Valori' })).toBeVisible();
  await page.getByLabel('Cerca').fill('tsh');
  await page.getByRole('link', { name: /^TSH/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'TSH' })).toBeVisible();
  expect(external).toEqual([]);
});
