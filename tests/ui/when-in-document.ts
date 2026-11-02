/**
 * Resolves in the MutationObserver callback that first finds the element: right after the
 * commit that adds it, before React's scheduler runs any passive effect.
 */
export function whenInDocument(find: () => HTMLElement | null) {
  return new Promise<HTMLElement>((resolve) => {
    const observer = new MutationObserver(() => {
      const found = find();
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
