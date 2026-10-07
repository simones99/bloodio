// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../../src/ui/app/services';
import { ImportSessionProvider, useImportSession } from '../../src/ui/import/import-session';
import { ImportPage } from '../../src/ui/pages/ImportPage';
import { testServices } from './fake-services';
import './setup-dom';

function SessionProbe() {
  const { session } = useImportSession();
  return <p>sessione: {session?.mode ?? 'nessuna'}</p>;
}

function renderImportPage(services: Services) {
  render(
    <ServicesProvider services={services}>
      <MemoryRouter initialEntries={['/import']}>
        <ImportSessionProvider>
          <Routes>
            <Route path="/import" element={<ImportPage />} />
            <Route path="/import/verify" element={<SessionProbe />} />
          </Routes>
        </ImportSessionProvider>
      </MemoryRouter>
    </ServicesProvider>,
  );
}

describe('ImportPage — manual entry', () => {
  it('starts a manual session and moves to the verification page', async () => {
    renderImportPage(await testServices());
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Inserisci i valori a mano' }));
    expect(await screen.findByText('sessione: manual')).toBeInTheDocument();
  });
});
