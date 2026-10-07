// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';
import { Layout } from '../../src/ui/app/Layout';
import './setup-dom';

// Layout scrolls its main element on navigation; jsdom does not implement element scrolling.
beforeAll(() => {
  if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => {};
});

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/analytes" element={<p>lista</p>} />
          <Route path="/analytes/:ref" element={<p>voce</p>} />
          <Route path="/reports" element={<p>referti</p>} />
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
});
