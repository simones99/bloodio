import type { Settings, SettingsStore } from '../../storage/types';

const BAR_COLOR = { dark: '#000000', light: '#ffffff' } as const;

/** Sets the theme where tokens.css reads it (<html data-theme>) and the browser bar to match. */
export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.dataset.theme = theme;
  const light =
    theme === 'carta' ||
    (theme === 'auto' &&
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-color-scheme: light)').matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', light ? BAR_COLOR.light : BAR_COLOR.dark);
}

/** Applies the saved theme now, before the first render, and again whenever settings change. */
export async function syncTheme(settings: SettingsStore): Promise<() => void> {
  // A theme that cannot be read must not keep the app from starting: use the default.
  applyTheme(await settings.get('theme').catch((): Settings['theme'] => 'nero'));
  return settings.subscribe(() => {
    void settings.get('theme').then(applyTheme, () => {}); // keep the current theme
  });
}
