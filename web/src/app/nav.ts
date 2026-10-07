/**
 * Where someone can go in the diary, from what the server said they are.
 *
 * Moved out of AppShell.tsx (CAP-51) so the Alumable demo home offers a
 * reviewer exactly the places the shell's own nav would, from one rule rather
 * than a copy of the role list. It decides only what is drawn: the 403 from
 * the API is the rule (docs/Frontend-and-Backend.md, "Roles never cross").
 *
 * No React here, as in tokens.ts and diary-return.ts.
 */
import type { SessionUser } from '../session/useSession.ts';

export interface NavItem {
  to: string;
  label: string;
}

/** ADR #17 maps the educator to the supervisor role, which is why frameworks sit there. */
export function nav_items_for(me: SessionUser): NavItem[] {
  const roles = new Set(me.participations.map((participation) => participation.role));

  const items: NavItem[] = [];

  if (roles.has('student')) {
    items.push({ to: '/', label: 'Diary' });
  }

  if (roles.has('assessor') || roles.has('supervisor') || roles.has('employer')) {
    items.push({ to: '/review-queue', label: 'Review queue' });
  }

  if (roles.has('supervisor')) {
    items.push({ to: '/frameworks', label: 'Frameworks' });
  }

  return items;
}
