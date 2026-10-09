// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snoozeUntil } from '../../src/ui/app/backup-state';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { HomePage } from '../../src/ui/pages/HomePage';
import { deliverFile } from '../../src/ui/share/deliver-file';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

vi.mock('../../src/ui/share/deliver-file', () => ({ deliverFile: vi.fn() }));

const TODAY = new Date(2022, 8, 30, 10);
const REMINDER = 'Ci sono dati non ancora esportati.';

beforeEach(() => {
  vi.mocked(deliverFile).mockReset();
  // Only Date: real timers keep Testing Library and fake-indexeddb working.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderHome(services: Services) {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reports" element={<p>lista referti</p>} />
          <Route path="/reports/:id" element={<p>dettaglio referto</p>} />
          <Route path="/analytes" element={<p>lista valori</p>} />
          <Route path="/analytes/:ref" element={<p>pagina valore</p>} />
          <Route path="/import" element={<p>pagina di caricamento</p>} />
          <Route path="/settings" element={<p>impostazioni</p>} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

const glucose = (value: number) =>
  measurementInput({
    analyteId: 'glucose',
    value,
    valueText: String(value),
    unit: 'mg/dL',
    refMin: 70,
    refMax: 110,
    refText: 'da 70 a 110',
  });

/** Three reports: one past twelve months, one within, and the latest. Never exported. */
async function seeded() {
  const services = await testServices();
  await services.reports.saveReport(reportInput({ sampleDate: '2020-03-01' }), [
    measurementInput({
      analyteId: 'ft4',
      value: 2.5,
      valueText: '2,5',
      unit: 'ng/dL',
      refMin: 0.9,
      refMax: 1.7,
      refText: 'da 0,9 a 1,7',
    }),
  ]);
  await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
    measurementInput({ value: 5.31, valueText: '5,31' }),
    glucose(91),
    measurementInput({
      analyteId: 'hemoglobin',
      value: 11,
      valueText: '11',
      unit: 'g/dL',
      refMin: 13,
      refMax: 17,
      refText: 'da 13 a 17',
    }),
  ]);
  await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
    measurementInput(), // TSH 5,07 over 4,20
    glucose(105), // rising, close to 110
  ]);
  return services;
}

describe('HomePage', () => {
  it('invites to load a first report when there is none', async () => {
    renderHome(await testServices());
    expect(await screen.findByText(/^Nessun referto ancora/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Carica un referto' })).toHaveAttribute(
      'href',
      '/import',
    );
    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument();
  });

  it('sums up the latest report on the slab, which opens it', async () => {
    renderHome(await seeded());
    const slab = await screen.findByRole('link', {
      name: 'Ultimo referto, 20 agosto 2022, PROAVIS, 1 valore fuori range',
    });
    expect(
      within(slab).getByText('1 valore fuori dal range stampato, 1 dentro.'),
    ).toBeInTheDocument();
    expect(await screen.findByText(REMINDER)).toBeInTheDocument();
    // Shown while the files are being counted, gone once the count says there are none.
    await vi.waitFor(() =>
      expect(screen.queryByText(/I file originali non sono inclusi/)).toBeNull(),
    );
    await userEvent.setup().click(slab);
    expect(await screen.findByText('dettaglio referto')).toBeInTheDocument();
  });

  it('mentions values that cannot be evaluated only when there are some', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [
      measurementInput(),
      glucose(90),
      measurementInput({
        analyteId: 'ft4',
        value: 1.18,
        valueText: '1,18',
        unit: 'ng/dL',
        refMin: null,
        refMax: null,
        refText: null,
      }),
    ]);
    renderHome(services);
    expect(
      await screen.findByText('1 valore fuori dal range stampato, 1 dentro, 1 non valutabile.'),
    ).toBeInTheDocument();
  });

  it('counts several values out of range in the plural', async () => {
    const services = await testServices();
    const noRange = {
      refMin: null,
      refMax: null,
      refText: null,
    };
    await services.reports.saveReport(reportInput(), [
      measurementInput(),
      measurementInput({
        analyteId: 'ft4',
        value: 2.5,
        valueText: '2,5',
        unit: 'ng/dL',
        refMin: 0.9,
        refMax: 1.7,
        refText: 'da 0,9 a 1,7',
      }),
      measurementInput({
        analyteId: 'glucose',
        value: 90,
        valueText: '90',
        unit: 'mg/dL',
        ...noRange,
      }),
      measurementInput({
        analyteId: 'hemoglobin',
        value: 14,
        valueText: '14',
        unit: 'g/dL',
        ...noRange,
      }),
    ]);
    renderHome(services);
    const slab = await screen.findByRole('link', {
      name: 'Ultimo referto, 20 agosto 2022, PROAVIS, 2 valori fuori range',
    });
    expect(
      within(slab).getByText('2 valori fuori dal range stampato, 0 dentro, 2 non valutabili.'),
    ).toBeInTheDocument();
  });

  it('lists values out of range: latest report, then older ones, then a count of the oldest', async () => {
    renderHome(await seeded());
    const out = await screen.findByRole('region', { name: 'Fuori range' });
    const links = within(out).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^TSH/);
    expect(links[1]).toHaveAccessibleName(/^Emoglobina/);
    expect(links[2]).toHaveTextContent('Più vecchi di 12 mesi: 1 valore');
    expect(links[2]).toHaveAttribute('href', '/analytes');
    expect(within(out).getByRole('heading', { name: 'Da referti precedenti' })).toBeInTheDocument();
  });

  it('lists "da tenere d’occhio" with the direction', async () => {
    renderHome(await seeded());
    const watch = await screen.findByRole('region', { name: 'Da tenere d’occhio' });
    expect(within(watch).getByText('vicino al limite del range stampato')).toBeInTheDocument();
    expect(
      within(watch).getByRole('link', { name: /^Glicemia.*vicino al limite, in salita/ }),
    ).toBeInTheDocument();
    expect(
      within(watch).queryByRole('heading', { name: 'Da referti precedenti' }),
    ).not.toBeInTheDocument();
  });

  it('hides a section with nothing in it', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [glucose(90)]);
    renderHome(services);
    expect(await screen.findByRole('link', { name: /^Ultimo referto/ })).toBeInTheDocument();
    expect(screen.getByText('0 valori fuori dal range stampato, 1 dentro.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Fuori range' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Da tenere d’occhio' })).not.toBeInTheDocument();
  });

  it('shows the three latest reports and a link to all of them', async () => {
    renderHome(await seeded());
    const recent = await screen.findByRole('region', { name: 'Ultimi referti' });
    expect(
      within(recent)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      '20 ago 2022PROAVIS, 2 valori',
      '4 ott 2021PROAVIS, 3 valori',
      '1 mar 2020PROAVIS, 1 valore',
      'Tutti i referti',
    ]);
  });
});

describe('HomePage: backup reminder', () => {
  it('exports from the Home without the originals and goes away once the file is delivered', async () => {
    vi.mocked(deliverFile).mockResolvedValue('downloaded');
    const services = await seeded();
    const exportAll = vi.fn(services.backup.exportAll);
    renderHome({ ...services, backup: { ...services.backup, exportAll } });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta ora' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    expect(exportAll).toHaveBeenCalledWith({ includeAttachments: false });
    const [blob] = vi.mocked(deliverFile).mock.calls[0]!;
    const file = JSON.parse(await blob.text()) as { data: { attachments?: unknown[] } };
    expect(file.data.attachments ?? []).toEqual([]);
    await vi.waitFor(() => expect(screen.queryByText(REMINDER)).not.toBeInTheDocument());
    expect(await services.settings.get('lastExportAt')).not.toBeNull();
  });

  it('stays when the share sheet is dismissed', async () => {
    vi.mocked(deliverFile).mockResolvedValue('cancelled');
    const services = await seeded();
    renderHome(services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta ora' }));
    await vi.waitFor(() => expect(deliverFile).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Esporta ora' })).not.toHaveAttribute(
        'aria-disabled',
      ),
    );
    expect(screen.getByText(REMINDER)).toBeInTheDocument();
    expect(await services.settings.get('lastExportAt')).toBeNull();
  });

  it('waits 30 days after "Più tardi"', async () => {
    const services = await seeded();
    renderHome(services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Più tardi' }));
    await vi.waitFor(() => expect(screen.queryByText(REMINDER)).not.toBeInTheDocument());
    expect(await services.settings.get('backupReminderSnoozedUntil')).toBe(snoozeUntil(TODAY));
  });

  it('does not show up when the last export is recent, even with new data', async () => {
    const services = await seeded();
    await services.settings.set('lastExportAt', new Date(2022, 7, 23).toISOString());
    renderHome(services);
    expect(await screen.findByRole('link', { name: /^Ultimo referto/ })).toBeInTheDocument();
    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument();
  });

  it('says the original files are left out, when there are some', async () => {
    const services = await seeded();
    renderHome({
      ...services,
      reports: {
        ...services.reports,
        attachmentSummary: () => Promise.resolve({ count: 2, bytes: 2048 }),
      },
    });
    expect(await screen.findByText(/I file originali non sono inclusi\./)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Per includerli esporta da Impostazioni.' }),
    ).toHaveAttribute('href', '/settings');
  });

  it('says the original files may be left out when they cannot be counted', async () => {
    const services = await seeded();
    renderHome({
      ...services,
      reports: {
        ...services.reports,
        attachmentSummary: () => Promise.reject(new Error('blocked')),
      },
    });
    await screen.findByText(REMINDER);
    await vi.waitFor(() =>
      expect(screen.getByText(/I file originali non sono inclusi\./)).toBeInTheDocument(),
    );
  });

  it('says so when the export fails, and stays', async () => {
    const services = await seeded();
    renderHome({
      ...services,
      backup: { ...services.backup, exportAll: () => Promise.reject(new Error('quota')) },
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Esporta ora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a esportare i dati. Riprova.',
    );
    expect(screen.getByText(REMINDER)).toBeInTheDocument();
  });
});
