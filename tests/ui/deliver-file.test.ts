// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverFile } from '../../src/ui/share/deliver-file';

describe('deliverFile', () => {
  let clicked: HTMLAnchorElement[];
  const json = () => new Blob(['{}'], { type: 'application/json' });

  beforeEach(() => {
    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    URL.createObjectURL = vi.fn(() => 'blob:local');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads any file with its name where files cannot be shared', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    await expect(deliverFile(json(), 'bloodio-2026-10-08.json', 'Bloodio')).resolves.toBe(
      'downloaded',
    );
    expect(clicked[0]!.download).toBe('bloodio-2026-10-08.json');
  });

  it('shares the file with its own type and the given title on a touch device', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
    const share = vi.fn<(data: { files: File[]; title: string }) => Promise<void>>(() =>
      Promise.resolve(),
    );
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(deliverFile(json(), 'x.json', 'Bloodio')).resolves.toBe('shared');
    const shared = share.mock.calls[0]![0];
    expect(shared.files[0]!.type).toBe('application/json');
    expect(shared.title).toBe('Bloodio');
  });
});
