import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Measurement, Report } from '../../domain/types';
import type { IngestedFile } from '../../ingest/ingest-file';
import type { DraftReport } from '../../parsers/types';

/** What travels from the import page to the verification page. Memory only: nothing unconfirmed is stored. */
export type ImportSession =
  | { mode: 'import'; file: IngestedFile; draft: DraftReport }
  | { mode: 'manual' }
  | { mode: 'edit'; reportId: string; report: Report; measurements: Measurement[] };

interface ImportSessionValue {
  session: ImportSession | null;
  setSession(session: ImportSession | null): void;
}

const ImportSessionContext = createContext<ImportSessionValue | null>(null);

export function ImportSessionProvider({
  children,
  initialSession = null,
}: {
  children: ReactNode;
  /** For tests: seeds the session without going through the import page. */
  initialSession?: ImportSession | null;
}) {
  const [session, setSession] = useState<ImportSession | null>(initialSession);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return <ImportSessionContext.Provider value={value}>{children}</ImportSessionContext.Provider>;
}

export function useImportSession(): ImportSessionValue {
  const value = useContext(ImportSessionContext);
  if (!value) throw new Error('useImportSession must be used inside ImportSessionProvider');
  return value;
}
