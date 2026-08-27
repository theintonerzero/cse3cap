import { useEffect, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // A ref, not a dependency: most callers pass an inline onClose, whose
  // identity changes every render. Depending on it directly would re-run
  // this whole effect (and steal focus back into the sheet) on every
  // parent re-render while open, not just on open/close.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const firstFocusable = sheet?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? sheet)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheet) return;

      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();

  return (
    <div className={styles.backdrop} onClick={() => onCloseRef.current()}>
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={stopPropagation}
      >
        {title && <h2 className={styles.title}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
