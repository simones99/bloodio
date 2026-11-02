import type { Page } from '@playwright/test';
import { expect, test } from './test';

const TITLE = 'Controlla i valori letti';

type FocusWatch = { focusOnLeaving: Promise<string> };

async function openManualReport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await page.goto('/#/import');
  await page.getByRole('button', { name: 'Inserisci i valori a mano' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
}

async function fillManualReport(page: Page) {
  await page.locator('#sample-date').fill('2022-10-01');
  const row = page.getByRole('article').first();
  await row.getByRole('button', { name: 'Voce' }).click();
  await page.getByLabel('Cerca per nome').fill('Glicemia');
  await page.getByRole('button', { name: /^Glicemia/ }).click();
  await row.getByLabel('Valore').fill('90');
}

async function openSavedReportForEditing(page: Page) {
  await openManualReport(page);
  await fillManualReport(page);
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
  await page.getByRole('button', { name: 'Modifica referto' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
}

/**
 * Clicks "Annulla" and returns what had focus in the commit that removed the verify page.
 * An observer in the page reads it: by the time Playwright could look, focus has moved on.
 */
async function discardAndGetFocusOnLeaving(page: Page) {
  await page.evaluate((title) => {
    (window as unknown as FocusWatch).focusOnLeaving = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.body.textContent?.includes(title)) return;
        observer.disconnect();
        resolve(document.activeElement?.tagName ?? 'none');
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }, TITLE);
  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  return page.evaluate(() => (window as unknown as FocusWatch).focusOnLeaving);
}

/**
 * Clicks "Annulla", then a save button once React has rendered the first click but has not
 * finished the navigation. Scripted: at full speed a real second tap comes after that window.
 */
async function discardThenTap(page: Page, saveButton: string) {
  await page.evaluate(async (saveName) => {
    const button = (name: string) =>
      [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;
    const save = button(saveName);
    button('Annulla').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    save.click();
  }, saveButton);
  // A save started by the second tap would land a moment later.
  await page.waitForTimeout(500);
}

// jsdom does not show this gap after a click, so a component test would stay green without the
// fix. No CPU throttling needed: the unfixed gap shows at full speed too.
test('discarding a new report moves focus to the next page in the commit that removes it', async ({
  page,
}) => {
  await openManualReport(page);

  expect(await discardAndGetFocusOnLeaving(page)).toBe('MAIN');
  await expect(page.getByRole('button', { name: 'Inserisci i valori a mano' })).toBeVisible();
});

test('discarding an edit moves focus to the next page in the commit that removes it', async ({
  page,
}) => {
  await openSavedReportForEditing(page);

  expect(await discardAndGetFocusOnLeaving(page)).toBe('MAIN');
  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
});

test('a second tap on save right after discarding does not save the new report', async ({
  page,
}) => {
  await openManualReport(page);
  await fillManualReport(page);

  await discardThenTap(page, 'Salva referto');

  await expect(page.getByRole('button', { name: 'Inserisci i valori a mano' })).toBeVisible();
  await page.getByRole('link', { name: 'Referti' }).first().click();
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();
});

test('a second tap on "Salva comunque" right after discarding does not save the duplicate', async ({
  page,
}) => {
  await openManualReport(page);
  await fillManualReport(page);
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
  await page.goto('/#/import');
  await page.getByRole('button', { name: 'Inserisci i valori a mano' }).click();
  await fillManualReport(page);
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByRole('button', { name: 'Salva comunque' })).toBeVisible();

  await discardThenTap(page, 'Salva comunque');

  await expect(page.getByRole('button', { name: 'Inserisci i valori a mano' })).toBeVisible();
  await page.getByRole('link', { name: 'Referti' }).first().click();
  await expect(page.getByRole('link', { name: /1 ott 2022/ })).toHaveCount(1);
});

test('a second tap on save right after discarding does not save the edit', async ({ page }) => {
  await openSavedReportForEditing(page);
  await page.getByLabel('Valore').fill('95');

  await discardThenTap(page, 'Salva referto');

  await expect(page.getByRole('heading', { name: '1 ottobre 2022' })).toBeVisible();
  await expect(page.getByText('90', { exact: true })).toBeVisible();
  await expect(page.getByText('95', { exact: true })).toHaveCount(0);
});
