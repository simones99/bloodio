/** The folder of the OCR files under ocr/: a hash of their content (scripts/ocr-assets.mjs). */
declare const __OCR_HASH__: string;
/** Each OCR file's size in bytes, by its path under ocr/<hash>/. */
declare const __OCR_SIZES__: Readonly<Record<string, number>>;
