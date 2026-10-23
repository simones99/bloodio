import { test as base, expect } from '@playwright/test';

/**
 * Every end-to-end test runs with two privacy guards:
 * - no request leaves the app's origin: requests from pages, workers and the service worker
 *   (watched at the context level) plus WebSockets;
 * - the Content Security Policy blocks nothing the document reports.
 * A <meta> policy does not reach workers or the service worker: their requests are caught by
 * the request guard instead.
 */
export const test = base.extend<{ privacyGuards: void }>({
  privacyGuards: [
    async ({ context, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const leaves = (url: string) =>
        !url.startsWith('data:') && !url.startsWith('blob:') && new URL(url).origin !== origin;

      const external: string[] = [];
      context.on('request', (request) => {
        if (leaves(request.url())) external.push(request.url());
      });
      context.on('page', (page) =>
        page.on('websocket', (socket) => {
          if (leaves(socket.url())) external.push(socket.url());
        }),
      );

      const violations: string[] = [];
      // The binding outlives reloads and navigations, unlike an array kept in the page.
      await context.exposeBinding('__reportCspViolation', (_source, violation: string) => {
        violations.push(violation);
      });
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          const report = (window as unknown as { __reportCspViolation(v: string): void })
            .__reportCspViolation;
          report(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });

      await use();

      expect.soft(external, 'requests to other origins').toEqual([]);
      expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
