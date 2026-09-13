/**
 * Getting a seeded token into the app, and swapping which one is in use.
 *
 * There is no login screen in this MVP (ADR #15). Three Sanctum tokens are
 * seeded server-side, one per role, and `php artisan db:seed` prints each one
 * once -- it does not write a file. ~/reflection-diary-tokens.txt is the
 * name a developer saves that output under, and the only reason it means
 * anything is that scripts/*.sh read it back. This is where the tokens get
 * pasted.
 *
 * One component, two modes, which is the pattern /add-screen prescribes for
 * the student and assessor steppers rather than two builds:
 *
 *   screen   nothing usable is stored. Full page, the token entry state.
 *            This is where a 401 lands (criterion 5)
 *   sheet    inside the header's BottomSheet. The switcher (criterion 4)
 *
 * The slot labels are hints about which token to paste, matching the role
 * column of web/README.md's seeded-user table. They are NOT roles and
 * nothing reads them as roles; see the comment at the top of tokens.ts. What
 * a user may do comes from GET /auth/me, per gig.
 */
import { useState } from 'react';

import { Button, Card, Chip } from '../components/index.ts';
import { SLOT_IDS, SLOT_LABEL, type SlotId } from './tokens.ts';
import { useSession } from './useSession.ts';
import styles from './TokenGate.module.css';

export type TokenGateMode = 'screen' | 'sheet';

export interface TokenGateProps {
  mode: TokenGateMode;
  /** Called after a slot is chosen, so the sheet can close itself. */
  on_done?: () => void;
}

export function TokenGate({ mode, on_done }: TokenGateProps) {
  const { slots, active_slot, last_sign_in_rejected, sign_in_with, switch_to } =
    useSession();
  const [pasting_into, setPastingInto] = useState<SlotId | null>(null);
  const [draft, setDraft] = useState('');

  function choose(slot: SlotId) {
    if (slots[slot]) {
      switch_to(slot);
      on_done?.();
      return;
    }
    setPastingInto(slot);
    setDraft('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!pasting_into || draft.trim() === '') return;

    sign_in_with(pasting_into, draft);
    setPastingInto(null);
    setDraft('');
    on_done?.();
  }

  const body = (
    <div className={styles.gate}>
      <p className={styles.intro}>
        {mode === 'screen'
          ? 'This demo has no login screen. Paste one of the three seeded tokens to begin.'
          : 'Act as a different seeded user.'}
      </p>

      <div className={styles.slots}>
        {SLOT_IDS.map((slot) => (
          <Chip key={slot} selected={slot === active_slot} on_click={() => choose(slot)}>
            {SLOT_LABEL[slot]}
            {slots[slot] ? '' : ' +'}
          </Chip>
        ))}
      </div>

      {pasting_into && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label} htmlFor="token-input">
            Paste the {SLOT_LABEL[pasting_into].toLowerCase()} token
          </label>
          <input
            id="token-input"
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="1|xxxxxxxx..."
          />
          <Button type="submit" disabled={draft.trim() === ''}>
            Use this token
          </Button>
        </form>
      )}

      {last_sign_in_rejected && (
        <p className={styles.rejected} role="alert">
          That token was rejected. Check you pasted the right one.
        </p>
      )}

      <p className={styles.hint}>
        <code>php artisan db:seed</code> prints these once; it does not write a file. Save
        that output as <code>~/reflection-diary-tokens.txt</code> yourself. Whatever you
        paste here is kept for this browser tab only.
      </p>
    </div>
  );

  // In sheet mode the BottomSheet is already a surface; a Card inside it
  // would be a box in a box.
  return mode === 'screen' ? (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Reflection Diary</h1>
      <Card>{body}</Card>
    </main>
  ) : (
    body
  );
}
