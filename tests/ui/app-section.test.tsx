// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AppStatus, OfflineStatus } from '../../src/pwa/app-status';
import type { OcrOffline, OcrOfflineStatus } from '../../src/pwa/ocr-offline';
import { ServicesProvider } from '../../src/ui/app/services';
import { AppSection } from '../../src/ui/settings/AppSection';
import { testServices } from './fake-services';
import './setup-dom';

const INSTALL = /^Puoi aggiungere Bloodio alla schermata Home/;
const PREPARING = 'Sto preparando Bloodio per l’uso senza connessione.';
const READY = 'Bloodio funziona anche senza connessione.';
const OCR_DOWNLOADING =
  'Sto scaricando la lettura di foto e scansioni per l’uso senza connessione.';
const OCR_READY = 'Anche la lettura di foto e scansioni funziona senza connessione.';
const OCR_PAUSED = 'La lettura di foto e scansioni senza connessione non è ancora pronta.';

/** An app status the test drives: report() plays the service worker. */
function fakeApp(installed = false) {
  let listener: ((status: OfflineStatus) => void) | null = null;
  const app: AppStatus = {
    installed: () => installed,
    watchOffline(onChange) {
      listener = onChange;
      return () => {
        listener = null;
      };
    },
  };
  return {
    app,
    report: (status: OfflineStatus) => {
      act(() => listener?.(status));
    },
  };
}

/** An OCR download the test drives: report() plays the download, downloads() counts the button. */
function fakeOcr() {
  let listener: ((status: OcrOfflineStatus) => void) | null = null;
  let downloads = 0;
  let current: OcrOfflineStatus = 'unsupported';
  const ocrOffline: OcrOffline = {
    watch(onChange) {
      listener = onChange;
      onChange(current);
      return () => {
        listener = null;
      };
    },
    download() {
      if (current !== 'paused') return;
      downloads += 1;
      current = 'downloading';
      listener?.(current);
    },
    size: () => 8.6 * 1024 * 1024,
  };
  return {
    ocrOffline,
    report: (status: OcrOfflineStatus) => {
      current = status;
      act(() => listener?.(status));
    },
    downloads: () => downloads,
    watching: () => listener !== null,
  };
}

async function renderSection(app: AppStatus, ocrOffline?: OcrOffline) {
  const services = await testServices();
  return render(
    <ServicesProvider
      services={{ ...services, app, ocrOffline: ocrOffline ?? services.ocrOffline }}
    >
      <AppSection />
    </ServicesProvider>,
  );
}

describe('AppSection', () => {
  it('explains how to install, with no offline line while unsupported', async () => {
    await renderSection(fakeApp().app);
    expect(screen.getByRole('heading', { name: 'Uso come app' })).toBeInTheDocument();
    expect(screen.getByText(INSTALL)).toBeInTheDocument();
    expect(screen.queryByText(/senza connessione/)).not.toBeInTheDocument();
  });

  it('says when it is getting ready for offline use, then when it is ready', async () => {
    const { app, report } = fakeApp();
    await renderSection(app);
    report('preparing');
    expect(screen.getByText(PREPARING)).toBeInTheDocument();
    report('ready');
    expect(screen.getByText(READY)).toBeInTheDocument();
    expect(screen.queryByText(PREPARING)).not.toBeInTheDocument();
  });

  it('drops the install instructions in the installed app', async () => {
    const { app, report } = fakeApp(true);
    await renderSection(app);
    report('ready');
    expect(screen.getByText(READY)).toBeInTheDocument();
    expect(screen.queryByText(INSTALL)).not.toBeInTheDocument();
  });

  it('stops watching when it goes away', async () => {
    let live = 0;
    const app: AppStatus = {
      installed: () => false,
      watchOffline() {
        live += 1;
        return () => {
          live -= 1;
        };
      },
    };
    const { unmount } = await renderSection(app);
    expect(live).toBe(1);
    unmount();
    expect(live).toBe(0);
  });

  it('is absent in the installed app without offline support', async () => {
    await renderSection(fakeApp(true).app);
    expect(screen.queryByRole('heading', { name: 'Uso come app' })).not.toBeInTheDocument();
  });

  it('says when the OCR files are downloading, then when OCR works offline', async () => {
    const ocr = fakeOcr();
    await renderSection(fakeApp().app, ocr.ocrOffline);
    expect(screen.queryByText(/foto e scansioni/)).not.toBeInTheDocument();
    ocr.report('downloading');
    expect(screen.getByText(OCR_DOWNLOADING)).toBeInTheDocument();
    ocr.report('ready');
    expect(screen.getByText(OCR_READY)).toBeInTheDocument();
    expect(screen.queryByText(OCR_DOWNLOADING)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the paused download with its size, and keeps focus on the status', async () => {
    const ocr = fakeOcr();
    await renderSection(fakeApp().app, ocr.ocrOffline);
    ocr.report('paused');
    expect(screen.getByText(OCR_PAUSED)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Scarica ora (8,6 MB)' }));
    expect(ocr.downloads()).toBe(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(OCR_DOWNLOADING)).toHaveFocus();
  });

  it('shows in the installed app when only OCR has something to say', async () => {
    const ocr = fakeOcr();
    await renderSection(fakeApp(true).app, ocr.ocrOffline);
    ocr.report('ready');
    expect(screen.getByRole('heading', { name: 'Uso come app' })).toBeInTheDocument();
    expect(screen.getByText(OCR_READY)).toBeInTheDocument();
  });

  it('stops watching the OCR download when it goes away', async () => {
    const ocr = fakeOcr();
    const { unmount } = await renderSection(fakeApp().app, ocr.ocrOffline);
    expect(ocr.watching()).toBe(true);
    unmount();
    expect(ocr.watching()).toBe(false);
  });
});
