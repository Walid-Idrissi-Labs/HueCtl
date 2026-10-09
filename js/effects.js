const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Incommensurate frequencies (Hz) so the sum never visibly repeats. Kept at or
// below ~2.5 Hz with small amplitudes: a soft waver, never a flash.
const CANDLE_WAVES = [
  { frequency: 0.13, amplitude: 0.42 },
  { frequency: 0.37, amplitude: 0.28 },
  { frequency: 0.91, amplitude: 0.18 },
  { frequency: 2.3, amplitude: 0.12 }
].map((wave) => ({ ...wave, phase: Math.random() * Math.PI * 2 }));

const BREATHE_PERIOD_S = 10;

function candleNoise(seconds) {
  let sum = 0;
  for (const { frequency, amplitude, phase } of CANDLE_WAVES) {
    sum += amplitude * Math.sin(2 * Math.PI * frequency * seconds + phase);
  }
  return sum;
}

// Returns how an effect bends the base light at time `ms`:
// `gain` multiplies brightness, `kelvinShift` is added to temperature.
export function modulate(effect, ms) {
  const seconds = ms / 1000;

  if (effect === "candle") {
    const scale = reducedMotion.matches ? 0.5 : 1;
    const noise = candleNoise(seconds) * scale;
    // A real flame reddens as it dips, so brightness and warmth move together.
    return { gain: 1 + 0.12 * noise, kelvinShift: 150 * noise };
  }

  if (effect === "breathe") {
    const wave = (1 - Math.cos((2 * Math.PI * seconds) / BREATHE_PERIOD_S)) / 2;
    return { gain: 1 - 0.45 * wave, kelvinShift: 0 };
  }

  return { gain: 1, kelvinShift: 0 };
}
