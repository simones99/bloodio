import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Link } from 'react-router';
import { it } from '../i18n/it';
import {
  bandPaths,
  buildChartModel,
  calloutPlacement,
  linePath,
  type ChartPoint,
  type PlottedPoint,
  type PointDetail,
} from './chart-model';
import styles from './TrendChart.module.css';

export const CHART_HEIGHT = 200;
const FALLBACK_WIDTH = 350;

/** The container's width in pixels, so text stays 11px on every screen (a viewBox would scale it). */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      if (element.clientWidth > 0) setWidth(Math.round(element.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const r = (value: number) => Number(value.toFixed(2));

function Mark({ point }: { point: PlottedPoint }) {
  const diamond = point.shape === 'out';
  return (
    <g
      data-shape={point.shape}
      data-latest={point.latest || undefined}
      transform={`translate(${r(point.x)} ${r(point.y)})`}
    >
      {diamond ? (
        <>
          <rect
            className={styles.halo}
            x={-6.5}
            y={-6.5}
            width={13}
            height={13}
            rx={2.5}
            transform="rotate(45)"
          />
          <rect
            className={styles.out}
            x={-4.5}
            y={-4.5}
            width={9}
            height={9}
            rx={1.5}
            transform="rotate(45)"
          />
        </>
      ) : (
        <>
          <circle className={styles.halo} r={6.5} />
          <circle
            className={point.shape === 'in' ? styles.in : styles.open}
            r={point.shape === 'in' ? 4.5 : 3.75}
          />
        </>
      )}
      {point.latest &&
        (diamond ? (
          <rect
            className={styles.latest}
            x={-8}
            y={-8}
            width={16}
            height={16}
            rx={3}
            transform="rotate(45)"
          />
        ) : (
          <circle className={styles.latest} r={8.5} />
        ))}
    </g>
  );
}

interface TrendChartProps {
  /** At least two points, already in the display unit. */
  points: ChartPoint[];
  /** Plain-words description: the drawing is one image for assistive technology. */
  label: string;
  /** Detail box contents per point key. Without it the points are not interactive. */
  details?: Record<string, PointDetail>;
}

/** Values over time on the printed range, stepped per report. The table carries the same data. */
export function TrendChart({ points, label, details }: TrendChartProps) {
  const container = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const callout = useRef<HTMLDivElement>(null);
  const calloutId = useId();
  const width = useWidth(container);
  const model = useMemo(
    () => buildChartModel(points, { width, height: CHART_HEIGHT }),
    [points, width],
  );
  const { fills, edges } = bandPaths(model.segments);
  const { plot } = model;
  const last = model.points.length - 1;

  // Roving tab stop (starts on the latest point) and the point whose box is open.
  const [focusIndex, setFocusIndex] = useState(last);
  const [active, setActive] = useState<number | null>(null);
  const tabStop = Math.min(Math.max(focusIndex, 0), last);
  const activePoint = active === null ? undefined : model.points[active];
  const activeDetail = activePoint && details?.[activePoint.key];

  // A press closes the box unless it lands on the box itself (its link) or on a point button;
  // that includes the chart background, which on phones reads as dismiss.
  useEffect(() => {
    if (active === null) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (callout.current?.contains(target)) return;
      if (buttons.current.some((button) => button?.contains(target))) return;
      setActive(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [active]);

  function open(index: number) {
    setFocusIndex(index);
    setActive(index);
  }

  function move(index: number) {
    const next = Math.min(Math.max(index, 0), last);
    open(next);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(index + 1),
      ArrowUp: () => move(index + 1),
      ArrowLeft: () => move(index - 1),
      ArrowDown: () => move(index - 1),
      Home: () => move(0),
      End: () => move(last),
      Escape: () => setActive(null),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  const placement = activePoint && calloutPlacement(activePoint, model);

  return (
    <div
      ref={container}
      className={styles.chart}
      onBlur={(event) => {
        // Keyboard users tabbing away close the box. A blur with no destination (a tap on Safari,
        // which does not focus links) must not, or the box would vanish before its link is hit.
        const next = event.relatedTarget as Node | null;
        if (next && !container.current?.contains(next)) setActive(null);
      }}
    >
      <svg
        width={model.width}
        height={model.height}
        role="img"
        aria-label={label}
        focusable="false"
      >
        {fills.map((d, i) => (
          <path key={`band-${i}`} data-part="band" className={styles.band} d={d} />
        ))}
        {edges.map((d, i) => (
          <path key={`edge-${i}`} data-part="edge" className={styles.edge} d={d} />
        ))}
        <g className={styles.grid}>
          {model.yTicks.map((tick) => (
            <line
              key={tick.label}
              x1={plot.left}
              x2={plot.right}
              y1={r(tick.position)}
              y2={r(tick.position)}
            />
          ))}
        </g>
        {model.yTicks.map((tick) => (
          <text
            key={tick.label}
            className={styles.axis}
            x={plot.left - 8}
            y={r(tick.position) + 4}
            textAnchor="end"
          >
            {tick.label}
          </text>
        ))}
        {model.bandLabel && (
          <text className={styles.axis} x={r(model.bandLabel.x)} y={r(model.bandLabel.y)}>
            {it.analyte.bandLabel}
          </text>
        )}
        <path data-part="line" className={styles.line} d={linePath(model.points)} />
        {model.points.map((point) => (
          <Mark key={point.key} point={point} />
        ))}
        {model.xTicks.map((tick) => (
          <text
            key={`${tick.label}-${tick.position}`}
            className={styles.axis}
            x={r(tick.position)}
            y={model.height - 8}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {details && (
        <div role="group" aria-label={it.analyte.points} className={styles.hits}>
          {model.points.map((point, index) => (
            <button
              key={point.key}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              className={styles.hit}
              style={{ left: r(point.x), top: r(point.y) }}
              tabIndex={index === tabStop ? 0 : -1}
              aria-label={details[point.key]?.label ?? point.key}
              aria-expanded={active === index}
              aria-controls={active === index ? calloutId : undefined}
              onClick={() => open(index)}
              onFocus={() => open(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            />
          ))}
        </div>
      )}

      {activeDetail && placement && (
        <div
          id={calloutId}
          ref={callout}
          className={styles.callout}
          data-align={placement.align}
          data-side={placement.side}
          style={{ left: r(placement.left), top: r(placement.top) }}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || active === null) return;
            event.preventDefault();
            // Focusing the point reopens its box (onFocus), so close last.
            buttons.current[active]?.focus();
            setActive(null);
          }}
        >
          <strong>{activeDetail.value}</strong>
          <span>{activeDetail.date}</span>
          {activeDetail.lab && <span>{activeDetail.lab}</span>}
          <Link to={activeDetail.href}>{it.analyte.openReport}</Link>
        </div>
      )}
    </div>
  );
}
