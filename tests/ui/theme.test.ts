// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, syncTheme } from '../../src/ui/app/theme';
import { testServices } from './fake-services';
import './setup-dom';

const meta = () => document.querySelector('meta[name="theme-color"]');

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('sets the theme on the root element and the browser bar colour', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    applyTheme('carta');
    expect(document.documentElement.dataset.theme).toBe('carta');
    expect(meta()).toHaveAttribute('content', '#ffffff');
    applyTheme('nero');
    expect(document.documentElement.dataset.theme).toBe('nero');
    expect(meta()).toHaveAttribute('content', '#000000');
  });

  it('follows the system for the browser bar in automatic mode', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000">';
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
    }));
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBe('auto');
    expect(meta()).toHaveAttribute('content', '#ffffff');
  });

  it('applies the saved theme at once and follows later changes', async () => {
    const { settings } = await testServices();
    await settings.set('theme', 'carta');
    const stop = await syncTheme(settings);
    expect(document.documentElement.dataset.theme).toBe('carta');
    await settings.set('theme', 'nero');
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('nero'));
    stop();
  });

  it('falls back to Nero when the saved theme cannot be read, and still follows changes', async () => {
    const { settings } = await testServices();
    let failing = true;
    const stop = await syncTheme({
      ...settings,
      get: (key) =>
        failing && key === 'theme' ? Promise.reject(new Error('blocked')) : settings.get(key),
    });
    expect(document.documentElement.dataset.theme).toBe('nero');
    failing = false;
    await settings.set('theme', 'carta');
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('carta'));
    stop();
  });
});
