// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartPoint } from '../../src/ui/chart/chart-model';
import { imageFileName, saveChartImage } from '../../src/ui/chart/save-png';
import { canvasRecorder } from './canvas-recorder';

const points: ChartPoint[] = [
  {
    key: 'a',
    date: '2021-07-10',
    value: 5.48,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: true,
  },
  {
    key: 'b',
    date: '2022-08-20',
    value: 5.07,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: true,
  },
];
const image = { title: 'TSH', subtitle: 'µUI/mL · luglio 2021 – agosto 2022', points };

describe('imageFileName', () => {
  it('keeps only safe characters', () => {
    expect(imageFileName('tsh', '2022-08-20')).toBe('bloodio-tsh-2022-08-20.png');
    expect(imageFileName('custom:3f2a-9B', '2022-08-20')).toBe(
      'bloodio-custom-3f2a-9b-2022-08-20.png',
    );
  });
});

describe('saveChartImage', () => {
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    clicked = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => canvasRecorder().ctx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
      callback(new Blob(['png'], { type: 'image/png' }));
    });
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

  function stubPointer(coarse: boolean) {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: coarse && query === '(pointer: coarse)',
    }));
  }

  it('downloads the PNG where files cannot be shared', async () => {
    stubPointer(true);
    vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined });
    await expect(saveChartImage(image, 'bloodio-tsh-2022-08-20.png')).resolves.toBe('downloaded');
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe('bloodio-tsh-2022-08-20.png');
    expect(clicked[0]!.href).toBe('blob:local');
  });

  it('opens the share sheet with the file on a coarse pointer that can share files', async () => {
    stubPointer(true);
    const share = vi.fn<(data: { files: File[] }) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(saveChartImage(image, 'bloodio-tsh-2022-08-20.png')).resolves.toBe('shared');
    const shared = share.mock.calls[0]![0];
    expect(shared.files[0]!.name).toBe('bloodio-tsh-2022-08-20.png');
    expect(shared.files[0]!.type).toBe('image/png');
    expect(clicked).toHaveLength(0);
  });

  it('downloads on a fine pointer even when the platform can share files', async () => {
    stubPointer(false);
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(saveChartImage(image, 'x.png')).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(1);
  });

  it('downloads on a coarse pointer when canShare rejects the file', async () => {
    stubPointer(true);
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, canShare: () => false, share });
    await expect(saveChartImage(image, 'x.png')).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
  });

  it('treats a dismissed share sheet as a choice, not an error', async () => {
    stubPointer(true);
    const share = vi.fn(() => Promise.reject(new DOMException('dismissed', 'AbortError')));
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(saveChartImage(image, 'x.png')).resolves.toBe('cancelled');
  });

  it('falls back to a download when the system refuses the share', async () => {
    stubPointer(true);
    const share = vi.fn(() => Promise.reject(new DOMException('nope', 'NotAllowedError')));
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(saveChartImage(image, 'x.png')).resolves.toBe('downloaded');
    expect(clicked).toHaveLength(1);
  });

  it('rethrows any other share failure', async () => {
    stubPointer(true);
    const share = vi.fn(() => Promise.reject(new TypeError('boom')));
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share });
    await expect(saveChartImage(image, 'x.png')).rejects.toThrow('boom');
  });

  it('keeps the object URL alive long enough for a download prompt, then cleans up', async () => {
    vi.useFakeTimers();
    try {
      stubPointer(false);
      vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined });
      await saveChartImage(image, 'x.png');
      expect(document.body.contains(clicked[0]!)).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(39000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local');
    } finally {
      vi.useRealTimers();
    }
  });
});
