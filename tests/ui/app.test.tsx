// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { ServicesProvider } from '../../src/ui/app/services';
import { testServices } from './fake-services';
import './setup-dom';

// Layout scrolls its main element on navigation; jsdom does not implement element scrolling.
beforeAll(() => {
  if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => {};
});

describe('App', () => {
  it('asks the browser to keep the data when the disclaimer is accepted', async () => {
    const services = await testServices();
    const requestPersist = vi.fn(() => Promise.resolve(true));
    render(
      <ServicesProvider
        services={{ ...services, storage: { ...services.storage, requestPersist } }}
      >
        <App />
      </ServicesProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ho capito, inizia' }));
    expect(requestPersist).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Nessun referto ancora/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });
});
