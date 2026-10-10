/**
 * A focused textarea is shown whole, clear of the sticky bars (CAP-61).
 *
 * index.css gives the page scroll-padding at the top and bottom so a focused
 * field lands clear of the app bar and the phone's sticky action bar
 * (CAP-38). Chromium honours that for a textarea only as far as its caret:
 * it scrolls the first line into view and can leave the rest of the box
 * under the action bar. Scrolling the box itself, to the nearest position,
 * applies the same scroll-padding to all of it.
 */
export function initRevealFocusedField(): void {
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLTextAreaElement) {
      event.target.scrollIntoView({ block: 'nearest' });
    }
  });
}
