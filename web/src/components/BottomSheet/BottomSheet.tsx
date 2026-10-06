import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import styles from './BottomSheet.module.css';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Movement before a press counts as a drag rather than a tap (CAP-38 R7). */
const DRAG_SLOP = 6;
/** Released past this share of the sheet's height, it closes. */
const CLOSE_SHARE = 0.25;
/** Or released faster than this, in CSS pixels per millisecond: a flick. */
const FLICK_SPEED = 0.6;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Swipe down to dismiss (CAP-38 R7). Pointer events, so touch, pen and
  // mouse share one path. Nothing here touches focus: a drag past the
  // threshold closes through the same onClose as Escape and the backdrop,
  // so the focus effects below behave exactly as they do for those.
  // `moved` lives here, not in state: a quick flick can deliver its last
  // move and its release before React renders, and the release must still
  // know the sheet was dragged.
  const drag = useRef<{
    id: number;
    start_x: number;
    start_y: number;
    start_t: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  // A sheet closed mid-drag (Escape, say) opens next time at rest.
  const [was_open, setWasOpen] = useState(open);
  if (open !== was_open) {
    setWasOpen(open);
    setOffset(0);
  }

  // A ref, not a dependency: most callers pass an inline onClose, whose
  // identity changes every render. Depending on it directly would re-run
  // this whole effect (and steal focus back into the sheet) on every
  // parent re-render while open, not just on open/close.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // useLayoutEffect, not useEffect: a sheet's own content (ExportSheet is
  // the real case, CAP-23) can carry its own mount effect that moves focus
  // to a more specific control once it renders ("every state names where
  // focus lives", ExportSheet.tsx). Passive effects run child-before-parent,
  // so a child's useEffect fires before this one if this were also a
  // useEffect -- by the time this ran, document.activeElement would already
  // be whatever the child just focused, not the real trigger, and
  // `previouslyFocused` would capture the wrong element. That was a real,
  // reproducible bug: Escape silently failed to restore focus, because the
  // wrongly-captured element was itself inside the sheet and got removed
  // along with it, leaving focus on <body>. Layout effects run before ANY
  // passive effect anywhere in the tree, so capturing here instead
  // guarantees nothing has touched focus yet, however this sheet's own
  // content manages it afterwards.
  //
  // A second, related effect of this ordering: which element gets INITIAL
  // focus on open is now whatever the child's own focus-management effect
  // chooses, since this generic first-focusable fallback captures
  // `previouslyFocused` before the child's passive effect runs but does not
  // itself re-run afterwards. Export Sheet's "Request a PDF export" button
  // ends up focused, rather than racing this effect to the first chip in
  // document order. That matches Export Sheet's own stated intent and is an
  // improvement, not a bug -- worth knowing if a future reader is debugging
  // "why does focus land here now".
  useLayoutEffect(() => {
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

  // Touch: the sheet's CSS lets the browser pan (pan-y), so a finger moving
  // down on content at the top would scroll rather than drag, and the
  // browser would cancel the pointer. Cancelling that touchmove keeps the
  // gesture ours. Only while a drag is armed (on_pointer_down accepted it)
  // and only downwards, so content still scrolls up and pinch still zooms.
  // touch-action: pan-down says the same in CSS, but Gecko lacks it.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return;
    let last_y = 0;
    const start = (event: TouchEvent) => {
      last_y = event.touches[0]?.clientY ?? 0;
    };
    const move = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? last_y;
      const downwards = y > last_y;
      last_y = y;
      if (drag.current && downwards && event.touches.length === 1 && event.cancelable) {
        event.preventDefault();
      }
    };
    sheet.addEventListener('touchstart', start, { passive: true });
    sheet.addEventListener('touchmove', move, { passive: false });
    return () => {
      sheet.removeEventListener('touchstart', start);
      sheet.removeEventListener('touchmove', move);
    };
  }, [open]);

  if (!open) return null;

  // Where a drag may start. The grab strip, always. A finger or pen on
  // the content too, while it is scrolled to the top. Never a mouse on the
  // content (it is selecting text), and never a form control.
  function on_pointer_down(event: PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable]')) return;
    const on_grab = target.closest('[data-sheet-grab]') !== null;
    if (!on_grab && (event.pointerType === 'mouse' || sheet.scrollTop > 0)) return;
    drag.current = {
      id: event.pointerId,
      start_x: event.clientX,
      start_y: event.clientY,
      start_t: event.timeStamp,
      height: sheet.getBoundingClientRect().height,
      moved: false,
    };
  }

  function on_pointer_move(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dy = event.clientY - state.start_y;
    if (!state.moved) {
      // Still a tap, an upward scroll or a sideways gesture: not ours.
      if (dy < DRAG_SLOP || dy < Math.abs(event.clientX - state.start_x)) return;
      state.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the browser no longer tracks; the drag still works
        // while it stays over the sheet.
      }
    }
    setOffset(Math.max(0, dy));
  }

  function on_pointer_end(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    const dy = Math.max(0, event.clientY - state.start_y);
    setOffset(0);
    if (!state.moved) return;

    // The click that follows a real drag must not land on whatever button
    // the pointer ended over.
    const sheet = event.currentTarget;
    const swallow = (click: Event) => {
      click.stopPropagation();
      click.preventDefault();
    };
    sheet.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => sheet.removeEventListener('click', swallow, { capture: true }), 0);

    const speed = dy / Math.max(1, event.timeStamp - state.start_t);
    if (dy > state.height * CLOSE_SHARE || speed > FLICK_SPEED) onCloseRef.current();
  }

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();

  return (
    <div className={styles.backdrop} onClick={() => onCloseRef.current()}>
      <div
        ref={sheetRef}
        className={offset > 0 ? `${styles.sheet} ${styles.dragging}` : styles.sheet}
        style={offset > 0 ? { transform: `translateY(${offset}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={stopPropagation}
        onPointerDown={on_pointer_down}
        onPointerMove={on_pointer_move}
        onPointerUp={on_pointer_end}
        onPointerCancel={on_pointer_end}
      >
        {/* The visual affordance and the main drag target. Decoration to
            a screen reader, which closes the sheet with Escape. */}
        <div className={styles.grab} data-sheet-grab aria-hidden="true">
          <span className={styles.handle} />
        </div>
        {title && <h2 className={styles.title}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
