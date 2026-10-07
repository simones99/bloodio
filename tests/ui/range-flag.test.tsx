// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RangeFlag } from '../../src/ui/components/RangeFlag';
import './setup-dom';

const base = { value: 5.07, refMin: 0.27, refMax: 4.2, hasReference: true };

describe('RangeFlag', () => {
  it('says nothing when the value is in range', () => {
    const { container } = render(<RangeFlag {...base} outOfRange={false} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('says on which side the value is out of range', () => {
    const { rerender } = render(<RangeFlag {...base} outOfRange />);
    expect(screen.getByText('sopra')).toBeInTheDocument();
    rerender(<RangeFlag {...base} value={0.1} outOfRange />);
    expect(screen.getByText('sotto')).toBeInTheDocument();
  });
  it('still says out of range when the side cannot be told', () => {
    render(<RangeFlag outOfRange value={null} refMin={null} refMax={null} hasReference />);
    expect(screen.getByText('fuori dal range')).toBeInTheDocument();
  });
  it('never presents an undecidable value as normal', () => {
    const { rerender } = render(<RangeFlag {...base} outOfRange={null} />);
    expect(screen.getByText('non valutabile')).toBeInTheDocument();
    rerender(<RangeFlag {...base} outOfRange={null} hasReference={false} />);
    expect(screen.getByText('senza range')).toBeInTheDocument();
  });
});
