import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent, Ref } from 'react';
import styles from './TextArea.module.css';

export type TextAreaSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** For a parent that must not lose the last edit (CAP-52): flush() sends a
 * pending edit now rather than waiting out the debounce, and resolves when
 * the newest save settles, rejecting if it failed. */
export interface TextAreaHandle {
  flush: () => Promise<void>;
}

export interface TextAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => Promise<void>;
  /** Fires alongside the internal status, so a consumer (e.g. the entry
   * stepper) can react to a failed save without polling rendered text. */
  onStatusChange?: (status: TextAreaSaveStatus) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Debounce before onSave fires after the user stops typing. */
  debounceMs?: number;
  id?: string;
  ref?: Ref<TextAreaHandle>;
}

const STATUS_LABEL: Record<TextAreaSaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Could not save',
};

export function TextArea({
  value,
  onChange,
  onSave,
  onStatusChange,
  label,
  placeholder,
  disabled = false,
  debounceMs = 600,
  id,
  ref,
}: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [status, setStatus] = useState<TextAreaSaveStatus>('idle');

  // Refs, not state: the debounce timer and the in-flight value must not
  // trigger a render, and a stale closure over onSave would save an old
  // callback if the consumer passes a new one between keystrokes.
  const saveRef = useRef(onSave);
  const onStatusChangeRef = useRef(onStatusChange);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingValueRef = useRef(value);
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = (next: TextAreaSaveStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  };

  // One way to save, used by the debounce, flush() and unmount alike.
  const start_save = (): Promise<void> => {
    timeoutRef.current = undefined;
    const toSave = pendingValueRef.current;
    const saving = saveRef.current(toSave);
    inflightRef.current = saving;
    saving
      .then(() => {
        // A later keystroke may have started a newer save already; only
        // this save's own result should be allowed to set the status.
        if (pendingValueRef.current === toSave) updateStatus('saved');
      })
      .catch(() => {
        if (pendingValueRef.current === toSave) updateStatus('failed');
      });
    return saving;
  };

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        return start_save();
      }
      return inflightRef.current ?? Promise.resolve();
    },
  }));

  // Leaving with an edit still waiting sends it rather than dropping it
  // (CAP-52). Nothing typed means no timer, so React's dev double-mount
  // sends nothing.
  useEffect(
    () => () => {
      if (timeoutRef.current === undefined) return;
      clearTimeout(timeoutRef.current);
      start_save().catch(() => {});
    },
    // start_save reads refs only, so the first render's copy is current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    onChange(next);
    pendingValueRef.current = next;
    clearTimeout(timeoutRef.current);
    updateStatus('saving');

    timeoutRef.current = setTimeout(start_save, debounceMs);
  };

  const statusId = `${fieldId}-status`;
  const statusClassName = [styles.status, status !== 'idle' ? styles[status] : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <textarea
        id={fieldId}
        className={styles.textarea}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        aria-describedby={status !== 'idle' ? statusId : undefined}
      />
      <span
        id={statusId}
        className={statusClassName}
        role={status === 'failed' ? 'alert' : undefined}
        aria-live="polite"
      >
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
