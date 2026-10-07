import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { getAnalyte } from '../../domain/catalog';
import type { AnalyteRef, CustomAnalyte, Report, ReportType } from '../../domain/types';
import type { CustomAnalyteInput } from '../../storage/types';
import {
  editableToMeasurementInput,
  emptyEditableRow,
  isPending,
  measurementToEditableRow,
  rowProblems,
  toEditableRow,
  withAnalyte,
  withSuggestedReference,
  type EditableRow,
} from '../../parsers/editable';
import { useServices } from '../app/services';
import { useQuery } from '../app/use-query';
import { AnalytePicker, type AnalyteChoice } from '../import/AnalytePicker';
import { useImportSession } from '../import/import-session';
import { VerifyRow } from '../import/VerifyRow';
import { formatDateLong, it } from '../i18n/it';
import shared from '../styles/shared.module.css';
import styles from './VerifyPage.module.css';

const TYPES: ReportType[] = ['sangue', 'urine', 'misto', 'altro'];
let nextKey = 0;
const newKey = () => `row-${nextKey++}`;
let nextPendingId = 0;
const PENDING_PREFIX = 'pending:';
const newPendingId = () => `${PENDING_PREFIX}${nextPendingId++}`;
const isPendingCustomId = (id: string) => id.startsWith(PENDING_PREFIX);

export function VerifyPage() {
  const { session, setSession } = useImportSession();
  const { reports, customAnalytes, settings } = useServices();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);

  const custom = useQuery(useCallback(() => customAnalytes.list(), [customAnalytes]));
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
  }, [custom.status]);

  const [rows, setRows] = useState<EditableRow[]>(() => {
    if (!session) return [];
    if (session.mode === 'import')
      return session.draft.rows.map((row) => toEditableRow(row, newKey()));
    if (session.mode === 'manual') return [emptyEditableRow(newKey())];
    return session.measurements.map((measurement) =>
      measurementToEditableRow(measurement, newKey()),
    );
  });
  const [sampleDate, setSampleDate] = useState(() => {
    if (session?.mode === 'import') return session.draft.sampleDate ?? '';
    if (session?.mode === 'edit') return session.report.sampleDate;
    return '';
  });
  const [lab, setLab] = useState(() => {
    if (session?.mode === 'import') return session.draft.lab ?? '';
    if (session?.mode === 'edit') return session.report.lab;
    return '';
  });
  const [type, setType] = useState<ReportType>(() => {
    if (session?.mode === 'import') return session.draft.type;
    if (session?.mode === 'edit') return session.report.type;
    return 'altro';
  });
  const [notes, setNotes] = useState(() => (session?.mode === 'edit' ? session.report.notes : ''));
  const [onlyPending, setOnlyPending] = useState(() => rows.some(isPending));
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [triedToSave, setTriedToSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Report | null>(null);
  /** Custom analytes chosen in this draft but not created yet: created only inside save(). */
  const [pendingCustom, setPendingCustom] = useState<{ id: string; input: CustomAnalyteInput }[]>(
    [],
  );
  /** Guards against a double tap on "Salva referto" starting two saves at once. */
  const savingRef = useRef(false);

  const labs = useQuery(useCallback(() => reports.listLabs(), [reports]));

  // Nothing is stored until the user confirms, so warn before the tab goes away.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const pendingCount = useMemo(() => rows.filter(isPending).length, [rows]);
  const brokenCount = useMemo(
    () => rows.filter((row) => rowProblems(row).length > 0).length,
    [rows],
  );

  // After a save or a discard the session is cleared while this page is still mounted: do not bounce to /import.
  if (!session) return saving || discarding ? null : <Navigate to="/import" replace />;
  if (custom.status !== 'ready') return null;

  const customList: CustomAnalyte[] = [
    ...custom.data,
    ...pendingCustom.map((p) => ({ id: p.id, ...p.input })),
  ];
  const visible = onlyPending
    ? rows.filter((row) => isPending(row) || (triedToSave && rowProblems(row).length > 0))
    : rows;
  const update = (next: EditableRow) =>
    setRows((all) => all.map((row) => (row.key === next.key ? next : row)));

  async function choose(choice: AnalyteChoice) {
    const key = pickingFor;
    setPickingFor(null);
    const row = rows.find((r) => r.key === key);
    if (!row) return;
    let updated: EditableRow;
    if ('createCustom' in choice) {
      const id = newPendingId();
      setPendingCustom((all) => [
        ...all,
        {
          id,
          input: {
            name: choice.createCustom,
            unit: row.unit.trim() || null,
            category: 'altro',
            specimen: 'blood',
            kind: /^\s*[<>]?=?\s*\d/.test(row.valueText) ? 'numeric' : 'qualitative',
          },
        },
      ]);
      updated = withAnalyte(row, { customAnalyteId: id });
    } else {
      updated = withAnalyte(row, choice);
    }
    update(updated);
    await suggestReference(updated);
  }

  /** Only fires for a blank row: fetches and applies the analyte's most recent unit/range, unless
   * the user has already typed something into those fields while the fetch was in flight. */
  async function suggestReference(row: EditableRow) {
    if (row.unit !== '' || row.refMinText !== '' || row.refMaxText !== '' || row.refText !== '')
      return;
    const ref: AnalyteRef | null = row.analyteId
      ? { kind: 'catalog', id: row.analyteId }
      : row.customAnalyteId
        ? { kind: 'custom', id: row.customAnalyteId }
        : null;
    if (!ref) return;
    const latest = await reports.latestReferenceFor(ref);
    if (!latest) return;
    setRows((all) =>
      all.map((r) => {
        if (r.key !== row.key) return r;
        if (r.unit !== '' || r.refMinText !== '' || r.refMaxText !== '' || r.refText !== '')
          return r;
        return withSuggestedReference(r, latest);
      }),
    );
  }

  async function save(overrideDuplicate = false) {
    setTriedToSave(true);
    setSaveError(null);
    if (savingRef.current) return;
    if (sampleDate === '' || brokenCount > 0 || rows.length === 0 || !session) return;
    if (!overrideDuplicate) {
      const candidates = await reports.findDuplicates({
        sampleDate,
        lab: lab.trim(),
        fileHash: session.mode === 'import' ? session.file.fileHash : undefined,
      });
      const found = candidates.find(
        (candidate) => !(session.mode === 'edit' && candidate.id === session.reportId),
      );
      if (found) {
        setDuplicate(found);
        return;
      }
    }
    setDuplicate(null);
    savingRef.current = true;
    setSaving(true);
    const createdIds: string[] = [];
    try {
      const usedPendingIds = new Set(
        rows
          .map((row) => row.customAnalyteId)
          .filter((id): id is string => id !== null && isPendingCustomId(id)),
      );
      const idMap = new Map<string, string>();
      try {
        for (const pending of pendingCustom) {
          if (!usedPendingIds.has(pending.id)) continue;
          const created = await customAnalytes.create(pending.input);
          idMap.set(pending.id, created.id);
          createdIds.push(created.id);
        }
        const finalRows = rows.map((row) =>
          row.customAnalyteId !== null && idMap.has(row.customAnalyteId)
            ? { ...row, customAnalyteId: idMap.get(row.customAnalyteId)! }
            : row,
        );
        const measurements = finalRows.map(editableToMeasurementInput);

        if (session.mode === 'edit') {
          await reports.updateReport(
            session.reportId,
            {
              sampleDate,
              lab: lab.trim(),
              type,
              source: session.report.source,
              adapterId: session.report.adapterId,
              notes: notes.trim(),
              fileHash: session.report.fileHash,
            },
            measurements,
          );
          navigate(`/reports/${session.reportId}?updated=1`, { replace: true });
        } else {
          const keepFile = await settings.get('keepOriginalFile');
          const attachments =
            session.mode === 'import' && keepFile
              ? [
                  {
                    data: session.file.data,
                    mimeType: session.file.mimeType,
                    fileName: session.file.fileName,
                  },
                ]
              : [];
          const id = await reports.saveReport(
            {
              sampleDate,
              lab: lab.trim(),
              type,
              source: session.mode === 'import' ? 'parser' : 'manuale',
              adapterId: session.mode === 'import' ? session.draft.adapterId : null,
              notes: notes.trim(),
              fileHash: session.mode === 'import' ? session.file.fileHash : null,
            },
            measurements,
            attachments,
          );
          navigate(`/reports/${id}?saved=1`, { replace: true });
        }
        setSession(null);
      } catch (error) {
        // Roll back every analyte created in this attempt, even if some fails,
        // then surface the original error rather than a rollback failure.
        await Promise.allSettled(createdIds.map((created) => customAnalytes.remove(created)));
        throw error;
      }
    } catch {
      setSaving(false);
      setSaveError(it.verify.saveFailed);
      return;
    } finally {
      savingRef.current = false;
    }
  }

  const discardTo = session.mode === 'edit' ? `/reports/${session.reportId}` : '/import';
  const picking = rows.find((row) => row.key === pickingFor);

  return (
    <div className={styles.frame}>
      <main ref={main} tabIndex={-1} className={styles.scroll}>
        <header className={shared.pageHead}>
          <h1 className={`display ${shared.pageTitle}`}>{it.verify.title}</h1>
          <p className={shared.lead}>{it.verify.lead(rows.length, pendingCount)}</p>
        </header>

        <div className={styles.fields}>
          <div className={shared.field}>
            <label htmlFor="sample-date">{it.verify.sampleDate}</label>
            <input
              id="sample-date"
              type="date"
              className={shared.input}
              value={sampleDate}
              aria-invalid={(triedToSave && sampleDate === '') || undefined}
              onChange={(event) => {
                setSampleDate(event.target.value);
                setDuplicate(null);
              }}
            />
          </div>
          <div className={shared.field}>
            <label htmlFor="report-type">{it.verify.type}</label>
            <select
              id="report-type"
              className={shared.input}
              value={type}
              onChange={(event) => setType(event.target.value as ReportType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {it.reportType[t]}
                </option>
              ))}
            </select>
          </div>
          <div className={`${shared.field} ${styles.wide}`}>
            <label htmlFor="report-lab">{it.verify.lab}</label>
            <input
              id="report-lab"
              className={shared.input}
              value={lab}
              list="known-labs"
              autoComplete="off"
              onChange={(event) => {
                setLab(event.target.value);
                setDuplicate(null);
              }}
            />
            <datalist id="known-labs">
              {labs.status === 'ready' &&
                labs.data.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div className={`${shared.field} ${styles.wide}`}>
            <label htmlFor="report-notes">{it.verify.notes}</label>
            <textarea
              id="report-notes"
              className={shared.input}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <div className={shared.chips} role="group" aria-label={it.verify.title}>
          <button
            type="button"
            className={shared.chip}
            aria-pressed={onlyPending}
            onClick={() => setOnlyPending(true)}
          >
            {it.verify.filterPending(pendingCount)}
          </button>
          <button
            type="button"
            className={shared.chip}
            aria-pressed={!onlyPending}
            onClick={() => setOnlyPending(false)}
          >
            {it.verify.filterAll(rows.length)}
          </button>
        </div>

        <div className={styles.rows}>
          {visible.length === 0 && <p className={styles.none}>{it.verify.nothingPending}</p>}
          {visible.map((row) => (
            <VerifyRow
              key={row.key}
              row={row}
              custom={customList}
              showProblems={triedToSave}
              onChange={update}
              onDelete={() => setRows((all) => all.filter((r) => r.key !== row.key))}
              onPickAnalyte={() => setPickingFor(row.key)}
              onUseSuggestion={(analyteId) => update(withAnalyte(row, { analyteId }))}
            />
          ))}
        </div>

        <div className={styles.add}>
          <button
            type="button"
            className={shared.secondary}
            onClick={() => {
              setRows((all) => [...all, emptyEditableRow(newKey())]);
              setOnlyPending(false);
            }}
          >
            {it.verify.addRow}
          </button>
        </div>
      </main>

      <footer className={styles.savebar}>
        {triedToSave && (sampleDate === '' || brokenCount > 0) && (
          <p className={styles.blocked} role="alert">
            {sampleDate === '' ? it.verify.missingDate : it.verify.fixRows(brokenCount)}
          </p>
        )}
        {duplicate && (
          <div className={styles.blocked} role="alert">
            <p>{it.verify.duplicateTitle(formatDateLong(duplicate.sampleDate))}</p>
            <div className={styles.buttons}>
              <Link to={`/reports/${duplicate.id}`} className={shared.secondary}>
                {it.importer.openExisting}
              </Link>
              <button type="button" className={shared.textButton} onClick={() => void save(true)}>
                {it.verify.saveAnyway}
              </button>
            </div>
          </div>
        )}
        {saveError && (
          <p className={styles.blocked} role="alert">
            {saveError}
          </p>
        )}
        <div className={styles.buttons}>
          <button
            type="button"
            className={shared.textButton}
            onClick={() => {
              // Same race as save() above: the flag keeps the !session guard from bouncing
              // to /import while this navigation is in flight.
              setDiscarding(true);
              setSession(null);
              navigate(discardTo, { replace: true });
            }}
          >
            {it.verify.discard}
          </button>
          <button
            type="button"
            className={`${shared.primary} ${styles.save}`}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? it.verify.saving : it.verify.save}
          </button>
        </div>
      </footer>

      {picking && (
        <AnalytePicker
          initialQuery={
            picking.analyteId ? (getAnalyte(picking.analyteId)?.name ?? picking.name) : picking.name
          }
          custom={customList}
          onChoose={(choice) => void choose(choice)}
          onClose={() => setPickingFor(null)}
        />
      )}
    </div>
  );
}
