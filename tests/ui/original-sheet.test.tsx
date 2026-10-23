// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageRenderer } from '../../src/ingest/image-pages';
import { identityGeometry, type PageGeometry } from '../../src/ingest/page-geometry';
import { parseReport } from '../../src/parsers/registry';
import type { DraftRow } from '../../src/parsers/types';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ImportSessionProvider, type ImportSession } from '../../src/ui/import/import-session';
import { VerifyPage } from '../../src/ui/pages/VerifyPage';
import { loadFixture, loadOcrFixture } from '../fixtures/load';
import { testServices } from './fake-services';
import './setup-dom';

/** A PDF with text, cut to one doubtful row and one clean row. */
function pdfSession(): ImportSession {
  const text = loadFixture('proavis-2021-10-04');
  const draft = parseReport(text);
  return {
    mode: 'import',
    file: {
      text,
      fileHash: 'fake-hash',
      files: [{ data: new ArrayBuffer(0), mimeType: 'application/pdf', fileName: 'referto.pdf' }],
      geometry: text.pages.map(identityGeometry),
    },
    draft: {
      ...draft,
      rows: draft.rows.filter((row) => ['Vitamina D (25 OH)', 'Glicemia'].includes(row.rawName)),
    },
  };
}

async function renderVerifyPage(services: Services, session: ImportSession = pdfSession()) {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <ServicesProvider services={services}>
        <ImportSessionProvider initialSession={session}>
          <VerifyPage />
        </ImportSessionProvider>
      </ServicesProvider>
    </MemoryRouter>,
  );
  await user.click(await screen.findByRole('button', { name: /^Tutti/ }));
  return { user };
}

/** The two ways to close the sheet from inside it. */
const closers: [string, (user: ReturnType<typeof userEvent.setup>) => Promise<void>][] = [
  ['"Chiudi"', (user) => user.click(screen.getByRole('button', { name: 'Chiudi' }))],
  ['Esc', (user) => user.keyboard('{Escape}')],
];

describe('"Vedi originale" in the verification of a PDF with text', () => {
  let services: Services;

  beforeEach(async () => {
    services = await testServices();
  });

  it('is offered on every row read from the file, doubtful or not', async () => {
    await renderVerifyPage(services);
    for (const name of ['Vitamina D (25 OH)', 'Glicemia']) {
      const row = screen.getByRole('article', { name });
      expect(within(row).getByRole('button', { name: 'Vedi originale' })).toBeInTheDocument();
    }
  });

  it('is not offered on a row the user added', async () => {
    const { user } = await renderVerifyPage(services);
    await user.click(screen.getByRole('button', { name: 'Aggiungi un valore' }));
    const added = screen.getByRole('article', { name: 'Aggiungi un valore' });
    expect(within(added).queryByRole('button', { name: 'Vedi originale' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Vedi originale' })).toHaveLength(2);
  });

  it('opens the page at once, with the row as read, while the page is prepared', async () => {
    services.pages.original = () => new Promise(() => {});
    const { user } = await renderVerifyPage(services);
    const row = screen.getByRole('article', { name: 'Vitamina D (25 OH)' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));

    const sheet = screen.getByRole('dialog', { name: 'Pagina 1 di 2' });
    expect(
      within(sheet).getByText(
        'Vitamina D (25 OH) 65,8 ng/ml 4-10 Carenza grave 10-30 Carenza moderata > 30 Normale',
      ),
    ).toBeInTheDocument();
    expect(within(sheet).getByText('Preparazione della pagina…')).toBeInTheDocument();
    expect(within(sheet).queryByRole('img')).not.toBeInTheDocument();
  });

  it('says so when the page cannot be drawn, and keeps the row as read', async () => {
    services.pages.original = () => Promise.reject(new Error('out of memory'));
    const { user } = await renderVerifyPage(services);
    const row = screen.getByRole('article', { name: 'Glicemia' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));

    const sheet = screen.getByRole('dialog', { name: 'Pagina 1 di 2' });
    expect(await within(sheet).findByText('Non riesco a mostrare la pagina.')).toBeInTheDocument();
    expect(within(sheet).queryByText('Preparazione della pagina…')).not.toBeInTheDocument();
    expect(within(sheet).getByText('Glicemia 95 mg/dl da 70 a 110')).toBeInTheDocument();
  });

  it('shows the page of the row with a rectangle over it', async () => {
    const drawn = document.createElement('canvas');
    const original = vi.fn<PageRenderer['original']>(() => Promise.resolve(drawn));
    services.pages.original = original;
    const session = pdfSession();
    if (session.mode !== 'import') throw new Error('an import session is expected');
    const boxed: ImportSession = {
      ...session,
      draft: {
        ...session.draft,
        rows: session.draft.rows.map((row) =>
          row.rawName === 'Glicemia' ? { ...row, bbox: { x: 40, y: 550, w: 500, h: 12 } } : row,
        ),
      },
    };
    const { user } = await renderVerifyPage(services, boxed);
    const row = screen.getByRole('article', { name: 'Glicemia' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));

    const sheet = screen.getByRole('dialog', { name: 'Pagina 1 di 2' });
    const page = await within(sheet).findByRole('img', {
      name: 'Pagina 1 del referto, riga Glicemia evidenziata',
    });
    expect(original).toHaveBeenCalledWith(session.file.files, 0);
    expect(within(sheet).queryByText('Preparazione della pagina…')).not.toBeInTheDocument();
    await waitFor(() => expect([...sheet.querySelectorAll('canvas')]).toEqual([drawn]));
    // A PDF with text: the rectangle is the row's box, in PDF points of the 612 × 792 page, with
    // its bottom 0.3 of the 12-point line below the baseline, where commas and descenders go.
    expect(page.querySelector('svg')).toHaveAttribute('viewBox', '0 0 612 792');
    const points = page.querySelector('polygon')!.getAttribute('points')!;
    expect(
      points
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(',').map(Number)),
    ).toEqual([
      [40, 550],
      [540, 550],
      [540, expect.closeTo(565.6, 6)],
      [40, expect.closeTo(565.6, 6)],
    ]);
  });

  it('grows the rectangle by 0.3 of one line, not of the whole box, for a range on three lines', async () => {
    const drawn = document.createElement('canvas');
    services.pages.original = () => Promise.resolve(drawn);
    const session = pdfSession();
    if (session.mode !== 'import') throw new Error('an import session is expected');
    // Vitamina D's range takes three lines: a 36-point box holds three lines of 12.
    const boxed: ImportSession = {
      ...session,
      draft: {
        ...session.draft,
        rows: session.draft.rows.map((row) =>
          row.rawName === 'Vitamina D (25 OH)'
            ? { ...row, bbox: { x: 40, y: 300, w: 500, h: 36 } }
            : row,
        ),
      },
    };
    const { user } = await renderVerifyPage(services, boxed);
    const row = screen.getByRole('article', { name: 'Vitamina D (25 OH)' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));

    const sheet = screen.getByRole('dialog', { name: 'Pagina 1 di 2' });
    const page = await within(sheet).findByRole('img');
    await waitFor(() => expect([...sheet.querySelectorAll('canvas')]).toEqual([drawn]));
    // The last baseline at 336, then 0.3 of a 12-point line: 3.6 points, not 10.8.
    const corners = page
      .querySelector('polygon')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(',').map(Number));
    expect(corners).toEqual([
      [40, 300],
      [540, 300],
      [540, expect.closeTo(339.6, 6)],
      [40, expect.closeTo(339.6, 6)],
    ]);
  });

  it.each(closers)('closes on %s, frees the page and gives the focus back', async (_, close) => {
    const drawn = Object.assign(document.createElement('canvas'), { width: 2550, height: 3300 });
    services.pages.original = () => Promise.resolve(drawn);
    const { user } = await renderVerifyPage(services);
    const opener = within(screen.getByRole('article', { name: 'Glicemia' })).getByRole('button', {
      name: 'Vedi originale',
    });
    await user.click(opener);
    await screen.findByRole('img', { name: /^Pagina 1 del referto/ });

    await close(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect([drawn.width, drawn.height]).toEqual([0, 0]);
  });

  it('keeps Tab inside the sheet', async () => {
    services.pages.original = () => new Promise(() => {});
    const { user } = await renderVerifyPage(services);
    await user.click(
      within(screen.getByRole('article', { name: 'Glicemia' })).getByRole('button', {
        name: 'Vedi originale',
      }),
    );
    const sheet = screen.getByRole('dialog');
    for (let i = 0; i < 3; i++) {
      await user.tab();
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }
  });
});

describe('zoom and pan of the page', () => {
  let services: Services;

  // A 400 × 700 page area: jsdom lays nothing out, so the area reports this size.
  beforeEach(async () => {
    services = await testServices();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  });
  afterEach(() => vi.restoreAllMocks());

  /**
   * The Glicemia row at a known box of the 612 × 792 page, one line of text 12 points high, with
   * no box of its value unless one is given: the sheet then opens on the centre of the row.
   */
  async function openGlicemia(
    boxes: Pick<DraftRow, 'bbox' | 'valueBox'> = {
      bbox: { x: 40, y: 550, w: 500, h: 12 },
    },
  ) {
    const session = pdfSession();
    if (session.mode !== 'import') throw new Error('an import session is expected');
    const boxed: ImportSession = {
      ...session,
      draft: {
        ...session.draft,
        rows: session.draft.rows.map((row) =>
          row.rawName === 'Glicemia' ? { ...row, valueBox: undefined, ...boxes } : row,
        ),
      },
    };
    const { user } = await renderVerifyPage(services, boxed);
    const row = screen.getByRole('article', { name: 'Glicemia' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));
    return { user, sheet: screen.getByRole('dialog') };
  }

  /** The zoom and the offset of the page, from its CSS transform. */
  function viewOf(page: HTMLElement) {
    const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(
      page.style.transform,
    );
    if (!match) throw new Error(`unexpected transform: ${page.style.transform}`);
    return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
  }

  const drawn = () =>
    Object.assign(document.createElement('canvas'), { width: 2550, height: 3300 });

  it('hides the zoom controls until the page is ready', async () => {
    services.pages.original = () => new Promise(() => {});
    const { sheet } = await openGlicemia();
    expect(within(sheet).getByText('Preparazione della pagina…')).toBeInTheDocument();
    for (const name of ['Riduci', 'Adatta alla larghezza', 'Ingrandisci']) {
      expect(within(sheet).queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('opens with the name and the value of the row in view', async () => {
    services.pages.original = () => Promise.resolve(drawn());
    const { sheet } = await openGlicemia({
      bbox: { x: 40, y: 300, w: 500, h: 12 },
      valueBox: { x: 300, y: 301, w: 20, h: 10 },
    });
    const page = await within(sheet).findByRole('img');
    // From the name at x 40 to the value's end at 320: 280 points, 467 pixels at 20 a line. They
    // fit the 368 between the margins at 368 / 280, a line 15.8 pixels high, centred on (180, 306).
    const zoom = 368 / 280;
    await waitFor(() =>
      expect(viewOf(page)).toEqual({
        zoom: expect.closeTo(zoom, 3),
        x: expect.closeTo(200 - 180 * zoom, 1),
        y: expect.closeTo(350 - 306 * zoom, 1),
      }),
    );
  });

  it('zooms in and out by 1.5, fits the width, and stops at the limits', async () => {
    services.pages.original = () => Promise.resolve(drawn());
    const { user, sheet } = await openGlicemia();
    const page = await within(sheet).findByRole('img');
    await waitFor(() => expect(viewOf(page).zoom).toBeCloseTo(20 / 12, 3));

    await user.click(within(sheet).getByRole('button', { name: 'Ingrandisci' }));
    expect(viewOf(page).zoom).toBeCloseTo(2.5, 3);
    await user.click(within(sheet).getByRole('button', { name: 'Riduci' }));
    expect(viewOf(page).zoom).toBeCloseTo(20 / 12, 3);

    await user.click(within(sheet).getByRole('button', { name: 'Adatta alla larghezza' }));
    expect(viewOf(page)).toMatchObject({ zoom: expect.closeTo(400 / 612, 3), x: 0 });
    await user.click(within(sheet).getByRole('button', { name: 'Riduci' }));
    expect(viewOf(page).zoom).toBeCloseTo(400 / 612, 3);

    // 2 CSS pixels per canvas pixel: 2 × 2550 / 612.
    for (let i = 0; i < 8; i++) {
      await user.click(within(sheet).getByRole('button', { name: 'Ingrandisci' }));
    }
    expect(viewOf(page).zoom).toBeCloseTo((2 * 2550) / 612, 3);
  });

  it('moves the page by 40 pixels with the arrows, once the page area has the focus', async () => {
    services.pages.original = () => Promise.resolve(drawn());
    const { user, sheet } = await openGlicemia();
    const page = await within(sheet).findByRole('img');
    await waitFor(() => expect(viewOf(page).zoom).toBeCloseTo(20 / 12, 3));
    const start = viewOf(page);

    // From "Chiudi", which has the focus on opening, to the page area.
    await user.tab();
    expect(page.parentElement).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(viewOf(page).x).toBeCloseTo(start.x - 40, 1);
    await user.keyboard('{ArrowDown}');
    expect(viewOf(page).y).toBeCloseTo(start.y - 40, 1);
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(viewOf(page)).toEqual({
      zoom: start.zoom,
      x: expect.closeTo(start.x, 1),
      y: expect.closeTo(start.y, 1),
    });
  });
});

describe('the Back gesture with the sheet open', () => {
  // The browser history of jsdom, as the app uses it: the import screen, then the verification.
  beforeEach(() => {
    window.history.replaceState(null, '', '#/import');
    window.history.pushState(null, '', '#/import/verify');
  });

  async function renderInHistory() {
    const user = userEvent.setup();
    const services = await testServices();
    services.pages.original = () => new Promise(() => {});
    render(
      <HashRouter>
        <ServicesProvider services={services}>
          <ImportSessionProvider initialSession={pdfSession()}>
            <Routes>
              <Route path="import" element={<h1>Import</h1>} />
              <Route path="import/verify" element={<VerifyPage />} />
            </Routes>
          </ImportSessionProvider>
        </ServicesProvider>
      </HashRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /^Tutti/ }));
    const row = screen.getByRole('article', { name: 'Glicemia' });
    const opener = within(row).getByRole('button', { name: 'Vedi originale' });
    return { user, row, opener };
  }

  it('closes the sheet and stays in the verification, with its values', async () => {
    const { user, row, opener } = await renderInHistory();
    const value = within(row).getByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '91');
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    window.history.back();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.location.hash).toBe('#/import/verify');
    expect(
      within(screen.getByRole('article', { name: 'Glicemia' })).getByLabelText('Valore'),
    ).toHaveValue('91');
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each(closers)(
    'after %s, Back leaves the verification as if the sheet never opened',
    async (_, close) => {
      const { user, opener } = await renderInHistory();
      await user.click(opener);
      await close(user);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(window.location.hash).toBe('#/import/verify');

      window.history.back();

      expect(await screen.findByRole('heading', { name: 'Import' })).toBeInTheDocument();
      expect(window.location.hash).toBe('#/import');
    },
  );
});

describe('"Vedi originale" on a photo', () => {
  it('turns the rectangle with the photo, which was read straightened', async () => {
    const services = await testServices();
    services.pages.original = () => Promise.resolve(document.createElement('canvas'));
    const text = loadOcrFixture('proavis-2021-07-10');
    // The photo was read at its own size, then straightened by 1.5°.
    const geometry: PageGeometry = {
      width: 2550,
      height: 3300,
      scale: 1,
      quarterTurns: 0,
      skewDegrees: 1.5,
    };
    const session: ImportSession = {
      mode: 'import',
      file: {
        text,
        fileHash: 'ocr-hash',
        files: [{ data: new ArrayBuffer(0), mimeType: 'image/jpeg', fileName: 'pagina-1.jpg' }],
        geometry: [geometry],
      },
      draft: parseReport(text),
    };
    const { user } = await renderVerifyPage(services, session);
    const row = screen.getByRole('article', { name: 'TSH' });
    await user.click(within(row).getByRole('button', { name: 'Vedi originale' }));

    const page = await screen.findByRole('img', {
      name: 'Pagina 1 del referto, riga TSH evidenziata',
    });
    expect(page.querySelector('svg')).toHaveAttribute('viewBox', '0 0 2550 3300');
    const [topLeft, topRight] = page
      .querySelector('polygon')!
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(',').map(Number));
    // Not a straight rectangle: on the photo the row slopes down to the right, as it was taken.
    expect(topRight![1]).toBeGreaterThan(topLeft![1]! + 1);
  });
});

describe('"Vedi originale" is not offered without a file', () => {
  const editSession: ImportSession = {
    mode: 'edit',
    reportId: 'r1',
    report: {
      id: 'r1',
      profileId: 'default',
      sampleDate: '2022-08-20',
      lab: 'PROAVIS',
      type: 'sangue',
      source: 'parser',
      adapterId: 'proavis',
      notes: '',
      fileHash: null,
      createdAt: '2022-08-20T00:00:00.000Z',
      updatedAt: '2022-08-20T00:00:00.000Z',
    },
    measurements: [
      {
        id: 'm1',
        reportId: 'r1',
        analyteId: 'tsh',
        customAnalyteId: null,
        value: 5.07,
        comparator: null,
        valueText: '5,07',
        unit: 'µUI/mL',
        refMin: 0.27,
        refMax: 4.2,
        refText: null,
        outOfRange: true,
        confidence: 1,
        section: null,
        order: 0,
      },
    ],
  };
  it.each([
    ['manual entry', { mode: 'manual' } as ImportSession],
    ['editing a report', editSession],
  ])('in %s', async (_, session) => {
    await renderVerifyPage(await testServices(), session);
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Vedi originale' })).not.toBeInTheDocument();
  });
});
