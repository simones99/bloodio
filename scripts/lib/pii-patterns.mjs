// Finds personal-data patterns in a text item: titled names, birth dates, tax
// codes and phone numbers that are not the anonymization placeholders.
// The title is matched in any letter case, the name only when capitalized: a regex-wide `i` flag
// would also case-fold the name's character classes and flag "Dott. in medicina di laboratorio".
const TITLE_PATTERN =
  /\b(?:[Dd][Oo][Tt][Tt]\.[Ss][Ss][Aa]|[Pp][Rr][Oo][Ff]\.[Ss][Ss][Aa]|[Dd][Oo][Tt][Tt]\.|[Dd][Rr]\.|[Pp][Rr][Oo][Ff]\.)\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+)*)?/g;
const BIRTH_DATE_PATTERN = /Nat[oa]\s+il:?\s*(\d{2}\/\d{2}\/\d{4})/gi;
const TAX_CODE_PATTERN = /[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/i;
const PHONE_PATTERN = /(?<![\d:])(?:\+39[ ./]?)?\d(?:[ ./]?\d){8,10}(?![\d:])/g;

/**
 * @param {string} text
 * @returns {string[]} problem codes found in the text (empty = clean)
 */
export function findPersonalPatterns(text) {
  const problems = new Set();

  for (const match of text.matchAll(TITLE_PATTERN)) {
    const name = match[1]?.trim();
    if (name && name !== 'Nome Cognome') problems.add('titled-name');
  }

  for (const match of text.matchAll(BIRTH_DATE_PATTERN)) {
    if (match[1] !== '01/01/1980') problems.add('birth-date');
  }

  if (TAX_CODE_PATTERN.test(text)) problems.add('tax-code');

  if (text.match(PHONE_PATTERN)) problems.add('phone');

  return [...problems];
}
