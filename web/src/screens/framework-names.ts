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
