import type { Page } from '@playwright/test';
import { expect, test } from './test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import type { FixtureName } from '../tests/fixtures/load';

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

test('a report compared with the previous one, then with another', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await importFixture(page, 'proavis-2021-07-10');
  await importFixture(page, 'proavis-2021-10-04');
  await importFixture(page, 'proavis-2022-08-20');

  await page.getByRole('button', { name: 'Confronta con il precedente' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Confronto' })).toBeVisible();
  await expect(page.getByRole('link', { name: '4 ottobre 2021', exact: true })).toBeVisible();
  // A row is the parent of its name's link.
  // Eosinophils % go from 2,6 (in range) to 7,8 (above it) between October 2021 and August 2022.
  const changed = page.getByRole('region', { name: 'Cambiati rispetto al range' });
  const eosinophils = changed
    .getByRole('link', { name: 'Eosinofili %', exact: true })
    .locator('..');
  await expect(eosinophils.getByText('↑ ora sopra')).toBeVisible();
  const tsh = page.getByRole('link', { name: 'TSH', exact: true }).locator('..');
  await expect(tsh.getByText('+3,17 · +167%')).toBeVisible();

  await expect(page.getByText(/^solo nel referto del/).first()).toBeVisible();
  const onlyCommon = page.getByRole('button', { name: 'Solo in comune' });
  await onlyCommon.click();
  await expect(onlyCommon).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/^solo nel referto del/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Cambia referto' }).click();
  const sheet = page.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' });
  await sheet.getByRole('radio', { name: /10 luglio 2021/ }).check();
  await sheet.getByRole('button', { name: 'Confronta' }).click();
  await expect(page.getByRole('link', { name: '10 luglio 2021', exact: true })).toBeVisible();
  await expect(tsh.getByText('+2,73 · +117%')).toBeVisible();

  await page.getByRole('link', { name: 'Referto del 20 agosto 2022' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '20 agosto 2022' })).toBeVisible();
});
