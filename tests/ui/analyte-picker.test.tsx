// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomAnalyte } from '../../src/domain/types';
import { AnalytePicker } from '../../src/ui/import/AnalytePicker';
import './setup-dom';

const custom: CustomAnalyte[] = [
  {
    id: 'c1',
    name: 'Cristalli rari',
    unit: null,
    category: 'urine',
    specimen: 'urine',
    kind: 'qualitative',
  },
];

function open(initialQuery: string) {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  render(
    <AnalytePicker
      initialQuery={initialQuery}
      custom={custom}
      onChoose={onChoose}
      onClose={onClose}
    />,
  );
  return { onChoose, onClose, user: userEvent.setup() };
}

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button, input, [tabindex]'));
}

function Harness({ initialQuery }: { initialQuery: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Apri
      </button>
      {open && (
        <AnalytePicker
          initialQuery={initialQuery}
          custom={custom}
          onChoose={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

describe('AnalytePicker', () => {
  it('starts from the printed name and finds analytes by alias', async () => {
    const { onChoose, user } = open('HTG');
    expect(screen.getByLabelText('Cerca per nome')).toHaveValue('HTG');
    await user.click(screen.getByRole('button', { name: /Tireoglobulina/ }));
    expect(onChoose).toHaveBeenCalledWith({ analyteId: 'thyroglobulin' });
  });

  it('lists custom analytes next to the catalog', async () => {
    const { onChoose, user } = open('cristalli');
    await user.click(screen.getByRole('button', { name: /Cristalli rari/ }));
    expect(onChoose).toHaveBeenCalledWith({ customAnalyteId: 'c1' });
  });

  it('offers to create a custom analyte only for a name that does not exist', async () => {
    const { onChoose, user } = open('Sangue occulto feci');
    expect(screen.getByText('Nessuna voce con questo nome.')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Salva «Sangue occulto feci» come voce personalizzata',
      }),
    );
    expect(onChoose).toHaveBeenCalledWith({ createCustom: 'Sangue occulto feci' });

    const search = screen.getByLabelText('Cerca per nome');
    await user.clear(search);
    await user.type(search, 'TSH');
    expect(
      screen.queryByRole('button', { name: /come voce personalizzata/ }),
    ).not.toBeInTheDocument();
  });

  it('closes with the button and with Escape', async () => {
    const { onClose, user } = open('');
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('traps Tab and Shift+Tab inside the sheet', async () => {
    const user = userEvent.setup();
    render(<AnalytePicker initialQuery="" custom={custom} onChoose={vi.fn()} onClose={vi.fn()} />);
    const sheet = screen.getByRole('dialog');
    const items = focusables(sheet);
    expect(items.length).toBeGreaterThan(1);
    const first = items[0]!;
    const last = items[items.length - 1]!;

    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);
  });

  it('returns focus to the trigger that opened it once the sheet closes', async () => {
    const user = userEvent.setup();
    render(<Harness initialQuery="" />);
    const trigger = screen.getByRole('button', { name: 'Apri' });
    trigger.focus();
    await user.click(trigger);

    await user.click(screen.getByRole('button', { name: 'Chiudi' }));

    expect(document.activeElement).toBe(trigger);
  });
});
