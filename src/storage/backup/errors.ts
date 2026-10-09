/**
 * An export file that cannot be imported. Kept apart from the backup service so the UI can check
 * `instanceof ImportError` without loading zod and the export schema.
 */
export class ImportError extends Error {
  constructor(
    readonly code: 'invalid' | 'too-new',
    readonly issues: string[],
  ) {
    super(code === 'too-new' ? 'Export created by a newer app version' : 'Invalid export file');
    this.name = 'ImportError';
  }
}
