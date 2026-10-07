// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ValuesPage } from '../../src/ui/pages/ValuesPage';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

function Probe() {
  return <div data-testid="search">{useLocation().search}</div>;
}

function EntryStub() {
  const navigate = useNavigate();
  return (
    <>
      <p>pagina valore</p>
      <button onClick={() => navigate(-1)}>indietro</button>
    </>
  );
}

function renderValues(services: Services, entry = '/analytes') {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/analytes" element={<ValuesPage />} />
          <Route path="/analytes/:ref" element={<EntryStub />} />
          <Route path="/import" element={<p>pagina di caricamento</p>} />
        </Routes>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

async function seeded() {
  const services = await testServices();
  await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
    measurementInput({ value: 5.31, valueText: '5,31' }),
    measurementInput({
      analyteId: 'glucose',
      value: 95,
      valueText: '95',
      unit: 'mg/dL',
      refMin: 70,
      refMax: 110,
      refText: 'da 70 a 110',
    }),
  ]);
  await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
    measurementInput({ value: 5.07, valueText: '5,07' }),
    measurementInput({
      analyteId: 'rbc',
      value: 4960000,
      valueText: '4.960.000',
      unit: '/µL',
      refMin: 4500000,
      refMax: 5500000,
      refText: 'da 4.500.000 a 5.500.000',
    }),
  ]);
  return services;
}

describe('ValuesPage', () => {
  it('lists every entry with data, by category, with its latest value', async () => {
    renderValues(await seeded());
    expect(await screen.findByRole('heading', { level: 1, name: 'Valori' })).toBeInTheDocument();
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'values-ematologia',
      'values-tiroide',
      'values-glicemia',
    ]);
    const tsh = within(screen.getByRole('region', { name: 'Tiroide' })).getByRole('link', {
      name: /^TSH/,
    });
    expect(within(tsh).getByText('5,07')).toBeInTheDocument();
    expect(within(tsh).getByText('sopra')).toBeInTheDocument();
    expect(within(tsh).getByText('20 ago 2022')).toBeInTheDocument();
    expect(tsh).toHaveAccessibleName(/5,07 µUI\/mL/);
  });

  it('starts from the search in the URL and keeps it when coming back from an entry', async () => {
    renderValues(await seeded(), '/analytes?q=glucosio');
    const user = userEvent.setup();
    expect(await screen.findByLabelText('Cerca')).toHaveValue('glucosio');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    await user.click(screen.getByRole('link', { name: /^Glicemia/ }));
    await user.click(screen.getByRole('button', { name: 'indietro' }));
    expect(await screen.findByLabelText('Cerca')).toHaveValue('glucosio');
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('writes the search to the URL and removes it when cleared', async () => {
    renderValues(await seeded());
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Cerca'), 'tsh');
    expect(screen.getByTestId('search')).toHaveTextContent('?q=tsh');
    await user.clear(screen.getByLabelText('Cerca'));
    expect(screen.getByTestId('search')).toBeEmptyDOMElement();
  });

  it('filters by name or alternative name as you type', async () => {
    renderValues(await seeded());
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Cerca'), 'glucosio');
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /^Glicemia/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Cerca'));
    await user.type(screen.getByLabelText('Cerca'), 'zzz');
    expect(screen.getByRole('status')).toHaveTextContent('Nessuna voce con questo nome.');
  });

  it('opens the page of an entry', async () => {
    renderValues(await seeded());
    await userEvent.setup().click(await screen.findByRole('link', { name: /^TSH/ }));
    expect(screen.getByText('pagina valore')).toBeInTheDocument();
  });

  it('invites to load a report when there is no value yet', async () => {
    renderValues(await testServices());
    expect(
      await screen.findByText(
        'Nessun valore ancora. Carica un referto per seguire i tuoi valori nel tempo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Cerca')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Carica un referto' }));
    expect(screen.getByText('pagina di caricamento')).toBeInTheDocument();
  });

  it('says so when the values cannot be read', async () => {
    const services = await testServices();
    renderValues({
      ...services,
      reports: {
        ...services.reports,
        listLatestPerAnalyte: () => Promise.reject(new Error('db')),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a leggere i valori. Riprova.',
    );
  });

  it('updates when a report is saved while the page is open', async () => {
    const services = await seeded();
    renderValues(services);
    await screen.findByRole('region', { name: 'Tiroide' });
    await services.reports.saveReport(reportInput({ sampleDate: '2022-10-01' }), [
      measurementInput({
        analyteId: 'ft4',
        value: 1.3,
        valueText: '1,3',
        unit: 'ng/dL',
        refMin: 0.93,
        refMax: 1.7,
      }),
    ]);
    expect(await screen.findByRole('link', { name: /^FT4/ })).toBeInTheDocument();
  });

  it('shows a qualitative latest value as text, without a rail', async () => {
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
    renderValues(services);
    const link = await screen.findByRole('link', { name: /Paglierino/ });
    expect(link.querySelector('[aria-hidden="true"][class*="rail"]')).toBeNull();
  });
});
