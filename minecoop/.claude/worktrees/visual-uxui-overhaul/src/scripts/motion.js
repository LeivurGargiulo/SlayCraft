function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function computeTilt(offsetX, offsetY, width, height, maxDeg = 8) {
  const normX = clamp(offsetX / width - 0.5, -0.5, 0.5);
  const normY = clamp(offsetY / height - 0.5, -0.5, 0.5);
  return {
    rx: -normY * 2 * maxDeg + 0,
    ry: normX * 2 * maxDeg + 0,
  };
}

export function computeParallaxOffset(progress, maxOffsetPx = 40) {
  const p = clamp(progress, 0, 1);
  return (p - 0.5) * 2 * maxOffsetPx;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initTilt(root = document) {
  if (prefersReducedMotion()) return;
  root.querySelectorAll('[data-tilt]').forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = 'true';
    const maxDeg = Number(el.dataset.tiltMax) || 8;
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      const { rx, ry } = computeTilt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height,
        maxDeg
      );
      el.style.setProperty('--rx', `${rx}deg`);
      el.style.setProperty('--ry', `${ry}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
}

let parallaxBound = false;
let parallaxTicking = false;

function updateParallax(root) {
  root.querySelectorAll('[data-parallax]').forEach((el) => {
    const rect = el.getBoundingClientRect();
    const progress = 1 - rect.top / window.innerHeight;
    const maxOffset = Number(el.dataset.parallaxMax) || 40;
    el.style.setProperty('--parallax-y', `${computeParallaxOffset(progress, maxOffset)}px`);
  });
  parallaxTicking = false;
}

export function initParallax(root = document) {
  if (prefersReducedMotion()) return;
  if (!parallaxBound) {
    parallaxBound = true;
    window.addEventListener(
      'scroll',
      () => {
        if (parallaxTicking) return;
        parallaxTicking = true;
        requestAnimationFrame(() => updateParallax(document));
      },
      { passive: true }
    );
  }
  updateParallax(root);
}
