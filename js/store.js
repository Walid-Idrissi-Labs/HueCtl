import { KELVIN_MAX, KELVIN_MIN, KELVIN_STEP } from "./color.js";

export const BRIGHTNESS_MIN = 5;
export const BRIGHTNESS_MAX = 100;
export const EFFECTS = ["none", "candle", "breathe"];

const STORAGE_KEY = "huectl:v2";
const LEGACY_KEY = "huectl-kelvin";
const FLAGS_KEY = "huectl:flags";
const SAVE_DELAY_MS = 250;

const DEFAULTS = {
  kelvin: 4500,
  brightness: 100,
  effect: "none",
  awake: true
};

// Storage can throw (private mode, blocked site data); the app must keep working.
function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not persisting is fine.
  }
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clampKelvin(value) {
  if (!Number.isFinite(value)) {
    return DEFAULTS.kelvin;
  }
  const stepped = Math.round(value / KELVIN_STEP) * KELVIN_STEP;
  return Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, stepped));
}

export function clampBrightness(value) {
  if (!Number.isFinite(value)) {
    return DEFAULTS.brightness;
  }
  return Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, Math.round(value)));
}

function sanitize(state) {
  return {
    kelvin: clampKelvin(Number(state.kelvin)),
    brightness: clampBrightness(Number(state.brightness)),
    effect: EFFECTS.includes(state.effect) ? state.effect : DEFAULTS.effect,
    awake: typeof state.awake === "boolean" ? state.awake : DEFAULTS.awake
  };
}

// URL params (?k=2700&b=60&fx=candle&timer=30) override the saved state once,
// so a bookmark or home-screen shortcut can open straight into a setting.
export function readLaunchParams() {
  const params = new URLSearchParams(window.location.search);
  const overrides = {};
  if (params.has("k")) overrides.kelvin = Number(params.get("k"));
  if (params.has("b")) overrides.brightness = Number(params.get("b"));
  if (params.has("fx")) overrides.effect = params.get("fx");
  const timer = Number(params.get("timer"));

  if (params.toString()) {
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }
  return { overrides, timerMinutes: timer > 0 ? timer : 0 };
}

export function loadState(overrides) {
  const saved = parseJson(read(STORAGE_KEY));
  const legacyKelvin = Number.parseInt(read(LEGACY_KEY), 10);
  const base = saved ?? (Number.isFinite(legacyKelvin) ? { kelvin: legacyKelvin } : {});
  return sanitize({ ...DEFAULTS, ...base, ...overrides });
}

export function createStore(initial) {
  let state = initial;
  const listeners = new Set();

  return {
    get: () => state,
    set(patch) {
      const next = sanitize({ ...state, ...patch });
      const changed = Object.keys(next).some((key) => next[key] !== state[key]);
      if (!changed) return;
      const previous = state;
      state = next;
      listeners.forEach((listener) => listener(state, previous));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// `paint` is the resolved base color, stored so the inline boot script in
// index.html can paint it before any module loads (no flash of default color).
export function createPersister() {
  let timeoutId = 0;
  let pending = null;

  function flush() {
    window.clearTimeout(timeoutId);
    timeoutId = 0;
    if (pending) {
      write(STORAGE_KEY, JSON.stringify(pending));
      pending = null;
    }
  }

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  return function save(state, paint) {
    pending = { ...state, paint };
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(flush, SAVE_DELAY_MS);
  };
}

export function getFlag(name) {
  return Boolean(parseJson(read(FLAGS_KEY))?.[name]);
}

export function setFlag(name) {
  const flags = parseJson(read(FLAGS_KEY)) ?? {};
  flags[name] = true;
  write(FLAGS_KEY, JSON.stringify(flags));
}
