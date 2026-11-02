// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Layout } from '../../src/ui/app/Layout';
import './setup-dom';
import { whenInDocument } from './when-in-document';

// Layout scrolls its main element on navigation; jsdom does not implement element scrolling.
beforeAll(() => {
  if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => {};
});

/** Navigates once a task has passed, as the detail page does after deleting a report. */
function DeleteReport() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        navigate('/reports', { replace: true });
      }}
    >
      Elimina referto
    </button>
  );
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<p>home</p>} />
          <Route path="/analytes" element={<p>lista</p>} />
          <Route path="/analytes/:ref" element={<p>voce</p>} />
          <Route path="/reports" element={<p>referti</p>} />
          <Route path="/reports/:id" element={<DeleteReport />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Layout tab bar', () => {
  it('has a "Valori" tab, current on the list and on an entry page', () => {
    renderAt('/analytes');
    expect(screen.getByRole('link', { name: 'Valori' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Referti' })).not.toHaveAttribute('aria-current');
  });

  it('keeps "Valori" current on an entry page', () => {
    renderAt('/analytes/tsh');
    expect(screen.getByRole('link', { name: 'Valori' })).toHaveAttribute('aria-current', 'page');
  });

  it('has a "Home" tab, current only on the start page', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Referti' })).not.toHaveAttribute('aria-current');
  });

  it('does not keep "Home" current on other pages', () => {
    renderAt('/reports');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});

describe('Layout focus on navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves focus to main and scrolls it to the top in the same commit that shows the page', async () => {
    renderAt('/reports/1');
    const scrollTo = vi.spyOn(Element.prototype, 'scrollTo');
    const user = userEvent.setup();
    const arrived = whenInDocument(() => screen.queryByText('referti'));

    await user.click(screen.getByRole('button', { name: 'Elimina referto' }));
    await arrived;

    // Checked at once, not in waitFor: until focus moves it sits on the body.
    expect(screen.getByRole('main')).toHaveFocus();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
