import { buildPdfFromFixture } from '../tests/fixtures/build-pdf';
import { expect, test } from './test';

interface Manifest {
  name: string;
  lang: string;
  display: string;
  icons: { src: string; purpose?: string }[];
}

test('after the first visit Bloodio opens and reads a report offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ho capito, inizia' }).click();
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();
  // ready resolves once the service worker is active, that is after its precache is complete.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  const reloaded = await page.reload();
  expect(reloaded?.fromServiceWorker(), 'index.html from the service worker').toBe(true);
  await expect(page.getByText('Nessun referto ancora.')).toBeVisible();

  // pdf.js and its worker load on first use: offline they must come from the precache.
  await page.getByRole('link', { name: 'Carica un referto' }).first().click();
  const worker = page.waitForResponse(/pdf\.worker/);
  await page.locator('#report-file').setInputFiles({
    name: 'referto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await buildPdfFromFixture('proavis-2022-08-20')),
  });
  await page.getByRole('button', { name: 'Salva referto' }).click();
  await expect(page.getByText('Referto salvato')).toBeVisible();
  expect((await worker).fromServiceWorker(), 'pdf.js worker from the precache').toBe(true);

  await page.getByRole('link', { name: 'Impostazioni' }).click();
  await expect(page.getByText('Bloodio funziona anche senza connessione.')).toBeVisible();
});

test('Bloodio is installable and served with the CSP header', async ({
  page,
  context,
  request,
}) => {
  const response = await page.goto('/');
  // The header policy carries frame-ancestors, which a meta tag cannot: proves preview.headers is wired.
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");

  // vite preview falls back to index.html (200 text/html) for missing files: check the type too.
  const expectImage = async (url: string, label: string) => {
    const res = await request.get(url);
    expect(res.status(), label).toBe(200);
    expect(res.headers()['content-type'], label).toMatch(/^image\//);
  };

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).not.toBeNull();
  const manifestUrl = new URL(href!, page.url());
  const manifestRes = await request.get(manifestUrl.href);
  expect(manifestRes.ok()).toBe(true);
  expect(manifestRes.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await manifestRes.json()) as Manifest;
  expect(manifest).toMatchObject({ name: 'Bloodio', display: 'standalone', lang: 'it' });
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    await expectImage(new URL(icon.src, manifestUrl).href, icon.src);
  }

  const iconHrefs = await page
    .locator('link[rel~="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  expect(iconHrefs.length).toBeGreaterThanOrEqual(3);
  for (const iconHref of iconHrefs) {
    await expectImage(new URL(iconHref, page.url()).href, iconHref);
  }

  // Chromium's own verdict, the one behind its install prompt.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});
