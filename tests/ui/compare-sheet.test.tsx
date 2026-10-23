// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CompareSheet } from '../../src/ui/compare/CompareSheet';
import { refsOf, report } from './compare-fixtures';
import './setup-dom';

const april = report('apr', '2022-08-20');
const december = report('dec', '2021-10-04');
const may = report('may', '2021-07-10', undefined, 'AST Vallerosa');
const reports = [april, december, may];
const refs = refsOf({ apr: ['tsh', 'glucose'], dec: ['tsh', 'glucose'], may: ['tsh'] });

describe('CompareSheet', () => {
  it('lists the other reports with the entries in common and marks the previous one', () => {
    render(
      <CompareSheet
        fixed={april}
        reports={reports}
        refs={refs}
        selected="dec"
        onChoose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confronta il 20 agosto 2022 con' });
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['dec', 'may']);
    const previous = within(dialog).getByRole('radio', { name: /4 ottobre 2021/ });
    expect(previous).toBeChecked();
    expect(previous).toHaveFocus();
    expect(within(dialog).getByRole('radio', { name: /precedente/ })).toBe(previous);
    expect(within(dialog).getByText('PROAVIS · 2 voci in comune')).toBeInTheDocument();
    expect(within(dialog).getByText('AST Vallerosa · 1 voce in comune')).toBeInTheDocument();
  });

  it('lists reports of the same day newest first, by when they were added', () => {
    const morning = report('morning', '2026-03-02', '2026-03-02T08:00:00.000Z');
    const evening = report('evening', '2026-03-02', '2026-03-02T20:00:00.000Z');
    render(
      <CompareSheet
        fixed={april}
        reports={[april, morning, evening, december]}
        refs={refs}
        selected={null}
        onChoose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'evening',
      'morning',
      'dec',
    ]);
  });

  it('confirms the chosen report; Escape and "Annulla" close it', async () => {
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(
      <CompareSheet
        fixed={april}
        reports={reports}
        refs={refs}
        selected={null}
        onChoose={onChoose}
        onClose={onClose}
      />,
    );
    const user = userEvent.setup();
    const confirm = screen.getByRole('button', { name: 'Confronta' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /10 luglio 2021/ }));
    await user.click(confirm);
    expect(onChoose).toHaveBeenCalledWith('may');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Shift+Tab inside when the checked report is not the first one', async () => {
    render(
      <>
        <button type="button">Fuori</button>
        <CompareSheet
          fixed={april}
          reports={reports}
          refs={refs}
          selected="may"
          onChoose={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );
    const user = userEvent.setup();
    expect(screen.getByRole('radio', { name: /10 luglio 2021/ })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Confronta' })).toHaveFocus();
  });

  it('wraps Tab from the last button back to the checked report', async () => {
    render(
      <>
        <button type="button">Fuori</button>
        <CompareSheet
          fixed={april}
          reports={reports}
          refs={refs}
          selected="may"
          onChoose={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Confronta' }).focus();
    await user.tab();
    expect(screen.getByRole('radio', { name: /10 luglio 2021/ })).toHaveFocus();
  });

  it.each([
    ['the fixed report', 'apr'],
    ['a report not in the list', 'gone'],
  ])('starts with nothing chosen when the selected id is %s', (_, selected) => {
    render(
      <CompareSheet
        fixed={april}
        reports={reports}
        refs={refs}
        selected={selected}
        onChoose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Confronta' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /4 ottobre 2021/ })).toHaveFocus();
  });

  it('focuses the first button when there is no other report', () => {
    render(
      <CompareSheet
        fixed={april}
        reports={[april]}
        refs={refs}
        selected={null}
        onChoose={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(screen.getByRole('button', { name: 'Annulla' })).toHaveFocus();
  });
});
