import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';

/** Desktop and emulated phones may share files: force the download path, as the PNG test does. */
async function forceDownloads(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: undefined,
      configurable: true,
    });
  });
}

test('export, delete everything, import the file back', async ({ page }) => {
  await forceDownloads(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2022-08-20')),
  });
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByText('Referto salvato')).toBeVisible();

  await page.getByRole('link', { name: 'Impostazioni' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta i dati' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bloodio-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  await expect(page.getByText(/^Ultima esportazione:/)).toBeVisible();

  await page.getByRole('button', { name: 'Elimina tutti i dati' }).click();
  await page.getByRole('button', { name: 'Continua' }).click();
  const finalStep = page.getByRole('button', { name: 'Elimina definitivamente' });
  await expect(finalStep).toBeVisible();
  // The final button ignores taps for a moment after it appears (double-tap guard).
  await page.waitForTimeout(700);
  await finalStep.click();
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();

  await page.getByRole('link', { name: 'Impostazioni' }).click();
  await page.getByLabel('Importa un file').setInputFiles(path);
  await page
    .getByRole('dialog', { name: 'Importa i dati' })
    .getByRole('button', { name: 'Importa' })
    .click();
  await expect(page.getByText('Importato 1 referto', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Referti' }).first().click();
  await expect(page.getByRole('link', { name: /20 ago 2022/ })).toContainText('25 valori');
});

test('the theme picked stays after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.getByRole('link', { name: 'Impostazioni' }).click();
  const carta = page.getByRole('radio', { name: /^Carta/ });
  // click, not check(): the radio follows the saved setting, which lands a moment after the click.
  await carta.click();
  await expect(carta).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carta');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'carta');
});
