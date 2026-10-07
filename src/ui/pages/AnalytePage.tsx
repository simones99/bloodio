import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { analyteRefToString, parseAnalyteRef } from '../../domain/types';
import {
  buildAnalyteView,
  formatRowRange,
  formatRowValue,
  hasReference,
  type HistoryRow,
} from '../analyte/analyte-view';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { TrendChart } from '../chart/TrendChart';
import { imageFileName, saveChartImage } from '../chart/save-png';
import { Rail } from '../components/Rail';
import { RangeFlag } from '../components/RangeFlag';
import { formatDateLong, formatDateShort, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './AnalytePage.module.css';

function Header({ row, watch }: { row: HistoryRow; watch: boolean }) {
  const range = formatRowRange(row);
  const shown = formatRowValue(row);
  return (
    <>
      <p className={`display ${styles.big} ${shown.length > 6 ? styles.bigLong : ''}`}>
        {shown}
        {row.value !== null && row.unit && <small>{row.unit}</small>}
      </p>
      <p className={styles.when}>
        {[formatDateLong(row.sampleDate), row.lab].filter(Boolean).join(', ')}
      </p>
      <p className={styles.flag}>
        <RangeFlag
          outOfRange={row.outOfRange}
          value={row.value}
          refMin={row.refMin}
          refMax={row.refMax}
          hasReference={hasReference(row)}
        />
        {range && <span className={styles.printed}>{it.analyte.printedRange(range)}</span>}
      </p>
      {row.value !== null && (
        <div className={styles.rail}>
          <Rail
            value={row.value}
            refMin={row.refMin}
            refMax={row.refMax}
            comparator={row.comparator}
            watch={watch}
          />
        </div>
      )}
    </>
  );
}

function History({ rows }: { rows: HistoryRow[] }) {
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className={shared.sectionTitle}>
        {it.analyte.history}
      </h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{it.analyte.date}</th>
            <th scope="col" className={styles.num}>
              {it.analyte.value}
            </th>
            <th scope="col">{it.analyte.range}</th>
            <th scope="col">{it.analyte.lab}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td className={styles.date}>
                {row.outOfRange === true && <i className={styles.mark} aria-hidden="true" />}
                <Link to={`/reports/${row.reportId}`}>{formatDateShort(row.sampleDate)}</Link>
                {row.outOfRange === true && (
                  <span className="visually-hidden">, {it.analyte.outOfRange}</span>
                )}
              </td>
              <td className={styles.num}>
                {formatRowValue(row)}
                {!row.converted && row.value !== null && row.unit && <small>{row.unit}</small>}
              </td>
              <td>{formatRowRange(row) ?? '—'}</td>
              <td>{row.lab}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Route element: remounts the page per analyte so no state leaks from one analyte to the next. */
export function AnalyteRoute() {
  const { ref = '' } = useParams();
  return <AnalytePage key={ref} />;
}

export function AnalytePage() {
  const { ref: refParam = '' } = useParams();
  const ref = useMemo(() => parseAnalyteRef(refParam), [refParam]);
  const refKey = analyteRefToString(ref);
  const navigate = useNavigate();
  const location = useLocation();
  const { reports, customAnalytes, settings } = useServices();
  // The unit picked on this page, shown at once even if remembering it fails.
  const [picked, setPicked] = useState<{ refKey: string; unit: string } | null>(null);
  const [unitNotSaved, setUnitNotSaved] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const subscribe = useCallback(
    (listener: () => void) => {
      const offReports = reports.subscribe(listener);
      const offSettings = settings.subscribe(listener);
      return () => {
        offReports();
        offSettings();
      };
    },
    [reports, settings],
  );
  const loaded = useQuery(
    useCallback(
      async () => ({
        points: await reports.listSeries(ref),
        custom: await customAnalytes.list(),
        preferred: await settings.get('preferredUnits'),
      }),
      [reports, customAnalytes, settings, ref],
    ),
    subscribe,
  );

  const view = useMemo(() => {
    if (loaded.status !== 'ready') return null;
    const { points, custom, preferred } = loaded.data;
    const unit = picked?.refKey === refKey ? picked.unit : preferred[refKey];
    return buildAnalyteView(points, ref, custom, unit);
  }, [loaded, picked, ref, refKey]);

  async function pickUnit(unit: string) {
    setPicked({ refKey, unit });
    setUnitNotSaved(false);
    try {
      const preferred = await settings.get('preferredUnits');
      await settings.set('preferredUnits', { ...preferred, [refKey]: unit });
    } catch {
      setUnitNotSaved(true);
    }
  }

  async function saveImage() {
    if (!view?.image || savingImage) return;
    setSavingImage(true);
    setImageFailed(false);
    try {
      await saveChartImage(
        { title: view.name, subtitle: view.image.subtitle, points: view.chartPoints },
        imageFileName(refKey, view.image.date),
      );
    } catch {
      setImageFailed(true);
    } finally {
      setSavingImage(false);
    }
  }

  function goBack() {
    // "default" is the first entry of this app's history: there is no page of ours to go back to.
    if (location.key !== 'default') navigate(-1);
    else navigate('/reports');
  }

  if (loaded.status === 'error') {
    return (
      <p className={shared.alert} role="alert">
        {it.analyte.loadFailed}
      </p>
    );
  }
  if (!view) return null;
  if (!view.latest) {
    return (
      <div className={shared.empty}>
        <p>{it.analyte.empty}</p>
        <Link to="/reports" className={shared.secondary}>
          {it.analyte.toReports}
        </Link>
      </div>
    );
  }

  return (
    <>
      <header className={shared.pageHead}>
        <button type="button" className={shared.backLink} onClick={goBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {it.analyte.back}
        </button>
        <p className={styles.category}>{it.category[view.category]}</p>
        <h1 className={styles.name}>{view.name}</h1>
        <Header row={view.latest} watch={view.watch} />
      </header>

      {view.chartPoints.length >= 2 && view.summary && (
        <div className={styles.chart}>
          <TrendChart points={view.chartPoints} label={view.summary} details={view.pointDetails} />
        </div>
      )}
      {view.chartPoints.length === 1 && <p className={styles.note}>{it.analyte.oneReport}</p>}

      {(view.unitOptions.length > 1 || view.image) && (
        <div className={shared.chips}>
          {view.unitOptions.length > 1 && (
            <div className={styles.units} role="group" aria-label={it.analyte.units}>
              {view.unitOptions.map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={shared.chip}
                  aria-pressed={unit === view.unit}
                  onClick={() => void pickUnit(unit)}
                >
                  {unit}
                </button>
              ))}
            </div>
          )}
          {view.image && (
            <button
              type="button"
              className={`${shared.chip} ${styles.saveImage}`}
              aria-disabled={savingImage || undefined}
              onClick={() => void saveImage()}
            >
              {it.analyte.saveImage}
            </button>
          )}
        </div>
      )}
      {imageFailed && (
        <p className={shared.alert} role="alert">
          {it.analyte.imageFailed}
        </p>
      )}
      {unitNotSaved && (
        <p className={shared.alert} role="alert">
          {it.analyte.unitNotSaved}
        </p>
      )}
      {view.excludedCount > 0 && (
        <p className={styles.note}>
          {view.unit === null
            ? it.analyte.excludedNoUnit(view.excludedCount)
            : it.analyte.excluded(view.excludedCount, view.unit)}
        </p>
      )}

      <History rows={view.rows} />
    </>
  );
}
