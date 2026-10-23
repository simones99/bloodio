import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { ocrDefine } from './scripts/ocr-assets.mjs';

export default defineConfig({
  plugins: [react()],
  // The same build constants as vite.config.ts.
  define: ocrDefine(),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    setupFiles: ['tests/setup-indexeddb.ts'],
  },
});
