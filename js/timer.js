export const SUNSET_KELVIN = 1800;
const TICK_MS = 1000;

const smoothstep = (t) => t * t * (3 - 2 * t);

// Sunset timer: eases the light warmer and down to black over `minutes`.
// Progress comes from wall-clock timestamps, so throttled ticks catch up.
export function createTimer(onChange) {
  let startedAt = 0;
  let durationMs = 0;
  let intervalId = 0;

  const progress = () => (durationMs ? Math.min(1, (Date.now() - startedAt) / durationMs) : 0);

  function tick() {
    if (progress() >= 1) {
      window.clearInterval(intervalId);
      intervalId = 0;
    }
    onChange();
  }

  return {
    start(minutes) {
      window.clearInterval(intervalId);
      startedAt = Date.now();
      durationMs = minutes * 60_000;
      intervalId = window.setInterval(tick, TICK_MS);
      onChange();
    },
    cancel() {
      if (!durationMs) return;
      window.clearInterval(intervalId);
      intervalId = 0;
      durationMs = 0;
      onChange();
    },
    get active() {
      return durationMs > 0;
    },
    get done() {
      return durationMs > 0 && progress() >= 1;
    },
    get minutes() {
      return durationMs / 60_000;
    },
    get progress() {
      return progress();
    },
    get remainingMs() {
      return durationMs ? Math.max(0, startedAt + durationMs - Date.now()) : 0;
    },
    // Applies the fade to a base light. Steps per tick are well under 1%, so a
    // once-a-second update reads as continuous without per-frame work.
    apply(kelvin, level) {
      if (!durationMs) return { kelvin, level };
      const eased = smoothstep(progress());
      const target = Math.min(kelvin, SUNSET_KELVIN);
      return { kelvin: kelvin + (target - kelvin) * eased, level: level * (1 - eased) };
    }
  };
}
