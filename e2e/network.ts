import type { Page } from '@playwright/test';

/** Every request the page makes must stay on the app's own origin. */
export function watchNetwork(page: Page, baseURL: string): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL) && !url.startsWith('data:') && !url.startsWith('blob:'))
      external.push(url);
  });
  return external;
}
