// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { PageRenderer } from '../../src/ingest/image-pages';
import { IngestError } from '../../src/ingest/ingest-file';
import { identityGeometry } from '../../src/ingest/page-geometry';
import type { OcrEngine, OcrOptions, OcrProgress } from '../../src/ocr/types';
import type { PositionedText } from '../../src/parsers/types';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ImportSessionProvider, useImportSession } from '../../src/ui/import/import-session';
import { ImportPage } from '../../src/ui/pages/ImportPage';
import { loadOcrFixture } from '../fixtures/load';
import { testServices } from './fake-services';
import './setup-dom';

function SessionProbe() {
  const { session } = useImportSession();
  return <p>sessione: {session?.mode ?? 'nessuna'}</p>;
}

function renderImportPage(services: Services) {
  return render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={['/import']}>
        <ImportSessionProvider>
          <Routes>
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/verify" element={<SessionProbe />} />
          </Routes>
        </ImportSessionProvider>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

const png = (name: string) =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
const pdf = () =>
  new File([new Uint8Array([37, 80, 68, 70])], 'referto.pdf', { type: 'application/pdf' });

const fakePages: PageRenderer = {
  fromImages: (files) =>
    Promise.resolve(
      files.map(() => ({
        canvas: document.createElement('canvas'),
        geometry: identityGeometry({ width: 1, height: 1 }),
      })),
    ),
  fromPdf: () => Promise.reject(new Error('no PDF in this test')),
  original: () => Promise.reject(new Error('no original in this test')),
};

/** An engine the test drives: it reports what the test asks and finishes when told to. */
function scriptedEngine(ignoreAbort = false) {
  let finish!: (text: PositionedText) => void;
  const done = new Promise<PositionedText>((resolve) => (finish = resolve));
  let options: OcrOptions | undefined;
  const engine: OcrEngine = {
    recognize: (_pages, given) => {
      options = given;
      if (ignoreAbort) return done;
      // Like the real engine: an aborted reading rejects, even if the text arrives later.
      const aborted = new Promise<never>((_resolve, reject) => {
        given?.signal?.addEventListener('abort', () => reject(given.signal?.reason), {
          once: true,
        });
      });
      return Promise.race([done, aborted]);
    },
  };
  return {
    engine,
    progress: (progress: OcrProgress) => act(() => options?.onProgress?.(progress)),
    signal: () => options?.signal,
    finish,
  };
}

async function startReading(
  files = [png('pagina-1.png'), png('pagina-2.png')],
  setup?: (services: Services) => void,
  ignoreAbort = false,
) {
  const services = await testServices();
  setup?.(services);
  const ocr = scriptedEngine(ignoreAbort);
  services.ocr = () => Promise.resolve(ocr.engine);
  services.pages = fakePages;
  const view = renderImportPage(services);
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('Scegli il referto'), files);
  await vi.waitFor(() => expect(ocr.signal()).toBeDefined());
  return { ocr, user, view };
}

describe('ImportPage — manual entry', () => {
  it('starts a manual session and moves to the verification page', async () => {
    renderImportPage(await testServices());
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Inserisci i valori a mano' }));
    expect(await screen.findByText('sessione: manual')).toBeInTheDocument();
  });
});

describe('ImportPage — choosing files', () => {
  it('takes a PDF, or one or more images', async () => {
    renderImportPage(await testServices());
    const input = screen.getByLabelText('Scegli il referto');
    expect(input).toHaveAttribute('multiple');
    expect(input.getAttribute('accept')).toContain('application/pdf');
    expect(input.getAttribute('accept')).toContain('image/jpeg');
    expect(input.getAttribute('accept')).toContain('.heic');
  });

  it('refuses a PDF chosen together with images', async () => {
    renderImportPage(await testServices());
    await userEvent
      .setup()
      .upload(screen.getByLabelText('Scegli il referto'), [pdf(), png('a.png')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Scegli un solo PDF, oppure una o più immagini.',
    );
  });
});

describe('ImportPage — reading scans and photos', () => {
  it('shows the preparation, then the page being read, with a bar for each page', async () => {
    const { ocr } = await startReading();
    ocr.progress({ phase: 'loading', page: 0, pages: 2, fraction: 0 });
    expect(await screen.findByRole('status')).toHaveTextContent('Preparazione della lettura…');
    expect(
      screen.getByRole('progressbar', { name: 'Preparazione della lettura…' }),
    ).not.toHaveAttribute('value');

    ocr.progress({ phase: 'recognizing', page: 2, pages: 2, fraction: 0.5 });
    expect(screen.getByRole('status')).toHaveTextContent('Lettura della pagina 2 di 2…');
    expect(
      screen.getByRole('progressbar', { name: 'Lettura della pagina 2 di 2…' }),
    ).toHaveAttribute('value', '0.5');
  });

  it('announces a page once, not every step of its bar', async () => {
    const { ocr } = await startReading();
    ocr.progress({ phase: 'recognizing', page: 1, pages: 2, fraction: 0.1 });
    const status = await screen.findByRole('status');
    const announced = status.textContent;
    ocr.progress({ phase: 'recognizing', page: 1, pages: 2, fraction: 0.9 });
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent).toBe(announced);
  });

  it('does not number the only page', async () => {
    const { ocr } = await startReading([png('foto.png')]);
    ocr.progress({ phase: 'recognizing', page: 1, pages: 1, fraction: 0 });
    expect(await screen.findByRole('status')).toHaveTextContent('Lettura della pagina…');
  });

  it('cancels: stops the engine, says so and gives the focus back to the file picker', async () => {
    const { ocr, user } = await startReading();
    ocr.progress({ phase: 'loading', page: 0, pages: 2, fraction: 0 });
    await user.click(await screen.findByRole('button', { name: 'Annulla' }));
    expect(ocr.signal()?.aborted).toBe(true);
    expect(await screen.findByText('Lettura annullata.')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText('Scegli il referto')).toHaveFocus());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/^sessione:/)).not.toBeInTheDocument();
  });

  it('ignores a reading that finishes after Annulla, even from an engine that ignores the signal', async () => {
    const { ocr, user } = await startReading([png('foto.png')], undefined, true);
    ocr.progress({ phase: 'recognizing', page: 1, pages: 1, fraction: 0.5 });
    await user.click(await screen.findByRole('button', { name: 'Annulla' }));
    ocr.finish(loadOcrFixture('proavis-2021-07-10'));
    expect(await screen.findByText('Lettura annullata.')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/^sessione:/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Lettura annullata.')).toBeInTheDocument();
  });

  it('shows no error when an empty reading finishes after Annulla', async () => {
    const { ocr, user } = await startReading([png('foto.png')], undefined, true);
    ocr.progress({ phase: 'recognizing', page: 1, pages: 1, fraction: 0.5 });
    await user.click(await screen.findByRole('button', { name: 'Annulla' }));
    ocr.finish({ source: 'ocr', pages: [{ width: 10, height: 10, items: [] }] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Lettura annullata.')).toBeInTheDocument();
  });
  it('ignores a cancel that lands while the duplicate check runs', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    let asked = false;
    const { ocr, user } = await startReading([png('foto.png')], (services) => {
      services.reports.findDuplicates = async () => {
        asked = true;
        await pending;
        return [];
      };
    });
    ocr.progress({ phase: 'recognizing', page: 1, pages: 1, fraction: 0.5 });
    ocr.finish(loadOcrFixture('proavis-2021-07-10'));
    await vi.waitFor(() => expect(asked).toBe(true));
    await user.click(await screen.findByRole('button', { name: 'Annulla' }));
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/^sessione:/)).not.toBeInTheDocument();
    expect(screen.getByText('Lettura annullata.')).toBeInTheDocument();
  });

  it('puts the focus on Annulla when the progress appears', async () => {
    const { ocr } = await startReading();
    ocr.progress({ phase: 'loading', page: 0, pages: 2, fraction: 0 });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Annulla' })).toHaveFocus());
  });

  it('stops the engine when the user leaves the page', async () => {
    const { ocr, view } = await startReading();
    view.unmount();
    expect(ocr.signal()?.aborted).toBe(true);
  });

  it('opens the verification with the rows it read', async () => {
    const { ocr } = await startReading([png('foto.png')]);
    ocr.finish(loadOcrFixture('proavis-2021-07-10'));
    expect(await screen.findByText('sessione: import')).toBeInTheDocument();
  });

  it('says when the images hold no values', async () => {
    const { ocr } = await startReading([png('foto.png')]);
    ocr.finish({ source: 'ocr', pages: [{ width: 10, height: 10, items: [] }] });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non ho trovato valori nelle pagine lette.',
    );
  });

  it('says when the reader cannot be prepared', async () => {
    const services = await testServices();
    services.ocr = () => Promise.reject(new Error('offline'));
    services.pages = fakePages;
    renderImportPage(services);
    await userEvent.setup().upload(screen.getByLabelText('Scegli il referto'), [png('foto.png')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non riesco a preparare la lettura delle immagini. La prima volta serve la connessione.',
    );
  });

  it('says when a HEIC photo cannot be opened', async () => {
    const services = await testServices();
    services.pages = {
      ...services.pages,
      fromImages: () => Promise.reject(new IngestError('heic-unsupported')),
    };
    renderImportPage(services);
    const heic = new File([new Uint8Array([1])], 'foto.heic', { type: 'image/heic' });
    await userEvent.setup().upload(screen.getByLabelText('Scegli il referto'), [heic]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Questo browser non apre le foto HEIC.',
    );
  });
});
