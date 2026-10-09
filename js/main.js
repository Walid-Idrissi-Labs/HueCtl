import {
  KELVIN_MAX,
  KELVIN_MIN,
  PRESETS,
  kelvinGradient,
  kelvinToRgb,
  lightColor,
  rgbCss,
  rgbHex,
  toneFor
} from "./color.js";
import * as device from "./device.js";
import { modulate } from "./effects.js";
import { attachGestures } from "./gestures.js";
import { tween } from "./motion.js";
import { createPanel } from "./panel.js";
import {
  EFFECTS,
  clampBrightness,
  clampKelvin,
  createPersister,
  createStore,
  getFlag,
  loadState,
  readLaunchParams,
  setFlag
} from "./store.js";
import { createTimer } from "./timer.js";

const IDLE_MS = 4000;
const HUD_MS = 1200;
const HINT_MS = 8000;
const META_INTERVAL_MS = 200;
const RING_LENGTH = 2 * Math.PI * 22;
const EFFECT_LABELS = { none: "Steady", candle: "Candle", breathe: "Breathe" };

const root = document.documentElement;
const themeMeta = document.querySelector('meta[name="theme-color"]');
const surface = document.getElementById("surface");
const toggle = document.getElementById("toggle-panel");
const ring = toggle.querySelector(".toggle-ring circle");
const hud = document.getElementById("hud");
const hint = document.getElementById("hint");

const launch = readLaunchParams();
const store = createStore(loadState(launch.overrides));
const persist = createPersister();
const timer = createTimer(onTimerChange);

// Rendering -----------------------------------------------------------------

let frameId = 0;
let lastPaint = "";
let lastFull = "";
let lastTone = "";
let lastMeta = "";
let lastMetaAt = 0;

function requestRender() {
  if (!frameId) frameId = window.requestAnimationFrame(render);
}

function render(now) {
  frameId = 0;
  const state = store.get();
  const base = timer.apply(state.kelvin, state.brightness / 100);
  const animating =
    state.effect !== "none" && !timer.done && document.visibilityState === "visible";
  const { gain, kelvinShift } = modulate(animating ? state.effect : "none", now);
  const rgb = timer.done ? [0, 0, 0] : lightColor(base.kelvin + kelvinShift, base.level * gain);

  const paint = rgbCss(rgb);
  if (paint !== lastPaint) {
    root.style.setProperty("--light", paint);
    lastPaint = paint;
  }

  const full = rgbCss(kelvinToRgb(state.kelvin).map(Math.round));
  if (full !== lastFull) {
    root.style.setProperty("--light-full", full);
    lastFull = full;
  }

  // Tone follows the light without effects, so the UI never flickers with them.
  const tone = toneFor(timer.done ? rgb : lightColor(base.kelvin, base.level));
  if (tone !== lastTone) {
    root.dataset.tone = tone;
    lastTone = tone;
  }

  // Browser chrome repaints are costly; throttle them while an effect runs.
  const hex = rgbHex(rgb);
  if (hex !== lastMeta && (!animating || now - lastMetaAt > META_INTERVAL_MS)) {
    themeMeta.content = hex;
    lastMeta = hex;
    lastMetaAt = now;
  }

  if (animating) requestRender();
}

function savePaint(state) {
  const rgb = lightColor(state.kelvin, state.brightness / 100);
  persist(state, { color: rgbCss(rgb), hex: rgbHex(rgb), tone: toneFor(rgb) });
}

// State changes ---------------------------------------------------------------

const tweens = {};

function cancelTween(key) {
  tweens[key]?.();
  tweens[key] = null;
}

function set(key, value) {
  cancelTween(key);
  store.set({ [key]: value });
}

function animateTo(key, target) {
  cancelTween(key);
  const from = store.get()[key];
  const to = key === "kelvin" ? clampKelvin(target) : clampBrightness(target);
  if (from === to) return;
  const span = key === "kelvin" ? KELVIN_MAX - KELVIN_MIN : 100;
  tweens[key] = tween(from, to, {
    duration: 180 + (440 * Math.abs(to - from)) / span,
    onUpdate: (value) => store.set({ [key]: value }),
    onDone: () => {
      tweens[key] = null;
    }
  });
}

// Keep-awake: the timer holds the lock until lights-out, otherwise it follows
// the user's preference.
let lockWanted = null;

function syncWakeLock() {
  const wanted = timer.active ? !timer.done : store.get().awake;
  if (wanted === lockWanted) return;
  lockWanted = wanted;
  device.setWakeLock(wanted);
}

function retryWakeLock() {
  if (lockWanted && !device.isAwake()) device.setWakeLock(true);
}

function syncDevice() {
  panel.syncDevice({
    awakeWanted: store.get().awake,
    awakeActive: device.isAwake(),
    awakeSupported: device.wakeLockSupported,
    fullscreen: device.isFullscreen(),
    fullscreenSupported: device.fullscreenSupported,
    installable: device.canInstall()
  });
}

function onTimerChange() {
  root.classList.toggle("timer-running", timer.active && !timer.done);
  root.classList.toggle("timer-done", timer.done);
  ring.setAttribute("stroke-dashoffset", String(RING_LENGTH * timer.progress));
  panel.syncTimer();
  if (timer.done) panel.setOpen(false);
  syncWakeLock();
  requestRender();
}

const panel = createPanel({
  store,
  timer,
  actions: {
    set,
    animateTo,
    startTimer: (minutes) => timer.start(minutes),
    cancelTimer: () => timer.cancel(),
    toggleAwake: () => store.set({ awake: !store.get().awake }),
    toggleFullscreen: device.toggleFullscreen,
    install: device.install,
    showHint,
    onOpenChange(open) {
      if (open) dismissHint();
      wake();
    }
  }
});

store.subscribe((state, previous) => {
  panel.sync(state);
  savePaint(state);
  if (state.awake !== previous.awake) {
    syncWakeLock();
    syncDevice();
  }
  requestRender();
});

// HUD, hint and idle -----------------------------------------------------------

let hudTimer = 0;

function showHud(text) {
  const state = store.get();
  hud.textContent = text ?? `${state.kelvin}K · ${state.brightness}%`;
  hud.classList.add("show");
  window.clearTimeout(hudTimer);
  hudTimer = window.setTimeout(() => hud.classList.remove("show"), HUD_MS);
}

let hintTimer = 0;

function showHint() {
  window.clearTimeout(hintTimer);
  hint.hidden = false;
  window.requestAnimationFrame(() => hint.classList.add("show"));
  hintTimer = window.setTimeout(dismissHint, HINT_MS);
  setFlag("hintSeen");
}

function dismissHint() {
  if (hint.hidden || !hint.classList.contains("show")) return;
  window.clearTimeout(hintTimer);
  hint.classList.remove("show");
  hintTimer = window.setTimeout(() => {
    hint.hidden = true;
  }, 400);
}

let idleTimer = 0;

function wake() {
  root.classList.remove("idle");
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    if (!panel.isOpen() && !toggle.matches(":focus-visible")) root.classList.add("idle");
  }, IDLE_MS);
}

// Input -------------------------------------------------------------------------

let dragStart = null;

attachGestures(surface, {
  doubleTapEnabled: () => device.fullscreenSupported && !timer.done,
  onTap() {
    if (timer.done) {
      timer.cancel();
      return;
    }
    dismissHint();
    panel.setOpen(!panel.isOpen());
  },
  onDoubleTap: device.toggleFullscreen,
  onDragStart() {
    if (timer.done) return;
    dismissHint();
    cancelTween("kelvin");
    cancelTween("brightness");
    dragStart = store.get();
  },
  onDrag(axis, dx, dy) {
    if (!dragStart) return;
    if (axis === "x") {
      const kelvin = dragStart.kelvin + (dx / window.innerWidth) * (KELVIN_MAX - KELVIN_MIN);
      store.set({ kelvin });
    } else {
      const brightness = dragStart.brightness - (dy / (window.innerHeight * 0.8)) * 100;
      store.set({ brightness });
    }
    showHud();
  },
  onDragEnd() {
    dragStart = null;
  }
});

// Trackpads send tiny deltas; accumulate them so slow scrolls still register.
const wheelCarry = { kelvin: 0, brightness: 0 };

surface.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (timer.done) return;
    const scale = event.deltaMode === 1 ? 16 : 1;
    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const key = horizontal ? "kelvin" : "brightness";
    const delta = (horizontal ? event.deltaX || event.deltaY : -event.deltaY) * scale;
    wheelCarry[key] += horizontal ? delta * 5 : delta * 0.1;

    const unit = horizontal ? 50 : 1;
    const steps = Math.trunc(wheelCarry[key] / unit);
    if (!steps) return;
    wheelCarry[key] -= steps * unit;
    set(key, store.get()[key] + steps * unit);
    showHud();
  },
  { passive: false }
);

const KEY_STEPS = {
  ArrowLeft: ["kelvin", -100, -500],
  ArrowRight: ["kelvin", 100, 500],
  ArrowDown: ["brightness", -5, -20],
  ArrowUp: ["brightness", 5, 20]
};

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  if (timer.done) {
    timer.cancel();
    event.preventDefault();
    return;
  }

  if (event.key === "Escape") {
    panel.setOpen(false);
    dismissHint();
    return;
  }

  if (event.target instanceof Element && event.target.closest("input, button, a, textarea")) return;

  const step = KEY_STEPS[event.key];
  const presetIndex = Number(event.key) - 1;

  if (step) {
    const [key, small, large] = step;
    set(key, store.get()[key] + (event.shiftKey ? large : small));
    showHud();
  } else if (PRESETS[presetIndex]) {
    animateTo("kelvin", PRESETS[presetIndex].kelvin);
    showHud(`${PRESETS[presetIndex].name} · ${PRESETS[presetIndex].kelvin}K`);
  } else if (event.key === " ") {
    panel.setOpen(!panel.isOpen());
  } else if (event.key === "f" || event.key === "F") {
    device.toggleFullscreen();
  } else if (event.key === "e" || event.key === "E") {
    const effect = EFFECTS[(EFFECTS.indexOf(store.get().effect) + 1) % EFFECTS.length];
    store.set({ effect });
    showHud(EFFECT_LABELS[effect]);
  } else {
    return;
  }
  event.preventDefault();
});

window.addEventListener(
  "pointerdown",
  () => {
    wake();
    retryWakeLock();
  },
  { capture: true }
);
window.addEventListener("pointermove", (event) => event.pointerType === "mouse" && wake(), {
  passive: true
});
window.addEventListener("keydown", () => {
  wake();
  retryWakeLock();
}, { capture: true });

document.addEventListener("visibilitychange", requestRender);
device.onDeviceChange(syncDevice);

// Boot ----------------------------------------------------------------------------

root.style.setProperty("--kelvin-track", kelvinGradient());
panel.sync(store.get());
onTimerChange();
syncDevice();
render(performance.now());
wake();

if (launch.timerMinutes) timer.start(launch.timerMinutes);
if (!getFlag("hintSeen")) window.setTimeout(showHint, 400);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
