// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ImportSessionProvider, useImportSession } from '../../src/ui/import/import-session';
import { ReportDetailPage } from '../../src/ui/pages/ReportDetailPage';
import { ReportsPage } from '../../src/ui/pages/ReportsPage';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

function SessionProbe() {
  const { session } = useImportSession();
  if (!session || session.mode !== 'edit') return <p>nessuna modifica in corso</p>;
  return (
    <p>
      modifica: {session.reportId}, {session.measurements.length} valori
    </p>
  );
}

function renderAt(path: string, services: Services) {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[path]}>
        <ImportSessionProvider>
          <Routes>
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
            <Route path="/import" element={<p>pagina di caricamento</p>} />
            <Route path="/import/verify" element={<SessionProbe />} />
            <Route path="/analytes/:ref" element={<p>pagina valore</p>} />
          </Routes>
        </ImportSessionProvider>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

async function seeded() {
  const services = await testServices();
  const id = await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
    measurementInput(),
    measurementInput({
      analyteId: 'rbc',
      value: 4960000,
      valueText: '4.960.000',
      unit: '/µL',
      refMin: 4500000,
      refMax: 5500000,
      refText: 'da 4.500.000 a 5.500.000',
      section: 'EMOCROMO',
    }),
    measurementInput({
      analyteId: 'urine-color',
      value: null,
      valueText: 'Paglierino',
      unit: null,
      refMin: null,
      refMax: null,
      refText: null,
      section: 'URINE',
    }),
  ]);
  await services.reports.saveReport(
    reportInput({ sampleDate: '2021-08-30', lab: 'AST Vallerosa', type: 'urine' }),
    [],
  );
  return { services, id };
}

describe('ReportsPage', () => {
  it('invites to load the first report when there is none', async () => {
    renderAt('/reports', await testServices());
    expect(await screen.findByText(/Nessun referto ancora/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Carica un referto' }));
    expect(screen.getByText('pagina di caricamento')).toBeInTheDocument();
  });

  it('lists reports newest first with their counts and filters them', async () => {
    const { services } = await seeded();
    renderAt('/reports', services);
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('20 ago 2022'),
      expect.stringContaining('30 ago 2021'),
    ]);
    expect(links[0]).toHaveTextContent('PROAVIS, 3 valori');
    expect(links[0]).toHaveTextContent('1 fuori range');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Urine' }));
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'AST Vallerosa' }));
    await user.click(screen.getByRole('button', { name: 'Sangue' }));
    expect(await screen.findByText('Nessun referto con questi filtri.')).toBeInTheDocument();
  });
});

describe('ReportDetailPage', () => {
  it('opens the analyte page from the name of a value', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    await userEvent.setup().click(await screen.findByRole('link', { name: 'TSH' }));
    expect(screen.getByText('pagina valore')).toBeInTheDocument();
  });

  it('groups values by category and words every state', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    expect(await screen.findByRole('heading', { name: '20 agosto 2022' })).toBeInTheDocument();

    const thyroid = screen.getByRole('region', { name: 'Tiroide' });
    expect(within(thyroid).getByText('TSH')).toBeInTheDocument();
    expect(within(thyroid).getByText('5,07')).toBeInTheDocument();
    expect(within(thyroid).getByText('sopra')).toBeInTheDocument();

    const blood = screen.getByRole('region', { name: 'Ematologia' });
    expect(within(blood).getByText('4.960.000')).toBeInTheDocument();
    expect(within(blood).queryByText('sopra')).not.toBeInTheDocument();

    const urine = screen.getByRole('region', { name: 'Urine' });
    expect(within(urine).getByText('Paglierino')).toBeInTheDocument();
    expect(within(urine).getByText('senza range')).toBeInTheDocument();
  });

  it('deletes only after a second, explicit confirmation', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina referto' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminare questo referto?' });
    await user.click(within(dialog).getByRole('button', { name: 'Annulla' }));
    expect(await services.reports.getReport(id)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Elimina referto' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Elimina referto' }),
    );
    expect(await screen.findByRole('heading', { name: 'Referti' })).toBeInTheDocument();
    expect(await services.reports.getReport(id)).toBeUndefined();
  });

  it('behaves like a modal dialog: aria-modal, Tab trap, Escape cancels and returns focus', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: 'Elimina referto' });
    await user.click(trigger);

    const dialog = screen.getByRole('alertdialog', { name: 'Eliminare questo referto?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const buttons = within(dialog).getAllByRole('button');
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;
    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elimina referto' }));
    expect(await services.reports.getReport(id)).toBeDefined();
  });

  it('shows an inline message and keeps the report when deleteReport rejects', async () => {
    const { services, id } = await seeded();
    vi.spyOn(services.reports, 'deleteReport').mockRejectedValueOnce(new Error('boom'));
    renderAt(`/reports/${id}`, services);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Elimina referto' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Elimina referto' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a eliminare il referto. Riprova.',
    );
    expect(await services.reports.getReport(id)).toBeDefined();
    expect(screen.getByRole('heading', { name: '20 agosto 2022' })).toBeInTheDocument();
  });

  it('says so when the report no longer exists', async () => {
    renderAt('/reports/missing', await testServices());
    expect(await screen.findByText('Questo referto non esiste più.')).toBeInTheDocument();
  });

  it('shows the new values when the report changes while the page is open', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    expect(await screen.findByRole('heading', { name: '20 agosto 2022' })).toBeInTheDocument();
    const found = (await services.reports.getReport(id))!;
    await services.reports.updateReport(
      id,
      { ...found.report, sampleDate: '2022-09-02' },
      found.measurements,
    );
    expect(await screen.findByRole('heading', { name: '2 settembre 2022' })).toBeInTheDocument();
  });

  it('opens the verification page pre-filled for editing', async () => {
    const { services, id } = await seeded();
    renderAt(`/reports/${id}`, services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Modifica referto' }));
    expect(await screen.findByText(`modifica: ${id}, 3 valori`)).toBeInTheDocument();
  });
});
