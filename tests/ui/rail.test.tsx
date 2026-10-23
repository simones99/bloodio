// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Rail } from '../../src/ui/components/Rail';
import './setup-dom';

/** The marks drawn on the rail, left to right in the DOM: the link has no kind. */
const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('i')].map((i) => i.dataset.kind ?? 'link');

describe('Rail', () => {
  it('draws only the current point without a previous value', () => {
    const { container } = render(<Rail value={90} refMin={70} refMax={100} />);
    expect(marks(container)).toEqual(['in']);
  });

  it('draws the previous value as a ring linked to the current point', () => {
    const { container } = render(<Rail value={104} from={92} refMin={70} refMax={100} />);
    expect(marks(container)).toEqual(['link', 'from', 'out']);
  });

  it('draws a lone previous value when there is no current one', () => {
    const { container } = render(<Rail value={null} from={1.56} refMin={0.93} refMax={1.7} />);
    expect(marks(container)).toEqual(['from']);
  });

  it('stays empty without a numeric range', () => {
    const { container } = render(<Rail value={5} from={4} refMin={null} refMax={null} />);
    expect(container.querySelector('[data-empty]')).not.toBeNull();
    expect(marks(container)).toEqual([]);
  });
});
