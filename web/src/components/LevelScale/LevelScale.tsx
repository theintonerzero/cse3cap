import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import styles from './LevelScale.module.css';

export interface LevelScaleLevel {
  id: string;
  level_value: number;
  descriptor: string;
}

/** Someone's score on a shared, read-only scale: the student, or a reviewer. */
export interface LevelScaleMark {
  level_id: string;
  /** "You", "Dr Lee", "Jane N": shown beside their level's words. */
  who: string;
  tone: 'primary' | 'counter';
}

export interface LevelScaleProps {
  /** Names the scale, visibly and as the radio group's name. */
  label: string;
  levels: LevelScaleLevel[];
  /** The chosen level, or null when nothing is chosen yet. */
  value?: string | null;
  /** Purple is the student's own choice, green the assessor's (ADR #54). */
  tone?: 'primary' | 'counter';
  /**
   * Given only when the scale can be changed. `how` says whether a pointer
   * chose (save now) or the arrow keys did (save when they stop).
   */
  on_change?: (level_id: string, how: 'pointer' | 'key') => void;
  /** Called when focus leaves the scale, so a waiting choice can be sent. */
  on_leave?: () => void;
  /** Briefly unchangeable, while a choice is sent. */
  disabled?: boolean;
  /** Several people's scores on one read-only track, each with their words. */
  marks?: LevelScaleMark[];
  /** A small dot on another person's level, on a scale being chosen on. */
  marker?: { level_id: string; who: string } | null;
}

/**
 * A rubric's levels as one row of numbers, with the chosen level's words
 * beneath and every level's words one tap away (CAP-66, ADR #65). Replaces
 * the stacked pills, which took a line per level and two lists to compare
 * a self-score with a counter-score. Never hardcoded to a number of levels:
 * La Trobe's four and SFIA's seven render through the same row.
 */
export function LevelScale({
  label,
  levels,
  value = null,
  tone = 'primary',
  on_change,
  on_leave,
  disabled = false,
  marks,
  marker = null,
}: LevelScaleProps) {
  const label_id = useId();
  const list_id = useId();
  const interactive = !!on_change && !marks;
  // Open while nothing is chosen, so the rubric is read before a first choice.
  const [open, setOpen] = useState(interactive && value === null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const total = levels.length;
  const at = (id: string | null) => levels.find((level) => level.id === id) ?? null;

  function choose(index: number, how: 'pointer' | 'key') {
    const level = levels[index];
    if (!level || !on_change) return;
    on_change(level.id, how);
    setOpen(false);
    if (how === 'key') buttons.current[index]?.focus();
  }

  function on_key(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || disabled) return;
    // From the level that has focus, which is the one the person last moved
    // to, even when a failed save has put the chosen level back.
    const focused = buttons.current.indexOf(document.activeElement as HTMLButtonElement);
    const current =
      focused >= 0 ? focused : levels.findIndex((level) => level.id === value);
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: number | null = null;
    if (event.key in step)
      next = Math.min(
        total - 1,
        Math.max(0, (current < 0 ? 0 : current) + step[event.key]),
      );
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = total - 1;
    if (next === null) return;
    event.preventDefault();
    if (next !== current) choose(next, 'key');
  }

  const chosen = at(value);
  const focus_index = Math.max(
    0,
    levels.findIndex((level) => level.id === value),
  );
  const mark_class = (level_id: string) => {
    const on = (marks ?? []).filter((mark) => mark.level_id === level_id);
    if (on.length === 0) return '';
    const tones = new Set(on.map((mark) => mark.tone));
    if (tones.size > 1) return styles.both;
    return tones.has('counter') ? styles.counter : styles.primary;
  };

  // More levels than a narrow card has room for at the tap floor: the row
  // reaches into the card's side padding on a phone (see the CSS).
  const track_class = total > 5 ? `${styles.track} ${styles.many}` : styles.track;

  const track = marks ? (
    // Read-only and shared: the words lines below carry who chose what.
    <div className={track_class} aria-hidden="true">
      {levels.map((level) => (
        <span key={level.id} className={`${styles.level} ${mark_class(level.id)}`}>
          {level.level_value}
        </span>
      ))}
    </div>
  ) : (
    <div
      className={track_class}
      role="radiogroup"
      aria-labelledby={label_id}
      aria-readonly={interactive ? undefined : true}
      onKeyDown={on_key}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) on_leave?.();
      }}
    >
      {levels.map((level, index) => {
        const checked = level.id === value;
        const marked = marker?.level_id === level.id;
        return (
          <button
            key={level.id}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${level.level_value} of ${total}, ${level.descriptor}${
              marked ? `. ${marker.who} chose this level` : ''
            }`}
            tabIndex={interactive && index === focus_index ? 0 : -1}
            disabled={!interactive || disabled}
            className={`${styles.level} ${checked ? (tone === 'counter' ? styles.counter : styles.primary) : ''}`}
            onClick={() => choose(index, 'pointer')}
          >
            {level.level_value}
            {marked && <span className={styles.dot} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );

  const words = marks ? (
    // Names and numbers only (CAP-68): what a level means is one tap away,
    // under All levels, where it is said once rather than per person.
    <ul className={styles.who} aria-label="Who chose which level">
      {marks.map((mark) => {
        const level = at(mark.level_id);
        return (
          <li key={`${mark.who}-${mark.level_id}`}>
            <span
              className={`${styles.swatch} ${mark.tone === 'counter' ? styles.counter : styles.primary}`}
              aria-hidden="true"
            />
            <span className={styles.who_name}>
              {mark.who} · {level?.level_value ?? '–'}
            </span>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className={chosen ? styles.words : `${styles.words} ${styles.muted}`}>
      {chosen
        ? `${chosen.level_value} · ${chosen.descriptor}`
        : interactive
          ? 'No level yet. Pick the one that fits what you did.'
          : 'No level chosen.'}
    </p>
  );

  return (
    <div
      className={styles.scale}
      // A shared scale has no radios; the group carries its name instead.
      role={marks ? 'group' : undefined}
      aria-labelledby={marks ? label_id : undefined}
    >
      <p className={styles.label} id={label_id}>
        {label}
      </p>
      {track}
      {marker && interactive && (
        <p className={styles.marker_note}>
          <span className={styles.marker_swatch} aria-hidden="true" />
          {marker.who} chose {at(marker.level_id)?.level_value ?? '–'}
        </p>
      )}
      <div className={styles.words_row}>
        {words}
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls={list_id}
          onClick={() => setOpen((was) => !was)}
        >
          {open ? 'Hide levels' : 'All levels'}
        </button>
      </div>
      <ol className={styles.list} id={list_id} hidden={!open}>
        {levels.map((level) => {
          // On a shared scale, whose level each one is.
          const whose = (marks ?? [])
            .filter((mark) => mark.level_id === level.id)
            .map((mark) => mark.who);
          const on = level.id === value || whose.length > 0;
          return (
            <li key={level.id} className={on ? styles.list_on : undefined}>
              <span className={styles.list_n}>{level.level_value}</span>
              <span>
                {level.descriptor}
                {whose.length > 0 && (
                  <span className={styles.list_who}> · {whose.join(', ')}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
