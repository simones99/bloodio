import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Standard modal focus behaviour: traps Tab inside the container, calls onClose on Escape,
 * and restores focus to whatever had it before the modal opened once it unmounts.
 */
export function useModalFocus<T extends HTMLElement>(
  onClose: () => void,
): { ref: RefObject<T | null>; onKeyDown: (event: KeyboardEvent) => void } {
  const container = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus();
  }, []);

  function trapTab(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !container.current) return;
    const items = Array.from(container.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
    else trapTab(event);
  }

  return { ref: container, onKeyDown };
}
