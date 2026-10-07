import { expect, test } from '@playwright/test';
import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import { watchNetwork } from './network';

test('load a PDF, verify, save, and find it in the list', async ({ page, baseURL }) => {
  const external = watchNetwork(page, baseURL!);
  await page.goto('/');

  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();

  await page.getByRole('link', { name: 'Carica un referto' }).first().click();
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2022-08-20')),
  });

  await expect(page.getByRole('heading', { name: 'Controlla i valori letti' })).toBeVisible();
  await expect(
    page.getByText('25 valori letti. Niente viene salvato finché non confermi.'),
  ).toBeVisible();
  await expect(page.locator('#sample-date')).toHaveValue('2022-08-20');
  await expect(page.locator('#report-lab')).toHaveValue('PROAVIS');
  // nothing doubtful: every row is listed straight away
  await expect(page.getByRole('button', { name: 'Tutti, 25' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article', { name: 'TSH', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Salva referto' }).click();

  await expect(page.getByRole('status')).toHaveText('Referto salvato');
  await expect(page.getByRole('heading', { name: '20 agosto 2022' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tiroide' })).toBeVisible();
  await expect(page.getByText('sopra').first()).toBeVisible();

  await page.getByRole('link', { name: 'Referti' }).first().click();
  await expect(page.getByRole('link', { name: /20 ago 2022/ })).toContainText('25 valori');
  await expect(page.getByRole('link', { name: /20 ago 2022/ })).toContainText('11 fuori range');

  expect(external).toEqual([]);
});

test('a doubtful row is shown first and can be confirmed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2021-10-04')),
  });

  await expect(page.getByText('49 valori letti, 1 da controllare.')).toBeVisible();
  const row = page.getByRole('article', { name: 'Vitamina D (25 OH)' });
  await expect(row.getByText('Il referto stampa il range su più righe.')).toBeVisible();
  await row.getByRole('button', { name: 'Ho controllato' }).click();
  await expect(page.getByText('Niente da controllare.')).toBeVisible();

  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '4 ottobre 2021' })).toBeVisible();
  await expect(page.getByText('Sangue e urine')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Urine' })).toBeVisible();
});

test('the same file is recognised the second time', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  const file = {
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2021-07-10')),
  };
  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '10 luglio 2021' })).toBeVisible();

  await page.goto('/#/import');
  await page.locator('#report-file').setInputFiles(file);
  await expect(page.getByText('Questo file è già stato caricato')).toBeVisible();
  await expect(page.getByText('Corrisponde al referto del 10 luglio 2021.')).toBeVisible();
});

test('a photo is refused with a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
  await page
    .locator('#report-file')
    .setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([1, 2, 3]) });
  await expect(page.getByRole('alert')).toContainText('Questo file è una scansione o una foto');
});
