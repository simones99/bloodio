/** Lower-case, accent-free, punctuation-free spelling used to compare printed names. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%#]+/g, ' ')
    .trim();
}
