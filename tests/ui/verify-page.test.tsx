// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Measurement, Report } from '../../src/domain/types';
import { parseReport } from '../../src/parsers/registry';
import type { PositionedText } from '../../src/parsers/types';
import type { LatestReference } from '../../src/storage/types';
import { formatDateLong, it as itText } from '../../src/ui/i18n/it';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ImportSessionProvider, type ImportSession } from '../../src/ui/import/import-session';
import { ReportDetailPage } from '../../src/ui/pages/ReportDetailPage';
import { VerifyPage } from '../../src/ui/pages/VerifyPage';
import { loadFixture } from '../fixtures/load';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

const KEPT_ROW_NAMES = [
  'Cristalli',
  'Cellule epiteliali squamose',
  'TSH',
  'Vitamina D (25 OH)',
  'Sideremia',
];

function buildSession(): ImportSession {
  const text = loadFixture('proavis-2021-10-04');
  const fullDraft = parseReport(text);
  const draft = {
    ...fullDraft,
    rows: fullDraft.rows.filter((row) => KEPT_ROW_NAMES.includes(row.rawName)),
  };
  return {
    mode: 'import',
    file: {
      text: text satisfies PositionedText,
      fileHash: 'fake-hash',
      data: new ArrayBuffer(0),
      mimeType: 'application/pdf',
      fileName: 'referto.pdf',
    },
    draft,
  };
}

async function renderVerifyPage(services: Services, session = buildSession()) {
  render(
    <MemoryRouter>
      <ServicesProvider services={services}>
        <ImportSessionProvider initialSession={session}>
          <VerifyPage />
        </ImportSessionProvider>
      </ServicesProvider>
    </MemoryRouter>,
  );
  return { user: userEvent.setup() };
}

async function pickCustomAnalyteFor(
  rowName: string,
  user: ReturnType<typeof userEvent.setup>,
  analyteName = 'Cristalli speciali',
) {
  await user.click(await screen.findByRole('button', { name: /^Tutti/ }));
  const row = await screen.findByRole('article', { name: rowName });
  await user.click(within(row).getByRole('button', { name: /Voce/ }));
  const search = await screen.findByLabelText('Cerca per nome');
  await user.clear(search);
  await user.type(search, analyteName);
  await user.click(
    screen.getByRole('button', { name: `Salva «${analyteName}» come voce personalizzata` }),
  );
  return row;
}

describe('VerifyPage — custom analytes stay pending until save', () => {
  let services: Services;

  beforeEach(async () => {
    services = await testServices();
  });

  it('does not store a custom analyte chosen from the picker if the user cancels', async () => {
    const { user } = await renderVerifyPage(services);
    const row = await pickCustomAnalyteFor('Cristalli', user);
    expect(within(row).getByRole('heading')).toHaveTextContent('Cristalli speciali');

    await user.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(await services.customAnalytes.list()).toEqual([]);
  });

  it('creates the custom analyte only on save, and points the measurement to its real id', async () => {
    const { user } = await renderVerifyPage(services);
    const row = await pickCustomAnalyteFor('Cristalli', user);

    const confirmButton = within(row).queryByRole('button', { name: 'Ho controllato' });
    if (confirmButton) await user.click(confirmButton);

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await services.customAnalytes.list()).toHaveLength(1);
    });
    const created = (await services.customAnalytes.list())[0]!;
    expect(created.name).toBe('Cristalli speciali');

    const reports = await services.reports.listReports();
    expect(reports).toHaveLength(1);
    const { measurements } = (await services.reports.getReport(reports[0]!.id))!;
    const measurement = measurements.find((m) => m.customAnalyteId === created.id);
    expect(measurement).toBeDefined();
    expect(measurement?.customAnalyteId).not.toMatch(/^pending:/);
  });
});

describe('VerifyPage — lead sentence', () => {
  it('uses the singular for a single row', async () => {
    const services = await testServices();
    const text = loadFixture('proavis-2021-10-04');
    const fullDraft = parseReport(text);
    const draft = { ...fullDraft, rows: fullDraft.rows.filter((r) => r.rawName === 'TSH') };
    const session: ImportSession = {
      mode: 'import',
      file: {
        text,
        fileHash: 'fake-hash',
        data: new ArrayBuffer(0),
        mimeType: 'application/pdf',
        fileName: 'referto.pdf',
      },
      draft,
    };
    await renderVerifyPage(services, session);
    expect(await screen.findByText(/^1 valore letto\b/)).toBeInTheDocument();
  });
});

describe('VerifyPage — manual mode', () => {
  it('starts with one empty row and empty fields', async () => {
    const services = await testServices();
    await renderVerifyPage(services, { mode: 'manual' });
    expect(await screen.findByLabelText(itText.verify.sampleDate)).toHaveValue('');
    expect(screen.getByLabelText(itText.verify.lab)).toHaveValue('');
    expect(await screen.findByRole('article', { name: itText.verify.addRow })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tutti/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves with no file hash and source "manuale"', async () => {
    const services = await testServices();
    const { user } = await renderVerifyPage(services, { mode: 'manual' });

    await user.click(await screen.findByRole('button', { name: /Voce/ }));
    await user.type(await screen.findByLabelText('Cerca per nome'), 'Glicemia');
    await user.click(screen.getByRole('button', { name: /^Glicemia/ }));
    await user.type(screen.getByLabelText('Valore'), '90');
    const dateField = screen.getByLabelText(itText.verify.sampleDate);
    await user.type(dateField, '2022-09-01');

    await user.click(screen.getByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(1);
    });
    const [saved] = await services.reports.listReports();
    expect(saved).toMatchObject({ source: 'manuale', adapterId: null, fileHash: null });
  });
});

describe('VerifyPage — reference suggestion for a blank row', () => {
  async function pickCatalogAnalyteFor(
    rowName: string,
    user: ReturnType<typeof userEvent.setup>,
    analyteName: string,
  ) {
    const row = await screen.findByRole('article', { name: rowName });
    await user.click(within(row).getByRole('button', { name: /Voce/ }));
    const search = await screen.findByLabelText('Cerca per nome');
    await user.clear(search);
    await user.type(search, analyteName);
    await user.click(screen.getByRole('button', { name: new RegExp(`^${analyteName}`) }));
    return row;
  }

  it('suggests unit and range for a blank row once a matching analyte is picked', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services, { mode: 'manual' });
    const row = await pickCatalogAnalyteFor(itText.verify.addRow, user, 'TSH');

    expect(await within(row).findByLabelText('Unità')).toHaveValue('µUI/mL');
    expect(within(row).getByLabelText('Minimo')).toHaveValue('0,27');
    expect(within(row).getByLabelText('Massimo')).toHaveValue('4,2');
    expect(
      within(row).getByText(itText.verify.suggestedReference(formatDateLong('2022-08-20'))),
    ).toBeInTheDocument();
  });

  // Covers the FIRST guard in suggestReference(): the value was already typed before the
  // analyte was even picked, so the fetch is never started (the guard is checked
  // synchronously right after `update(updated)`, before `reports.latestReferenceFor` is called).
  it('never overwrites a value the user already typed before picking the analyte', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services, { mode: 'manual' });
    const row = await screen.findByRole('article', { name: itText.verify.addRow });
    await user.type(within(row).getByLabelText('Unità'), 'mg/dL');

    await pickCatalogAnalyteFor(itText.verify.addRow, user, 'TSH');

    expect(within(row).getByLabelText('Unità')).toHaveValue('mg/dL');
    expect(
      within(row).queryByText(itText.verify.suggestedReference(formatDateLong('2022-08-20'))),
    ).not.toBeInTheDocument();
  });

  // Covers the SECOND guard in suggestReference(): the fetch is already under way when the
  // user types, so it must be re-checked against the row's live state right before applying
  // the result. `reports.latestReferenceFor` is mocked to stay pending until this test
  // resolves it explicitly, giving deterministic control over "typed while in flight".
  it('does not overwrite a value typed while the suggestion fetch is still in flight', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    let resolveFetch: ((value: LatestReference | undefined) => void) | undefined;
    vi.spyOn(services.reports, 'latestReferenceFor').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { user } = await renderVerifyPage(services, { mode: 'manual' });
    const row = await pickCatalogAnalyteFor(itText.verify.addRow, user, 'TSH');

    // The fetch triggered by picking TSH is still pending: type into Unità before it resolves.
    await waitFor(() => expect(resolveFetch).toBeDefined());
    await user.type(within(row).getByLabelText('Unità'), 'mg/dL');

    // Now let the fetch resolve with what the seeded report would actually return.
    resolveFetch?.({
      unit: 'µUI/mL',
      refMin: 0.27,
      refMax: 4.2,
      refText: 'da 0,27 a 4,20',
      sampleDate: '2022-08-20',
    });

    await waitFor(() => {
      expect(within(row).getByLabelText('Unità')).toHaveValue('mg/dL');
    });
    expect(
      within(row).queryByText(itText.verify.suggestedReference(formatDateLong('2022-08-20'))),
    ).not.toBeInTheDocument();
  });

  it('clears the suggestion label once the user edits a suggested field', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services, { mode: 'manual' });
    const row = await pickCatalogAnalyteFor(itText.verify.addRow, user, 'TSH');

    await within(row).findByText(itText.verify.suggestedReference(formatDateLong('2022-08-20')));

    const min = within(row).getByLabelText('Minimo');
    await user.clear(min);
    await user.type(min, '1');

    expect(
      within(row).queryByText(itText.verify.suggestedReference(formatDateLong('2022-08-20'))),
    ).not.toBeInTheDocument();
    expect(min).toHaveValue('1');
  });
});

describe('VerifyPage — edit mode', () => {
  function editSession(): ImportSession {
    const report: Report = {
      id: 'r1',
      profileId: 'default',
      sampleDate: '2022-08-20',
      lab: 'PROAVIS',
      type: 'sangue',
      source: 'parser',
      adapterId: 'proavis',
      notes: 'nota di prova',
      fileHash: null,
      createdAt: '2022-08-20T00:00:00.000Z',
      updatedAt: '2022-08-20T00:00:00.000Z',
    };
    const measurements: Measurement[] = [
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
        refText: 'da 0,27 a 4,20',
        outOfRange: true,
        confidence: 1,
        section: 'MONITORAGGIO TIROIDE',
        order: 0,
      },
    ];
    return { mode: 'edit', reportId: report.id, report, measurements };
  }

  it('updates the existing report instead of creating a new one', async () => {
    const services = await testServices();
    const savedId = await services.reports.saveReport(
      reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }),
      [measurementInput({ analyteId: 'tsh', value: 5.07, valueText: '5,07' })],
    );
    const found = (await services.reports.getReport(savedId))!;
    const session: ImportSession = {
      mode: 'edit',
      reportId: savedId,
      report: found.report,
      measurements: found.measurements,
    };
    const { user } = await renderVerifyPage(services, session);

    const value = await screen.findByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '6,1');
    await user.click(screen.getByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      const updated = await services.reports.getReport(savedId);
      expect(updated?.measurements[0]?.value).toBe(6.1);
    });
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('keeps the measurement id stable across an edit that only changes its value', async () => {
    const services = await testServices();
    const savedId = await services.reports.saveReport(
      reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }),
      [measurementInput({ analyteId: 'tsh', value: 5.07, valueText: '5,07' })],
    );
    const found = (await services.reports.getReport(savedId))!;
    const originalId = found.measurements[0]?.id;
    expect(originalId).toEqual(expect.any(String));
    const session: ImportSession = {
      mode: 'edit',
      reportId: savedId,
      report: found.report,
      measurements: found.measurements,
    };
    const { user } = await renderVerifyPage(services, session);

    const value = await screen.findByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '6,1');
    await user.click(screen.getByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      const updated = await services.reports.getReport(savedId);
      expect(updated?.measurements[0]?.value).toBe(6.1);
    });
    const updated = await services.reports.getReport(savedId);
    expect(updated?.measurements[0]?.id).toBe(originalId);
  });

  it('does not warn about the report being edited even when its own date and lab match', async () => {
    const services = await testServices();
    const savedId = await services.reports.saveReport(
      reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }),
      [measurementInput()],
    );
    const found = (await services.reports.getReport(savedId))!;
    const session: ImportSession = {
      mode: 'edit',
      reportId: savedId,
      report: found.report,
      measurements: found.measurements,
    };
    const { user } = await renderVerifyPage(services, session);

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('still warns about a different report on the same date and lab', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);
    const editId = await services.reports.saveReport(
      reportInput({ sampleDate: '2022-08-21', lab: 'PROAVIS' }),
      [measurementInput()],
    );
    const found = (await services.reports.getReport(editId))!;
    const session: ImportSession = {
      mode: 'edit',
      reportId: editId,
      report: found.report,
      measurements: found.measurements,
    };
    const { user } = await renderVerifyPage(services, session);

    const dateField = await screen.findByLabelText(itText.verify.sampleDate);
    await user.clear(dateField);
    await user.type(dateField, '2022-08-20');
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('20 agosto 2022');
  });

  it('discard returns to the report detail page, unchanged', async () => {
    const services = await testServices();
    const savedId = await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      measurementInput(),
    ]);
    const found = (await services.reports.getReport(savedId))!;
    const session: ImportSession = {
      mode: 'edit',
      reportId: savedId,
      report: found.report,
      measurements: found.measurements,
    };
    render(
      <MemoryRouter initialEntries={['/import/verify']}>
        <ServicesProvider services={services}>
          <ImportSessionProvider initialSession={session}>
            <Routes>
              <Route path="/import/verify" element={<VerifyPage />} />
              <Route path="/reports/:id" element={<p>dettaglio referto</p>} />
            </Routes>
          </ImportSessionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Annulla' }));
    expect(await screen.findByText('dettaglio referto')).toBeInTheDocument();
  });

  it('confirms the saved edit on the report detail page', async () => {
    const services = await testServices();
    const savedId = await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      measurementInput(),
    ]);
    const found = (await services.reports.getReport(savedId))!;
    const session: ImportSession = {
      mode: 'edit',
      reportId: savedId,
      report: found.report,
      measurements: found.measurements,
    };
    render(
      <MemoryRouter initialEntries={['/import/verify']}>
        <ServicesProvider services={services}>
          <ImportSessionProvider initialSession={session}>
            <Routes>
              <Route path="/import/verify" element={<VerifyPage />} />
              <Route path="/reports/:id" element={<ReportDetailPage />} />
            </Routes>
          </ImportSessionProvider>
        </ServicesProvider>
      </MemoryRouter>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Salva referto' }));
    expect(await screen.findByRole('status')).toHaveTextContent(itText.detail.updated);
  });

  it('pre-fills fields and rows from the saved report', async () => {
    const services = await testServices();
    await renderVerifyPage(services, editSession());
    expect(await screen.findByLabelText(itText.verify.sampleDate)).toHaveValue('2022-08-20');
    expect(screen.getByLabelText(itText.verify.lab)).toHaveValue('PROAVIS');
    expect(screen.getByLabelText(itText.verify.notes)).toHaveValue('nota di prova');
    expect(await screen.findByRole('article', { name: 'TSH' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Tutti/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('VerifyPage — landmark and focus on arrival', () => {
  it('moves focus to its own main landmark on mount', async () => {
    const services = await testServices();
    await renderVerifyPage(services);
    const main = await screen.findByRole('main');
    expect(document.activeElement).toBe(main);
  });
});

describe('VerifyPage — duplicate check at save time', () => {
  let services: Services;

  beforeEach(async () => {
    services = await testServices();
  });

  it('warns and stores nothing on the first press when the same date and lab already exist', async () => {
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('4 ottobre 2021');
    expect(within(alert).getByRole('link', { name: 'Apri il referto' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Salva comunque' })).toBeInTheDocument();
    expect(await services.reports.listReports()).toHaveLength(1);
  });

  it('stores the report once the user chooses "Salva comunque"', async () => {
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));
    await user.click(await screen.findByRole('button', { name: 'Salva comunque' }));

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(2);
    });
  });

  it('saves straight away when the date differs from every stored report', async () => {
    await services.reports.saveReport(reportInput({ sampleDate: '2020-01-01', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(2);
    });
    expect(screen.queryByRole('button', { name: 'Salva comunque' })).not.toBeInTheDocument();
  });

  it('re-checks duplicates for the new date after the date field changes', async () => {
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-05', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));
    const firstAlert = await screen.findByRole('alert');
    expect(firstAlert).toHaveTextContent('4 ottobre 2021');

    const dateField = screen.getByLabelText(itText.verify.sampleDate);
    await user.clear(dateField);
    await user.type(dateField, '2021-10-05');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Salva comunque' })).not.toBeInTheDocument();
    });

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));
    const secondAlert = await screen.findByRole('alert');
    expect(secondAlert).toHaveTextContent('5 ottobre 2021');
    expect(await services.reports.listReports()).toHaveLength(2);
  });

  it('saves without warning once the date is changed to one not stored', async () => {
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-05', lab: 'PROAVIS' }), [
      measurementInput(),
    ]);

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));
    await screen.findByRole('alert');

    const dateField = screen.getByLabelText(itText.verify.sampleDate);
    await user.clear(dateField);
    await user.type(dateField, '2020-01-01');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Salva comunque' })).not.toBeInTheDocument();
    });

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(3);
    });
    expect(screen.queryByRole('button', { name: 'Salva comunque' })).not.toBeInTheDocument();
  });
});

describe('VerifyPage — save() error handling', () => {
  let services: Services;

  beforeEach(async () => {
    services = await testServices();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an inline alert and lets the user retry when saveReport rejects', async () => {
    const saveSpy = vi
      .spyOn(services.reports, 'saveReport')
      .mockRejectedValueOnce(new Error('boom'));

    const { user } = await renderVerifyPage(services);
    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Non sono riuscito a salvare il referto. I valori sono ancora qui: riprova.',
      );
    });
    expect(await screen.findByRole('button', { name: 'Salva referto' })).toBeEnabled();
    expect(await services.reports.listReports()).toEqual([]);
    expect(await services.customAnalytes.list()).toEqual([]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('double-clicking Salva referto stores exactly one report', async () => {
    const { user } = await renderVerifyPage(services);
    const button = await screen.findByRole('button', { name: 'Salva referto' });
    await user.click(button);
    await user.click(button);

    await vi.waitFor(async () => {
      expect(await services.reports.listReports()).toHaveLength(1);
    });
  });

  it('rolls back every custom analyte created in this attempt when a later create rejects', async () => {
    const { user } = await renderVerifyPage(services);
    await pickCustomAnalyteFor('Cristalli', user, 'Analita nuovo uno');
    await pickCustomAnalyteFor('Sideremia', user, 'Analita nuovo due');

    const originalCreate = services.customAnalytes.create.bind(services.customAnalytes);
    const createSpy = vi
      .spyOn(services.customAnalytes, 'create')
      .mockImplementationOnce(originalCreate)
      .mockRejectedValueOnce(new Error('boom'));

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Non sono riuscito a salvare il referto. I valori sono ancora qui: riprova.',
      );
    });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(await services.customAnalytes.list()).toEqual([]);
    expect(await services.reports.listReports()).toEqual([]);
  }, 15000);

  it('attempts every rollback removal even if one of them fails, and keeps the original error', async () => {
    const { user } = await renderVerifyPage(services);
    await pickCustomAnalyteFor('Cristalli', user, 'Analita nuovo uno');
    await pickCustomAnalyteFor('Sideremia', user, 'Analita nuovo due');

    vi.spyOn(services.reports, 'saveReport').mockRejectedValueOnce(new Error('boom'));
    const removeSpy = vi
      .spyOn(services.customAnalytes, 'remove')
      .mockRejectedValueOnce(new Error('remove failed'));

    await user.click(await screen.findByRole('button', { name: 'Salva referto' }));

    await vi.waitFor(async () => {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Non sono riuscito a salvare il referto. I valori sono ancora qui: riprova.',
      );
    });
    expect(removeSpy).toHaveBeenCalledTimes(2);
  }, 15000);
});
