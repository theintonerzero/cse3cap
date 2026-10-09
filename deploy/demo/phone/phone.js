// The presenter's phone frame (CAP-55). Everything that makes the live app
// feel like it is on a phone is done from here, on the same origin, so the
// product's own code never changes: scaling the device to the window, the
// status bar's clock and colours, hidden scrollbars, a finger cursor, and
// click-and-drag that scrolls like a swipe.
const device = document.querySelector('.device');
const screen = document.querySelector('.screen');
const frame = document.querySelector('.screen iframe');
const clock = document.querySelector('.clock');
const MARGIN = 48;

// ---- The device fills the window ------------------------------------------
function fit() {
  // offsetWidth and offsetHeight ignore the transform, so this never compounds.
  const scale = Math.min(
    (window.innerHeight - MARGIN) / device.offsetHeight,
    (window.innerWidth - MARGIN) / device.offsetWidth,
  );
  device.style.setProperty('--scale', String(Math.max(0.3, scale)));
}
window.addEventListener('resize', fit);
fit();

// ---- The status bar's clock -----------------------------------------------
function tick() {
  const now = new Date();
  clock.textContent = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}`;
}
tick();
setInterval(tick, 15000);

// ---- System bars in the app's colours ---------------------------------------
// Android paints the status and navigation bars in the app's own colours, so
// they follow the app's header and bottom bar, light theme or dark.
function backgroundAt(doc, x, y) {
  let el = doc.elementFromPoint(x, y);
  while (el) {
    const bg = doc.defaultView.getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
    el = el.parentElement;
  }
  return 'rgb(255, 255, 255)';
}

function inkFor(bg) {
  const [r, g, b] = (bg.match(/\d+(\.\d+)?/g) || ['255', '255', '255']).map(Number);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.55 ? '#202020' : '#f0f0f0';
}

function paintBars() {
  const doc = frame.contentDocument;
  if (!doc || !doc.body) return;
  const top = backgroundAt(doc, 192, 1);
  const bottom = backgroundAt(doc, 192, frame.clientHeight - 2);
  screen.style.setProperty('--bar-bg', top);
  screen.style.setProperty('--bar-fg', inkFor(top));
  screen.style.setProperty('--nav-bg', bottom);
  screen.style.setProperty('--nav-fg', inkFor(bottom));
}
setInterval(paintBars, 400);

// ---- Inside the app: no scrollbars, a finger cursor --------------------------
// A soft round dot, read as a fingertip rather than a mouse pointer.
const FINGER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Ccircle cx='14' cy='14' r='11' fill='rgba(30,30,30,0.28)' stroke='rgba(255,255,255,0.85)' stroke-width='2'/%3E%3C/svg%3E\") 14 14, auto";

const PHONE_STYLE = `
  html, body { overscroll-behavior: none !important; }
  html, body, * { scrollbar-width: none !important; }
  *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  html, html * { cursor: ${FINGER} !important; }
  html.phone-swiping, html.phone-swiping * { user-select: none !important; }
`;

// ---- Android's edge stretch ---------------------------------------------------
// Android 12+ has no bounce and no gap: pulling past the top or bottom
// stretches the content a little, and it springs back. The browser's own
// bounce is off inside the app (overscroll-behavior), and the stretch is drawn
// here on the frame itself, so nothing inside the app (its floating buttons
// included) moves relative to anything else.
const STRETCH_MAX = 0.06; // at most a 6% stretch, however far the pull
let settleTimer = 0;

function stretch(pull, edge) {
  const amount = 1 + STRETCH_MAX * (1 - Math.exp(-pull / 240));
  frame.style.transition = 'none';
  frame.style.transformOrigin = edge === 'top' ? 'center top' : 'center bottom';
  frame.style.transform = `scaleY(${amount})`;
}

function settle() {
  frame.style.transition = 'transform 360ms cubic-bezier(0.2, 0.9, 0.3, 1)';
  frame.style.transform = '';
}

// A fling that reaches an edge stretches by its speed, then springs back.
function bump(velocity, edge) {
  stretch(Math.min(240, Math.abs(velocity) * 14), edge);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 90);
}

function atTop(scroller) {
  return scroller.scrollTop <= 0;
}

function atBottom(scroller) {
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
}

// ---- Click-and-drag scrolls, like a swipe ------------------------------------
const START_AFTER = 6; // px before a press becomes a swipe, so taps stay taps
const FRICTION = 0.94; // momentum lost per frame after release

function scrollerFor(el, doc) {
  for (let node = el; node && node !== doc.documentElement; node = node.parentElement) {
    const style = doc.defaultView.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return doc.scrollingElement || doc.documentElement;
}

function isTypingTarget(el) {
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

function installSwipe(win) {
  const doc = win.document;
  let press = null; // { y, lastY, lastT, velocity, scroller, swiping }
  let glide = 0;
  let swallowClick = false;

  doc.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || isTypingTarget(event.target)) return;
    win.cancelAnimationFrame(glide);
    press = {
      y: event.clientY,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      scroller: scrollerFor(event.target, doc),
      swiping: false,
      pull: 0, // > 0 pulling down past the top, < 0 pulling up past the bottom
    };
  });

  doc.addEventListener('pointermove', (event) => {
    if (!press) return;
    if (!press.swiping && Math.abs(event.clientY - press.y) < START_AFTER) return;
    if (!press.swiping) {
      press.swiping = true;
      doc.documentElement.classList.add('phone-swiping');
      win.getSelection()?.removeAllRanges();
    }
    const dy = event.clientY - press.lastY;
    const dt = Math.max(1, event.timeStamp - press.lastT);
    // Past an edge the finger stretches the screen instead of scrolling it,
    // and coming back the other way undoes the stretch before scrolling again.
    if (press.pull > 0 || (atTop(press.scroller) && dy > 0)) {
      press.pull = Math.max(0, press.pull + dy);
    } else if (press.pull < 0 || (atBottom(press.scroller) && dy < 0)) {
      press.pull = Math.min(0, press.pull + dy);
    }
    if (press.pull !== 0) {
      stretch(Math.abs(press.pull), press.pull > 0 ? 'top' : 'bottom');
    } else {
      press.scroller.scrollTop -= dy;
    }
    press.velocity = 0.8 * (dy / dt) + 0.2 * press.velocity;
    press.lastY = event.clientY;
    press.lastT = event.timeStamp;
    event.preventDefault();
  });

  function release() {
    if (!press) return;
    const { swiping, scroller, pull } = press;
    let velocity = press.velocity * 16; // px per frame
    press = null;
    doc.documentElement.classList.remove('phone-swiping');
    if (!swiping) return;
    swallowClick = true; // the click this release fires is the end of a swipe
    if (pull !== 0) {
      settle(); // let go of a stretch: it springs back, no fling
      return;
    }
    const step = () => {
      if (Math.abs(velocity) < 0.5) return;
      const before = scroller.scrollTop;
      scroller.scrollTop -= velocity;
      if (scroller.scrollTop === before) {
        // The fling ran into an edge: a small stretch, as Android does.
        bump(velocity, velocity > 0 ? 'top' : 'bottom');
        return;
      }
      velocity *= FRICTION;
      glide = win.requestAnimationFrame(step);
    };
    glide = win.requestAnimationFrame(step);
  }

  // A trackpad or mouse wheel past an edge stretches too, and settles once
  // the scrolling stops.
  let wheelPull = 0;
  doc.addEventListener(
    'wheel',
    (event) => {
      const scroller = scrollerFor(event.target, doc);
      const pastTop = atTop(scroller) && event.deltaY < 0;
      const pastBottom = atBottom(scroller) && event.deltaY > 0;
      if (!pastTop && !pastBottom) {
        wheelPull = 0;
        return;
      }
      wheelPull = Math.min(240, wheelPull + Math.abs(event.deltaY) * 0.5);
      stretch(wheelPull, pastTop ? 'top' : 'bottom');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        wheelPull = 0;
        settle();
      }, 140);
    },
    { passive: true },
  );
  doc.addEventListener('pointerup', release);
  doc.addEventListener('pointercancel', release);

  // Capture phase, so the button under the finger never sees a swipe's click.
  doc.addEventListener(
    'click',
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

// ---- Each time the app's document loads -----------------------------------
// A full reload replaces the document; the app's own route changes do not.
frame.addEventListener('load', () => {
  const doc = frame.contentDocument;
  if (!doc) return; // not same-origin: leave the app alone
  const style = doc.createElement('style');
  style.textContent = PHONE_STYLE;
  doc.head.appendChild(style);
  installSwipe(frame.contentWindow);
  paintBars();
});
