/**
 * What each rubric is called on screen (round 3 E7, Patrick 2026-10-05:
 * "we need distinctions between duplicate names for the user to navigate
 * the app easier").
 *
 * Names are not unique anywhere -- not in the schema, the API or the editor
 * -- and the shared database holds ten copies called "Renamed by smoke
 * test". So where a name repeats, the second reads "(2)", the third "(3)",
 * the way Windows numbers a file. The first stays bare, and the stored name
 * never changes: this is a label, not a rename.
 *
 * Numbered over the whole list, templates first, then copies, each in
 * group_frameworks' order (name, then key). So a template never gains a
 * number because of a copy, and the same rubric has the same number on
 * Frameworks and in the editor's picker, which both read GET /frameworks.
 * A number skips any name somebody actually typed, so "Foo (2)" can't
 * appear twice.
 *
 * Beside framework-groups.ts for the same reason it is a file of its own:
 * it is a decision, and scripts/verify-select-framework.sh compiles and
 * calls it without a browser.
 */
import { group_frameworks, type Framework } from './framework-groups.ts';

/** Every rubric's on-screen name, by framework id. */
export function display_names(list: Framework[]): ReadonlyMap<string, string> {
  const { templates, copies } = group_frameworks(list);
  const taken = new Set(list.map((framework) => framework.name));
  const seen = new Set<string>();
  const names = new Map<string, string>();

  for (const framework of [...templates, ...copies]) {
    if (!seen.has(framework.name)) {
      seen.add(framework.name);
      names.set(framework.id, framework.name);
      continue;
    }

    let n = 2;
    while (taken.has(`${framework.name} (${n})`)) n++;
    const label = `${framework.name} (${n})`;
    taken.add(label);
    names.set(framework.id, label);
  }

  return names;
}

// A trailing " (n)" that a copy number would have added. Up to three digits,
// so "Team (2026)" keeps its year.
const COPY_NUMBER = / \(\d{1,3}\)$/;

/**
 * The name a new copy starts with (round 3 E12 and E7(b), Patrick
 * 2026-10-05: "Copy of copy of {framework}" looks "so dumb"; he chose
 * "(2)"). The base's name with the first free "(n)" from 2, the way
 * Windows names a second copy: free of every stored name and every
 * on-screen label, so it never collides with a number display_names already
 * shows. A copy of "X (2)" is "X (3)", never "X (2) (2)". The name is cut to
 * leave room for the number within max_length.
 *
 * Only a suggestion: the person can type any name, and the server keeps
 * whatever it is sent. The heading and the Saved copies group are what say
 * it's a copy (ADR #16 asks the UI to, not the name).
 */
export function free_name(
  base_name: string,
  list: Framework[],
  max_length: number,
): string {
  const root = base_name.replace(COPY_NUMBER, '');
  const taken = new Set([
    ...list.map((framework) => framework.name),
    ...display_names(list).values(),
  ]);

  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const name = `${root.slice(0, max_length - suffix.length)}${suffix}`;
    if (!taken.has(name)) return name;
  }
}
