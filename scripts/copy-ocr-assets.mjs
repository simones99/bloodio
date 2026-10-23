// Copies the OCR engine and its models from node_modules to public/ocr/<hash>/, so the app serves
// them from its own origin in a folder named after their content. public/ocr/ is git-ignored: these
// binaries never enter the repository. Emptied first, so it only ever holds the current folder.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OCR_ASSETS, OCR_DIR, ocrHash, sourcePath } from './ocr-assets.mjs';

const hash = ocrHash();
await rm(OCR_DIR, { recursive: true, force: true });
for (const asset of OCR_ASSETS) {
  const target = join(OCR_DIR, hash, asset.to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(sourcePath(asset), target);
}
console.log(`copy-ocr-assets: ${OCR_ASSETS.length} files in ${OCR_DIR}/${hash}/`);
