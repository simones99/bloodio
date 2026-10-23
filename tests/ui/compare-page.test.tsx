// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ComparePage } from '../../src/ui/pages/ComparePage';
import { measurementInput, reportInput } from '../storage/helpers';
import { testServices } from './fake-services';
import './setup-dom';

/** Where the router is, and how it got there (PUSH, REPLACE). */
function Where() {
  const location = useLocation();
  const type = useNavigationType();
  return <p data-testid="where">{`${type} ${location.pathname}${location.search}`}</p>;
}

function renderAt(search: string, services: Services, from?: string) {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter
        initialEntries={[{ pathname: '/compare', search, state: from ? { from } : null }]}
      >
        <Routes>
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/reports" element={<p>lista referti</p>} />
          <Route path="/reports/:id" element={<p>dettaglio referto</p>} />
          <Route path="/analytes/:ref" element={<p>pagina valore</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </ServicesProvider>,
  );
}

const tsh = (value: number, valueText: string) => measurementInput({ value, valueText });
const glucose = (value: number) =>
  measurementInput({
    analyteId: 'glucose',
    value,
    valueText: String(value),
    unit: 'mg/dL',
    refMin: 70,
    refMax: 100,
    refText: 'da 70 a 100',
    section: null,
  });
const ft4 = () =>
  measurementInput({
    analyteId: 'ft4',
    value: 1.56,
    valueText: '1,56',
    unit: 'ng/dL',
    refMin: 0.93,
    refMax: 1.7,
    refText: 'da 0,93 a 1,70',
  });
const rbc = () =>
  measurementInput({
    analyteId: 'rbc',
    value: 4220000,
    valueText: '4.220.000',
    unit: '/µL',
    refMin: 4500000,
    refMax: 5500000,
    refText: 'da 4.500.000 a 5.500.000',
    section: 'EMOCROMO',
  });

/** "Cambia referto", once the sheet's data has arrived and it can be used. */
async function changeButton() {
  const button = await screen.findByRole('button', { name: 'Cambia referto' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

async function seeded() {
  const services = await testServices();
  const december = await services.reports.saveReport(reportInput({ sampleDate: '2021-10-04' }), [
    tsh(5.31, '5,31'),
    glucose(92),
    ft4(),
  ]);
  const april = await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
    tsh(5.07, '5,07'),
    glucose(104),
    rbc(),
  ]);
  const may = await services.reports.saveReport(reportInput({ sampleDate: '2021-07-10' }), [
    tsh(5.48, '5,48'),
  ]);
  return { services, december, april, may };
}

describe('ComparePage', () => {
  it('puts the older report first and the changes of side on top', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${april}&b=${december}`, services, april);

    expect(await screen.findByRole('heading', { level: 1, name: 'Confronto' })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('listitem');
    expect(first).toHaveTextContent('Prima: 4 ottobre 2021');
    expect(second).toHaveTextContent('Dopo: 20 agosto 2022');
    expect(screen.getByText('2 voci in comune · 2 in un solo referto')).toBeInTheDocument();

    const changed = screen.getByRole('region', { name: 'Cambiati rispetto al range' });
    expect(
      within(changed).getByText('Glicemia, da 92 a 104 mg/dL, ora sopra il range, più 12, più 13%'),
    ).toBeInTheDocument();
    const thyroid = screen.getByRole('region', { name: 'Tiroide' });
    expect(
      within(thyroid).getByText('TSH, da 5,31 a 5,07 µUI/mL, meno 0,24, meno 5%'),
    ).toBeInTheDocument();
    expect(
      within(thyroid).getByText('FT4, 1,56 ng/dL, solo nel referto del 4 ott 2021'),
    ).toBeInTheDocument();
    // An entry of the older report only reads as an older value, in grey like "92" in "92 → 104".
    expect(within(thyroid).getByText('1,56')).toHaveClass('old');
    expect(within(changed).getByText('92')).toHaveClass('old');
    expect(screen.getByRole('region', { name: 'Ematologia' })).toHaveTextContent(
      'solo nel referto del 20 ago 2022',
    );
  });

  it('goes back to the report it was opened from, or to the list', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services, april);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Referto del 20 agosto 2022' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/reports/${april}`);
  });

  it('goes back to the list when opened from a plain address', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services);
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Referti' }));
    expect(screen.getByText('lista referti')).toBeInTheDocument();
  });

  it('hides the entries of only one report with "Solo in comune"', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services, april);
    const user = userEvent.setup();
    const toggle = await screen.findByRole('button', { name: 'Solo in comune' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/solo nel referto del/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Ematologia' })).toBeNull();
  });

  it('changes the other report from the sheet, replacing the address', async () => {
    const { services, december, april, may } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services, april);
    const user = userEvent.setup();
    await user.click(await changeButton());
    const dialog = screen.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' });
    expect(within(dialog).getByRole('radio', { name: /4 ottobre 2021/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: /10 luglio 2021/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confronta' }));

    await waitFor(() =>
      expect(
        screen.getByText('TSH, da 5,48 a 5,07 µUI/mL, meno 0,41, meno 7%'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('where')).toHaveTextContent(`REPLACE /compare?a=${may}&b=${april}`);
    expect(screen.getByRole('link', { name: 'Referto del 20 agosto 2022' })).toBeInTheDocument();
  });

  it('closes the sheet with Escape and gives focus back', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services, april);
    const user = userEvent.setup();
    const change = await changeButton();
    await user.click(change);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(change).toHaveFocus();
  });

  it('says when the two reports have no entry in common and none changed side', async () => {
    const services = await testServices();
    const march = await services.reports.saveReport(reportInput({ sampleDate: '2026-03-02' }), [
      glucose(92),
    ]);
    const april = await services.reports.saveReport(reportInput({ sampleDate: '2022-08-20' }), [
      tsh(5.07, '5,07'),
    ]);
    renderAt(`?a=${march}&b=${april}`, services, april);

    expect(await screen.findByText('Nessuna voce in comune')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cambiati rispetto al range' })).toHaveTextContent(
      'Nessuna voce è entrata o uscita dal range.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Solo in comune' }));
    expect(screen.getByText('Nessuna voce in comune tra questi due referti.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Glicemia' })).toBeNull();
  });

  it('says so when the reports cannot be read', async () => {
    const services = await testServices();
    services.reports.getReport = () => Promise.reject(new Error('disk'));
    renderAt('?a=x&b=y', services);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Non sono riuscito a leggere i referti. Riprova.',
    );
  });

  it('shows the comparison when only the list for the sheet cannot be read', async () => {
    const { services, december, april } = await seeded();
    const failing = vi
      .spyOn(services.reports, 'listEntryRefsByReport')
      .mockRejectedValue(new Error('disk'));
    renderAt(`?a=${december}&b=${april}`, services, april);
    expect(
      await screen.findByText('TSH, da 5,31 a 5,07 µUI/mL, meno 0,24, meno 5%'),
    ).toBeInTheDocument();
    await waitFor(() => expect(failing).toHaveBeenCalled());
    // Let the rejection reach the page, so what follows is the failed state, not the loading one.
    await act(async () => {
      await (failing.mock.results[0]!.value as Promise<unknown>).catch(() => {});
    });
    expect(screen.getByRole('button', { name: 'Cambia referto' })).toBeDisabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers the list of reports when two equal reports cannot be changed', async () => {
    const { services, april } = await seeded();
    const failing = vi
      .spyOn(services.reports, 'listEntryRefsByReport')
      .mockRejectedValue(new Error('disk'));
    renderAt(`?a=${april}&b=${april}`, services);
    expect(await screen.findByText('Scegli due referti diversi.')).toBeInTheDocument();
    await waitFor(() => expect(failing).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Vai ai referti' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Cambia referto' })).toBeDisabled();
  });

  it('says so when a report is missing from the address', async () => {
    const { services, april } = await seeded();
    renderAt(`?a=${april}`, services);
    expect(await screen.findByText(/Questo confronto non è più disponibile/)).toBeInTheDocument();
  });

  it('keeps the newer report in the sheet when opened from a plain address', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${april}&b=${december}`, services);
    await userEvent.setup().click(await changeButton());
    const dialog = screen.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' });
    expect(within(dialog).getByRole('radio', { name: /4 ottobre 2021/ })).toBeChecked();
  });

  it('says so when a report is missing', async () => {
    const { services, april } = await seeded();
    renderAt(`?a=${april}&b=nope`, services);
    expect(await screen.findByText(/Questo confronto non è più disponibile/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vai ai referti' })).toBeInTheDocument();
  });

  it('asks for two different reports when both are the same', async () => {
    const { services, april } = await seeded();
    renderAt(`?a=${april}&b=${april}`, services);
    expect(await screen.findByText('Scegli due referti diversi.')).toBeInTheDocument();
    await userEvent.setup().click(await changeButton());
    expect(
      screen.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' }),
    ).toBeInTheDocument();
  });

  it('gives focus to "Cambia referto" once the chosen comparison is on screen', async () => {
    const { services, april } = await seeded();
    renderAt(`?a=${april}&b=${april}`, services);
    const user = userEvent.setup();
    await user.click(await changeButton());
    const dialog = screen.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' });
    await user.click(within(dialog).getByRole('radio', { name: /4 ottobre 2021/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confronta' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Confronto' })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cambia referto' })).toHaveFocus(),
    );
  });

  it('follows edits and deletions made while it is open', async () => {
    const { services, december, april } = await seeded();
    renderAt(`?a=${december}&b=${april}`, services, april);
    await screen.findByText('TSH, da 5,31 a 5,07 µUI/mL, meno 0,24, meno 5%');

    await services.reports.updateReport(december, reportInput({ sampleDate: '2021-10-04' }), [
      tsh(7, '7'),
      glucose(92),
      ft4(),
    ]);
    await waitFor(() =>
      expect(screen.getByText('TSH, da 7 a 5,07 µUI/mL, meno 1,93, meno 28%')).toBeInTheDocument(),
    );

    await services.reports.deleteReport(december);
    await waitFor(() =>
      expect(screen.getByText(/Questo confronto non è più disponibile/)).toBeInTheDocument(),
    );
  });
});
