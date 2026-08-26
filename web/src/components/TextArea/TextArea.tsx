import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import styles from './TextArea.module.css';

export type TextAreaSaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

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

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const updateStatus = (next: TextAreaSaveStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    onChange(next);
    pendingValueRef.current = next;
    clearTimeout(timeoutRef.current);
    updateStatus('saving');

    timeoutRef.current = setTimeout(() => {
      const toSave = pendingValueRef.current;
      saveRef
        .current(toSave)
        .then(() => {
          // A later keystroke may have started a newer save already; only
          // this save's own result should be allowed to set the status.
          if (pendingValueRef.current === toSave) updateStatus('saved');
        })
        .catch(() => {
          if (pendingValueRef.current === toSave) updateStatus('failed');
        });
    }, debounceMs);
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
