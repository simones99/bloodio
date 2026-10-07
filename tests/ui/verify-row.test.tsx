// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyEditableRow,
  toEditableRow,
  withAnalyte,
  type EditableRow,
} from '../../src/parsers/editable';
import { buildDraftRow } from '../../src/parsers/draft';
import { parseReport } from '../../src/parsers/registry';
import { VerifyRow } from '../../src/ui/import/VerifyRow';
import { loadFixture } from '../fixtures/load';
import './setup-dom';

const report = parseReport(loadFixture('proavis-2021-10-04'));
const editable = (rawName: string) =>
  toEditableRow(
    report.rows.find((r) => r.rawName === rawName)!,
    'k',
  );

function Harness({
  initial,
  showProblems = false,
  onDelete = () => {},
}: {
  initial: EditableRow;
  showProblems?: boolean;
  onDelete?: () => void;
}) {
  const [row, setRow] = useState(initial);
  return (
    <VerifyRow
      row={row}
      custom={[]}
      showProblems={showProblems}
      onChange={setRow}
      onDelete={onDelete}
      onPickAnalyte={() => {}}
      onUseSuggestion={() => {}}
    />
  );
}

describe('VerifyRow', () => {
  it('shows a clean row as read well, with editable text', () => {
    render(<Harness initial={editable('Glicemia')} />);
    const row = screen.getByRole('article', { name: 'Glicemia' });
    expect(within(row).getByText('letto bene')).toBeInTheDocument();
    expect(within(row).getByLabelText('Valore')).toHaveValue('95');
    expect(within(row).getByLabelText('Unità')).toHaveValue('mg/dL');
    expect(within(row).getByLabelText('Minimo')).toHaveValue('70');
    expect(within(row).getByLabelText('Massimo')).toHaveValue('110');
    expect(within(row).queryByRole('button', { name: 'Ho controllato' })).not.toBeInTheDocument();
  });

  it('explains a doubt in words and lets the user confirm it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={editable('Vitamina D (25 OH)')} />);
    expect(screen.getByText(/Il referto stampa il range su più righe/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ho controllato' }));
    expect(screen.getByText('controllato')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ho controllato' })).not.toBeInTheDocument();
  });

  it('keeps what the user types', async () => {
    const user = userEvent.setup();
    render(<Harness initial={editable('Glicemia')} />);
    const value = screen.getByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '92,5');
    expect(value).toHaveValue('92,5');
  });

  it('names what is missing only after a save attempt', () => {
    const { rerender } = render(<Harness initial={emptyEditableRow('k')} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(<Harness initial={emptyEditableRow('k')} showProblems />);
    expect(screen.getByText('Scegli la voce.')).toBeInTheDocument();
    expect(screen.getByText('Scrivi il valore.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valore')).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers the two readings of an ambiguous number and applies the chosen one', async () => {
    const user = userEvent.setup();
    const draft = buildDraftRow({
      name: 'Un analita sconosciuto',
      value: '1.250',
      unit: '',
      ref: '',
      section: null,
      page: 0,
      bbox: { x: 0, y: 0, w: 0, h: 0 },
    });
    const initial = toEditableRow(draft, 'k');
    render(<Harness initial={initial} />);

    const decimal = screen.getByRole('button', { name: '1,25' });
    const thousands = screen.getByRole('button', { name: '1250' });
    expect(decimal).toHaveAttribute('aria-pressed', 'false');
    expect(thousands).toHaveAttribute('aria-pressed', 'true');

    await user.click(decimal);
    expect(screen.getByLabelText('Valore')).toHaveValue('1,25');
    expect(
      screen.queryByText(
        'Il punto può essere decimale o migliaia. Controlla il numero sul referto.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1,25' })).not.toBeInTheDocument();
  });

  it('passes a typed comparator to the preview rail', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={editable('Glicemia')} />);
    const value = screen.getByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '<90');
    expect(container.querySelector('[data-kind="open"]')).not.toBeNull();
  });

  it('shows the printed value under the field once the user changes it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={editable('Glicemia')} />);
    expect(screen.queryByText(/stampato:/)).not.toBeInTheDocument();
    const value = screen.getByLabelText('Valore');
    await user.clear(value);
    await user.type(value, '92,5');
    expect(screen.getByText('stampato: 95')).toBeInTheDocument();
  });

  it('asks the page to delete the row', async () => {
    const onDelete = vi.fn();
    render(<Harness initial={editable('Glicemia')} onDelete={onDelete} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Elimina riga' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('labels a blank row by its resolved analyte once one is picked', () => {
    const row = withAnalyte(emptyEditableRow('k'), { analyteId: 'glucose' });
    render(<Harness initial={row} />);
    expect(screen.getByRole('article', { name: 'Glicemia' })).toBeInTheDocument();
  });
});
