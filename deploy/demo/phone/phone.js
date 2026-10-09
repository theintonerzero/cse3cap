// Scales the phone to fill the window (CAP-55). Only the drawing changes: the
// app inside keeps its 384 x 832 viewport, so it lays out as on the phone at
// any size, from a laptop to a projector.
const device = document.querySelector('.device');
const MARGIN = 48;

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
