/**
 * A button that opens a short list of actions (CAP-38 R4).
 *
 * The WAI-ARIA menu button pattern: Enter, Space or ArrowDown open on the
 * first item, ArrowUp on the last; Up/Down move and wrap; Home/End jump;
 * Escape closes and returns focus to the trigger; Tab closes and lets focus
 * move on; a click outside closes.
 *
 * Choosing an item closes the menu and focuses the trigger before the
 * item's action runs. BottomSheet records whatever has focus when it opens
 * as the place to return focus to, so a sheet opened from here goes back
 * to the trigger rather than to an item that no longer exists.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './Menu.module.css';

export type MenuItem =
  | { kind: 'item'; label: string; on_select: () => void }
  | { kind: 'checkbox'; label: string; checked: boolean; on_select: () => void };

export interface MenuProps {
  /** The trigger's accessible name; the trigger itself is an icon. */
  label: string;
  items: MenuItem[];
}

export function Menu({ label, items }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item_refs = useRef<(HTMLButtonElement | null)[]>([]);
  const menu_id = useId();

  useEffect(() => {
    if (open) item_refs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function open_at(index: number) {
    setActive(index);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  function on_trigger_key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open_at(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open_at(items.length - 1);
    }
  }

  function on_menu_key(event: KeyboardEvent<HTMLDivElement>) {
    const last = items.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  function choose(item: MenuItem) {
    close(true);
    item.on_select();
  }

  return (
    <div ref={wrapper} className={styles.wrapper}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menu_id : undefined}
        onClick={() => (open ? close(false) : open_at(0))}
        onKeyDown={on_trigger_key}
      >
        <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem" aria-hidden="true">
          <circle cx="12" cy="5" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="19" r="2" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          id={menu_id}
          role="menu"
          aria-label={label}
          className={styles.menu}
          onKeyDown={on_menu_key}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(node) => {
                item_refs.current[index] = node;
              }}
              type="button"
              role={item.kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={item.kind === 'checkbox' ? item.checked : undefined}
              tabIndex={index === active ? 0 : -1}
              className={styles.item}
              onClick={() => choose(item)}
            >
              <span>{item.label}</span>
              {item.kind === 'checkbox' && (
                <span
                  className={item.checked ? `${styles.switch} ${styles.on}` : styles.switch}
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
