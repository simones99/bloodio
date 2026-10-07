import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative by default, so the build also runs from the file system or any sub-path.
  // The GitHub Pages workflow sets BASE_PATH=/bloodio/; local dev and preview are unaffected.
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
});
