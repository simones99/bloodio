import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { SourceFile } from '../../ingest/ingest-file';
import { toOriginal, type PageGeometry, type Point } from '../../ingest/page-geometry';
import type { EditableRow } from '../../parsers/editable';
import type { BBox } from '../../parsers/types';
import { useServices } from '../app/services';
import { useModalFocus } from '../app/use-modal-focus';
import { it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './OriginalSheet.module.css';
import {
  ARROW_PX,
  centreOf,
  fitWidth,
  initialView,
  panBy,
  rowLineHeight,
  zoomBy,
  ZOOM_STEP,
  type PageView,
  type ZoomFrame,
} from './page-zoom';

interface OriginalSheetProps {
  origin: NonNullable<EditableRow['origin']>;
  /** How the page of the row was read, to place the rectangle on the original. */
  geometry: PageGeometry;
  /** The chosen files in page order. */
  files: SourceFile[];
  /** How many pages the file has. */
  pages: number;
  onClose(): void;
}

type PageState =
  { status: 'preparing' } | { status: 'failed' } | { status: 'ready'; canvas: HTMLCanvasElement };

/** The row as it was read: continuation lines of the range joined by a space. */
function readText(origin: OriginalSheetProps['origin']): string {
  return [origin.rawName, origin.rawValue, origin.rawUnit, origin.rawRef.split('\n').join(' ')]
    .filter((part) => part.trim() !== '')
    .join(' ');
}

/** A full-resolution page holds tens of megabytes until its canvas shrinks to nothing. */
function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/** The arrows move the view the way scrolling does: → shows what is to the right. */
const ARROW_MOVES: Record<string, [number, number]> = {
  ArrowLeft: [ARROW_PX, 0],
  ArrowRight: [-ARROW_PX, 0],
  ArrowUp: [0, ARROW_PX],
  ArrowDown: [0, -ARROW_PX],
};

/**
 * How far below the row's box the rectangle is drawn, in lines of the row. The box ends on the
 * baseline (union in layout.ts): without this, commas and descenders fall past its bottom, and
 * the border, centred on the edge, hides them ("5,07" reads "5.07").
 */
const DESCENT_LINES = 0.3;

/**
 * The row's box as drawn: grown below the baseline to hold commas and descenders. It stays in the
 * units of the page as read, so the line height is too (scale 1), before toOriginal.
 */
function drawnBox(bbox: BBox, rawRef: string): BBox {
  return { ...bbox, h: bbox.h + DESCENT_LINES * rowLineHeight({ bbox, rawRef }, 1) };
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Full-screen sheet with the page a row was read from (spec 2026-10-22 §4.2). */
export function OriginalSheet({ origin, geometry, files, pages, onClose }: OriginalSheetProps) {
  const { pages: renderer } = useServices();
  const [page, setPage] = useState<PageState>({ status: 'preparing' });
  const [view, setView] = useState<PageView | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  /** The pointers on the page area, in area coordinates: one drags, two pinch. */
  const pointers = useRef(new Map<number, Point>());
  const { ref: sheet, onKeyDown } = useModalFocus<HTMLDivElement>(onClose);

  // Runs after useModalFocus's effect has captured the opener, so closing returns focus there.
  useEffect(() => {
    sheet.current?.querySelector('button')?.focus();
  }, [sheet]);

  // The canvas is released with the request that drew it, so a remount draws a fresh one.
  useEffect(() => {
    let current = true;
    let drawn: HTMLCanvasElement | null = null;
    renderer.original(files, origin.page).then(
      (canvas) => {
        if (!current) return release(canvas);
        drawn = canvas;
        setPage({ status: 'ready', canvas });
      },
      () => {
        if (current) setPage({ status: 'failed' });
      },
    );
    return () => {
      current = false;
      if (drawn) release(drawn);
    };
  }, [renderer, files, origin.page]);

  // The canvas comes from the renderer already drawn: it is placed, never copied.
  useEffect(() => {
    if (page.status === 'ready') host.current?.prepend(page.canvas);
  }, [page]);

  const corners = useMemo(() => toOriginal(origin.bbox, geometry), [origin.bbox, geometry]);
  const drawnCorners = useMemo(
    () => toOriginal(drawnBox(origin.bbox, origin.rawRef), geometry),
    [origin.bbox, origin.rawRef, geometry],
  );
  /** The page opens on the stretch from the name to the value, when the value has its own box. */
  const valueCorners = useMemo(
    () => (origin.valueBox ? toOriginal(origin.valueBox, geometry) : null),
    [origin.valueBox, geometry],
  );
  /** The centre of the rectangle, where the page fits. */
  const focus = useMemo(() => centreOf(corners), [corners]);
  const canvasWidth = page.status === 'ready' ? page.canvas.width : 0;

  /** The page and the visible area as they are now: the area changes when the phone turns. */
  const frameOf = useCallback(
    (): ZoomFrame => ({
      pageWidth: geometry.width,
      pageHeight: geometry.height,
      canvasWidth,
      areaWidth: area.current?.clientWidth ?? 0,
      areaHeight: area.current?.clientHeight ?? 0,
    }),
    [geometry.width, geometry.height, canvasWidth],
  );

  // Before the first paint of the page, so it never shows at the wrong zoom. Every dependency
  // stays the same once the page is ready: later zooms and moves are the user's.
  const lineHeight = rowLineHeight(origin, geometry.scale);
  useLayoutEffect(() => {
    if (page.status === 'ready') {
      setView(initialView(frameOf(), lineHeight, corners, valueCorners));
    }
  }, [page, frameOf, lineHeight, corners, valueCorners]);

  useEffect(() => {
    if (page.status !== 'ready') return;
    const refit = () => setView((current) => current && zoomBy(current, 1, frameOf()));
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [page, frameOf]);

  const zoom = (factor: number) =>
    setView((current) => current && zoomBy(current, factor, frameOf()));

  function onAreaKeyDown(event: KeyboardEvent) {
    const move = ARROW_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    setView((current) => current && panBy(current, move[0], move[1], frameOf()));
  }

  const pointOf = (event: PointerEvent): Point => {
    const rect = area.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function onPointerDown(event: PointerEvent) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, pointOf(event));
  }

  function onPointerMove(event: PointerEvent) {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
    const others = [...pointers.current].filter(([id]) => id !== event.pointerId);
    const now = pointOf(event);
    pointers.current.set(event.pointerId, now);
    const frame = frameOf();
    if (others.length === 0) {
      setView((current) => current && panBy(current, now.x - before.x, now.y - before.y, frame));
    } else if (others.length === 1) {
      // A pinch: zoom about the old midpoint by how far the fingers spread, then follow it.
      const other = others[0]![1];
      const from = midpoint(before, other);
      const to = midpoint(now, other);
      const factor = distance(now, other) / Math.max(1, distance(before, other));
      setView(
        (current) =>
          current &&
          panBy(zoomBy(current, factor, frame, from), to.x - from.x, to.y - from.y, frame),
      );
    }
  }

  function onPointerEnd(event: PointerEvent) {
    pointers.current.delete(event.pointerId);
  }

  return (
    <div
      ref={sheet}
      className={styles.sheet}
      role="dialog"
      aria-modal="true"
      aria-labelledby="original-sheet-title"
      onKeyDown={onKeyDown}
    >
      <header className={styles.head}>
        <h2 id="original-sheet-title" className={styles.title}>
          {it.original.title(origin.page + 1, pages)}
        </h2>
        <button type="button" className={shared.secondary} onClick={onClose}>
          {it.original.close}
        </button>
      </header>
      <p className={styles.read}>{readText(origin)}</p>
      {page.status === 'ready' ? (
        <div
          ref={area}
          className={styles.page}
          tabIndex={0}
          onKeyDown={onAreaKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            ref={host}
            className={styles.paper}
            role="img"
            aria-label={it.original.alt(origin.page + 1, origin.rawName)}
            style={{
              width: geometry.width,
              height: geometry.height,
              ...(view
                ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }
                : { visibility: 'hidden' }),
            }}
          >
            <svg
              viewBox={`0 0 ${geometry.width} ${geometry.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon points={drawnCorners.map(({ x, y }) => `${x},${y}`).join(' ')} />
            </svg>
          </div>
        </div>
      ) : (
        <div className={styles.page}>
          <p className={styles.status}>
            {page.status === 'failed' ? it.original.failed : it.original.preparing}
          </p>
        </div>
      )}
      {page.status === 'ready' && (
        <div className={styles.zoom}>
          <button type="button" className={shared.secondary} onClick={() => zoom(1 / ZOOM_STEP)}>
            {it.original.zoomOut}
          </button>
          <button
            type="button"
            className={shared.secondary}
            onClick={() => setView(fitWidth(frameOf(), focus))}
          >
            {it.original.fit}
          </button>
          <button type="button" className={shared.secondary} onClick={() => zoom(ZOOM_STEP)}>
            {it.original.zoomIn}
          </button>
        </div>
      )}
    </div>
  );
}
