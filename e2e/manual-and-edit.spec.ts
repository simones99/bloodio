import { expect, test } from '@playwright/test';

test('a manually entered report is saved without a file and can be edited later', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
  await page.getByRole('button', { name: 'Inserisci i valori a mano' }).click();

  await expect(page.getByRole('heading', { name: 'Controlla i valori letti' })).toBeVisible();
  await page.locator('#sample-date').fill('2022-10-01');
  await page.locator('#report-lab').fill('Laboratorio di prova');

  const row = page.getByRole('article').first();
  await row.getByRole('button', { name: 'Voce' }).click();
  await page.getByLabel('Cerca per nome').fill('Glicemia');
  await page.getByRole('button', { name: /^Glicemia/ }).click();
  await row.getByLabel('Valore').fill('90');

  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
  await expect(page.getByText('Laboratorio di prova')).toBeVisible();

  await page.getByRole('button', { name: 'Modifica referto' }).click();
  await expect(page.getByRole('heading', { name: 'Controlla i valori letti' })).toBeVisible();
  await expect(page.locator('#sample-date')).toHaveValue('2022-10-01');
  const valueField = page.getByLabel('Valore');
  await valueField.fill('95');
  await page.getByRole('button', { name: 'Salva referto' }).click();

  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
  await expect(page.getByText('95', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Referti' }).first().click();
  await expect(page.getByRole('link', { name: /1 ott 2022/ })).toContainText('1 valore');
});
