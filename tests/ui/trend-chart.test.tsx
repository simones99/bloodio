// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ChartPoint, PointDetail } from '../../src/ui/chart/chart-model';
import { TrendChart } from '../../src/ui/chart/TrendChart';
import './setup-dom';

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
    date: '2021-10-04',
    value: 3.1,
    comparator: null,
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: false,
  },
  {
    key: 'c',
    date: '2022-08-20',
    value: 0.2,
    comparator: '<',
    refMin: 0.27,
    refMax: 4.2,
    outOfRange: false,
  },
];

const detail = (key: string, date: string, value: string): PointDetail => ({
  label: `${date}: ${value}`,
  value,
  date,
  lab: 'PROAVIS',
  href: `/reports/r-${key}`,
});

const details: Record<string, PointDetail> = {
  a: detail('a', '10 luglio 2021', '5,48'),
  b: detail('b', '4 ottobre 2021', '3,1'),
  c: detail('c', '20 agosto 2022', '<0,2'),
};

function renderChart(chartPoints = points, withDetails = true) {
  return render(
    <MemoryRouter initialEntries={['/analytes/tsh']}>
      <Routes>
        <Route
          path="/analytes/tsh"
          element={
            <>
              <p>fuori dal grafico</p>
              <TrendChart
                points={chartPoints}
                label="TSH da luglio 2021 ad agosto 2022"
                details={withDetails ? details : undefined}
              />
            </>
          }
        />
        <Route path="/reports/:id" element={<p>dettaglio referto</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pointButtons = () =>
  within(screen.getByRole('group', { name: 'Punti del grafico' })).getAllByRole('button');

describe('TrendChart', () => {
  it('is one image for assistive technology, named by its summary', () => {
    renderChart();
    const chart = screen.getByRole('img', { name: 'TSH da luglio 2021 ad agosto 2022' });
    expect(chart.tagName.toLowerCase()).toBe('svg');
  });

  it('draws one mark per point with its shape, the latest marked', () => {
    const { container } = renderChart();
    const marks = [...container.querySelectorAll('[data-shape]')];
    expect(marks.map((m) => m.getAttribute('data-shape'))).toEqual(['out', 'in', 'open']);
    expect(marks.map((m) => m.getAttribute('data-latest'))).toEqual([null, null, 'true']);
  });

  it('draws the band, its printed edges, the axes and the line', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('[data-part="band"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-part="edge"]')).toHaveLength(2);
    expect(container.querySelector('[data-part="line"]')?.getAttribute('d')).toMatch(/^M/);
    expect(container.textContent).toContain('range stampato');
    expect(container.textContent).toContain('lug 21');
    expect(container.textContent).toContain('ago 22');
  });

  it('has no interactive points without details', () => {
    renderChart(points, false);
    expect(screen.queryByRole('group', { name: 'Punti del grafico' })).not.toBeInTheDocument();
  });

  it('puts only the latest point in the tab order, each named by its detail label', () => {
    renderChart();
    const buttons = pointButtons();
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      '10 luglio 2021: 5,48',
      '4 ottobre 2021: 3,1',
      '20 agosto 2022: <0,2',
    ]);
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('opens the detail box on tap and opens the report from it', async () => {
    const user = userEvent.setup();
    renderChart();
    await user.click(pointButtons()[0]!);
    expect(screen.getByText('5,48', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('10 luglio 2021', { selector: 'span' })).toBeInTheDocument();
    expect(pointButtons()[0]).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: 'Apri il referto' }));
    expect(screen.getByText('dettaglio referto')).toBeInTheDocument();
  });

  it('keeps the box open on a pointer press inside the chart, even if focus goes nowhere', () => {
    renderChart();
    fireEvent.click(pointButtons()[1]!);
    const link = screen.getByRole('link', { name: 'Apri il referto' });
    fireEvent.pointerDown(link);
    fireEvent.blur(pointButtons()[1]!, { relatedTarget: null });
    expect(screen.getByRole('link', { name: 'Apri il referto' })).toBeInTheDocument();
  });

  it('closes the box on a press on the chart background, not on its link', () => {
    const { container } = renderChart();
    fireEvent.click(pointButtons()[1]!);
    fireEvent.pointerDown(screen.getByRole('link', { name: 'Apri il referto' }));
    expect(screen.getByRole('link', { name: 'Apri il referto' })).toBeInTheDocument();
    fireEvent.pointerDown(container.querySelector('svg')!);
    expect(screen.queryByRole('link', { name: 'Apri il referto' })).not.toBeInTheDocument();
    fireEvent.click(pointButtons()[1]!);
    expect(screen.getByRole('link', { name: 'Apri il referto' })).toBeInTheDocument();
    fireEvent.pointerDown(pointButtons()[1]!);
    expect(screen.getByRole('link', { name: 'Apri il referto' })).toBeInTheDocument();
  });

  it('closes the box on a pointer press outside the chart', () => {
    renderChart();
    fireEvent.click(pointButtons()[1]!);
    fireEvent.pointerDown(screen.getByText('fuori dal grafico'));
    expect(screen.queryByRole('link', { name: 'Apri il referto' })).not.toBeInTheDocument();
  });

  it('moves between points with the arrow keys, Home and End, and closes with Escape', async () => {
    const user = userEvent.setup();
    renderChart();
    await user.tab();
    expect(pointButtons()[2]).toHaveFocus();
    expect(screen.getByText('<0,2', { selector: 'strong' })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(pointButtons()[1]).toHaveFocus();
    expect(pointButtons()[1]!.tabIndex).toBe(0);
    expect(screen.getByText('3,1', { selector: 'strong' })).toBeInTheDocument();

    await user.keyboard('{Home}');
    expect(pointButtons()[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(pointButtons()[2]).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Apri il referto' })).not.toBeInTheDocument();
    expect(pointButtons()[2]).toHaveFocus();
  });

  it('reaches both points of the same day with the arrows', async () => {
    const user = userEvent.setup();
    const sameDay: ChartPoint[] = [
      { ...points[0]!, key: 'a', date: '2021-07-10' },
      { ...points[1]!, key: 'b', date: '2021-07-10' },
      { ...points[2]!, key: 'c' },
    ];
    renderChart(sameDay);
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(pointButtons()[1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(pointButtons()[0]).toHaveFocus();
  });

  it('survives the points changing while a box is open', () => {
    const { rerender } = renderChart();
    fireEvent.click(pointButtons()[2]!);
    rerender(
      <MemoryRouter initialEntries={['/analytes/tsh']}>
        <Routes>
          <Route
            path="/analytes/tsh"
            element={<TrendChart points={points.slice(0, 2)} label="TSH" details={details} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(pointButtons()).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Apri il referto' })).not.toBeInTheDocument();
    expect(pointButtons().filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it('closes with Escape from the report link and returns focus to the point', async () => {
    const user = userEvent.setup();
    renderChart();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Apri il referto' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Apri il referto' })).not.toBeInTheDocument();
    expect(pointButtons()[2]).toHaveFocus();
  });
});
