// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { AnalyteRoute, AnalytePage } from '../../src/ui/pages/AnalytePage';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';
import { saveChartImage } from '../../src/ui/chart/save-png';

vi.mock('../../src/ui/chart/save-png', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/ui/chart/save-png')>()),
  saveChartImage: vi.fn(),
}));

function renderAt(entries: string[], services: Services) {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/analytes/:ref" element={<AnalytePage />} />
          <Route path="/reports" element={<p>lista referti</p>} />
          <Route path="/reports/:id" element={<p>dettaglio referto</p>} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

async function withTsh(services: Services) {
  for (const [date, value] of [
    ['2021-07-10', 5.48],
    ['2021-10-04', 5.31],
    ['2022-08-20', 5.07],
  ] as const) {
    await services.reports.saveReport(reportInput({ sampleDate: date }), [
      measurementInput({ value, valueText: String(value).replace('.', ',') }),
    ]);
  }
}

const glucose = (value: number, unit: string, refMin: number, refMax: number) =>
  measurementInput({
    analyteId: 'glucose',
    value,
    valueText: String(value).replace('.', ','),
    unit,
    refMin,
    refMax,
    refText: null,
  });

describe('AnalytePage', () => {
  it('saves the chart as an image named after the analyte and the latest date', async () => {
    vi.mocked(saveChartImage).mockResolvedValue('downloaded');
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Salva immagine' }));
    expect(saveChartImage).toHaveBeenCalledWith(
      {
        title: 'TSH',
        subtitle: 'µUI/mL · luglio 2021 – agosto 2022',
        points: expect.arrayContaining([expect.objectContaining({ value: 5.07 })]),
      },
      'bloodio-tsh-2022-08-20.png',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the image cannot be made', async () => {
    vi.mocked(saveChartImage).mockRejectedValue(new Error('canvas'));
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Salva immagine' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a creare l’immagine. Riprova.',
    );
  });

  it('ignores a second press while saving and keeps the keyboard focus on the button', async () => {
    vi.mocked(saveChartImage).mockClear();
    vi.mocked(saveChartImage).mockReturnValue(new Promise(() => {}));
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Salva immagine' });
    await user.click(button);
    await user.click(button);
    expect(saveChartImage).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveFocus();
  });

  it('offers no image without a chart', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [measurementInput()]);
    renderAt(['/analytes/tsh'], services);
    await screen.findByText('Il grafico compare dal secondo referto.');
    expect(screen.queryByRole('button', { name: 'Salva immagine' })).not.toBeInTheDocument();
  });

  it('shows the latest value, the chart and the history newest first', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);

    expect(await screen.findByRole('heading', { level: 1, name: 'TSH' })).toBeInTheDocument();
    expect(screen.getByText('Tiroide')).toBeInTheDocument();
    expect(screen.getByText('20 agosto 2022, PROAVIS')).toBeInTheDocument();
    expect(screen.getByText('sopra')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'TSH da luglio 2021 ad agosto 2022: 3 misure, 3 sopra il range stampato, da 5,48 a 5,07 µUI/mL.',
      }),
    ).toBeInTheDocument();

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]!.textContent)).toEqual([
      '20 ago 2022, fuori range',
      '4 ott 2021, fuori range',
      '10 lug 2021, fuori range',
    ]);
    expect(within(rows[0]!).getByText('5,07')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('0,27 – 4,2')).toBeInTheDocument();
  });

  it('switches unit with a chip, converts the values and remembers the choice', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
      glucose(5, 'mmol/L', 3.9, 6.1),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      glucose(99, 'mg/dL', 70, 110),
    ]);
    renderAt(['/analytes/glucose'], services);
    const user = userEvent.setup();

    const mmol = await screen.findByRole('button', { name: 'mmol/L' });
    expect(screen.getByRole('button', { name: 'mg/dL' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(mmol);

    expect(await screen.findByRole('button', { name: 'mmol/L' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const firstRow = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(within(firstRow).getByText('5,5')).toBeInTheDocument();
    await vi.waitFor(async () =>
      expect(await services.settings.get('preferredUnits')).toEqual({ glucose: 'mmol/L' }),
    );
  });

  it('still switches unit, and says so, when the preference cannot be saved', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      glucose(99, 'mg/dL', 70, 110),
    ]);
    const failing: Services = {
      ...services,
      settings: { ...services.settings, set: () => Promise.reject(new Error('quota')) },
    };
    renderAt(['/analytes/glucose'], failing);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'mmol/L' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a ricordare questa unità',
    );
    expect(screen.getByRole('button', { name: 'mmol/L' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps unconvertible values out of the chart and says where they are', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2021-08-30' }), [
      glucose(0.9, 'g/L', 0.7, 1.1),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
      glucose(87, 'mg/dL', 70, 110),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      glucose(99, 'mg/dL', 70, 110),
    ]);
    renderAt(['/analytes/glucose'], services);

    expect(
      await screen.findByText(
        '1 valore è in un’unità che non posso convertire in mg/dL: lo trovi nella tabella.',
      ),
    ).toBeInTheDocument();
    const lastRow = within(screen.getByRole('table')).getAllByRole('row').at(-1)!;
    expect(within(lastRow).getByText('0,9')).toBeInTheDocument();
    expect(within(lastRow).getByText('g/L')).toBeInTheDocument();
  });

  it('waits for a second report before drawing a chart', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput(), [measurementInput()]);
    renderAt(['/analytes/tsh'], services);
    expect(await screen.findByText('Il grafico compare dal secondo referto.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows a qualitative value as text, with no chart and no unit chips', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ type: 'urine' }), [
      measurementInput({
        analyteId: 'urine-color',
        value: null,
        valueText: 'Paglierino',
        unit: null,
        refMin: null,
        refMax: null,
        refText: null,
      }),
    ]);
    renderAt(['/analytes/urine-color'], services);
    expect(await screen.findAllByText('Paglierino')).not.toHaveLength(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Unità' })).not.toBeInTheDocument();
  });

  it('names a custom analyte from its record', async () => {
    const services = await testServices();
    const custom = await services.customAnalytes.create({
      name: 'Omocisteina',
      unit: 'µmol/L',
      category: 'altro',
      specimen: 'blood',
      kind: 'numeric',
    });
    await services.reports.saveReport(reportInput(), [
      measurementInput({ analyteId: null, customAnalyteId: custom.id, value: 9, unit: 'µmol/L' }),
    ]);
    renderAt([`/analytes/${encodeURIComponent(`custom:${custom.id}`)}`], services);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Omocisteina' }),
    ).toBeInTheDocument();
  });

  it('says so when there is nothing for this analyte, and links to the reports', async () => {
    renderAt(['/analytes/ldl'], await testServices());
    expect(await screen.findByText('Nessun valore per questa voce.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Vai ai referti' }));
    expect(screen.getByText('lista referti')).toBeInTheDocument();
  });

  it('opens a report from the date in the history', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    await userEvent.setup().click(await screen.findByRole('link', { name: '20 ago 2022' }));
    expect(screen.getByText('dettaglio referto')).toBeInTheDocument();
  });

  it('goes back where it came from, or to the reports when opened directly', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/reports/x', '/analytes/tsh'], services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Indietro' }));
    expect(screen.getByText('dettaglio referto')).toBeInTheDocument();
  });

  it('goes to the reports when there is no page to go back to', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Indietro' }));
    expect(screen.getByText('lista referti')).toBeInTheDocument();
  });

  it('updates when a report changes while the page is open', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    await screen.findByRole('table');
    await services.reports.saveReport(reportInput({ sampleDate: '2022-10-01' }), [
      measurementInput({ value: 4.1, valueText: '4,1' }),
    ]);
    expect(await screen.findByText('1 ottobre 2022, PROAVIS')).toBeInTheDocument();
  });

  it('says so when the values cannot be read', async () => {
    const services = await testServices();
    const failing: Services = {
      ...services,
      reports: { ...services.reports, listSeries: () => Promise.reject(new Error('db')) },
    };
    renderAt(['/analytes/tsh'], failing);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a leggere i valori. Riprova.',
    );
  });

  it('does not label a unitless latest value with the display unit', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      { ...glucose(5.2, 'mmol/L', 3.9, 6.1), unit: null },
    ]);
    await services.settings.set('preferredUnits', { glucose: 'mmol/L' });
    renderAt(['/analytes/glucose'], services);
    const big = (
      await screen.findByRole('heading', { level: 1, name: 'Glicemia' })
    ).parentElement!.querySelector('p.display')!;
    expect(big.textContent).toBe('5,2');
  });

  it('words the excluded note without a unit when the display unit is none', async () => {
    const services = await testServices();
    await services.reports.saveReport(reportInput({ sampleDate: '2022-01-10' }), [
      glucose(90, 'mg/dL', 70, 110),
    ]);
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      { ...glucose(5.2, 'mmol/L', 3.9, 6.1), unit: null },
    ]);
    renderAt(['/analytes/glucose'], services);
    expect(
      await screen.findByText(
        '1 valore ha un’unità diversa da quella degli altri: lo trovi nella tabella.',
      ),
    ).toBeInTheDocument();
  });

  it('resets when the analyte in the address changes', async () => {
    const services = await testServices();
    await withTsh(services);
    await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      glucose(99, 'mg/dL', 70, 110),
    ]);
    function Nav() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => navigate('/analytes/glucose')}>
          vai
        </button>
      );
    }
    render(
      <ServicesProvider services={services}>
        <MemoryRouter initialEntries={['/analytes/tsh']}>
          <Nav />
          <Routes>
            <Route path="/analytes/:ref" element={<AnalyteRoute />} />
          </Routes>
        </MemoryRouter>
      </ServicesProvider>,
    );
    await screen.findByRole('heading', { level: 1, name: 'TSH' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'vai' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Glicemia' })).toBeInTheDocument();
    expect(screen.queryByText('TSH')).not.toBeInTheDocument();
    expect(screen.queryByText(/5,07/)).not.toBeInTheDocument();
  });

  it('opens a report from a point of the chart', async () => {
    const services = await testServices();
    await withTsh(services);
    renderAt(['/analytes/tsh'], services);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: '20 ago 2022: 5,07 µUI/mL, sopra il range stampato',
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Apri il referto' }));
    expect(screen.getByText('dettaglio referto')).toBeInTheDocument();
  });
});
