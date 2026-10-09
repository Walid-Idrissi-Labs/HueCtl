const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Animates a number with rAF and returns a cancel function.
export function tween(from, to, { duration, onUpdate, onDone }) {
  const start = performance.now();
  let frameId = 0;

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    onUpdate(from + (to - from) * easeOutCubic(progress));
    if (progress < 1) {
      frameId = window.requestAnimationFrame(tick);
    } else {
      frameId = 0;
      onDone?.();
    }
  }

  frameId = window.requestAnimationFrame(tick);
  return () => window.cancelAnimationFrame(frameId);
}
