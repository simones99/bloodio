// Browser-only entry to pdf.js. The worker is bundled and served from the same origin.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { OpenPdf } from './ingest-file';

GlobalWorkerOptions.workerSrc = workerUrl;

export const openPdf: OpenPdf = (data) =>
  getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 }).promise;
