import { KELVIN_MAX, KELVIN_MIN, PRESETS, lightColor, rgbCss, rgbHex } from "./color.js";
import * as device from "./device.js";
import { modulate } from "./effects.js";
import { attachGestures } from "./gestures.js";
import { tween } from "./motion.js";
import { createPanel } from "./panel.js";
import {
  EFFECTS,
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
const HINT_MS = 8000;
const META_INTERVAL_MS = 200;
const EFFECT_LABELS = { none: "Steady", candle: "Candle", breathe: "Breathe" };

const root = document.documentElement;
const themeMeta = document.querySelector('meta[name="theme-color"]');
const surface = document.getElementById("surface");
const toggle = document.getElementById("toggle-panel");
const hud = document.getElementById("hud");
const hint = document.getElementById("hint");

const launch = readLaunchParams();
const store = createStore(loadState(launch.overrides));
const persist = createPersister();
const timer = createTimer(onTimerChange);

// Rendering -----------------------------------------------------------------

let frameId = 0;
let lastPaint = "";
let lastMeta = "";
let lastMetaAt = 0;

function requestRender() {
  if (!frameId) frameId = window.requestAnimationFrame(render);
}

function render(now) {
  frameId = 0;
  const state = store.get();
  const base = timer.apply(state.kelvin, state.brightness / 100);
  const dark = timer.done || state.standby;
  const animating = state.effect !== "none" && !dark && document.visibilityState === "visible";
  const { gain, kelvinShift } = modulate(animating ? state.effect : "none", now);
  const rgb = dark
    ? [0, 0, 0]
    : lightColor({ ...state, kelvin: base.kelvin + kelvinShift }, base.level * gain);

  const paint = rgbCss(rgb);
  if (paint !== lastPaint) {
    root.style.setProperty("--light", paint);
    lastPaint = paint;
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
  const rgb = lightColor(state, state.brightness / 100);
  persist(state, { color: rgbCss(rgb), hex: rgbHex(rgb) });
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

// Glides the temperature to a new value instead of jumping there.
function glideTo(kelvin) {
  cancelTween("kelvin");
  const from = store.get().kelvin;
  const to = clampKelvin(kelvin);
  if (from === to) return;
  tweens.kelvin = tween(from, to, {
    duration: 180 + (440 * Math.abs(to - from)) / (KELVIN_MAX - KELVIN_MIN),
    onUpdate: (value) => store.set({ kelvin: value }),
    onDone: () => {
      tweens.kelvin = null;
    }
  });
}

function toggleState(key) {
  store.set({ [key]: !store.get()[key] });
}

// A preset is a white: it takes any color back out of the light on the way.
function selectPreset(preset) {
  store.set({ saturation: 0 });
  glideTo(preset.kelvin);
  showHud(`${preset.name} · ${preset.kelvin}K`);
}

function cycleEffect() {
  const effect = EFFECTS[(EFFECTS.indexOf(store.get().effect) + 1) % EFFECTS.length];
  store.set({ effect });
  showHud(EFFECT_LABELS[effect]);
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
  root.classList.toggle("timer-done", timer.done);
  panel.syncTimer();
  if (timer.done) panel.setOpen(false);
  syncWakeLock();
  requestRender();
}

const panel = createPanel({
  timer,
  actions: {
    set,
    selectPreset,
    cycleEffect,
    toggle: toggleState,
    tick: device.tick,
    startTimer: (minutes) => timer.start(minutes),
    cancelTimer: () => timer.cancel(),
    toggleFullscreen: device.toggleFullscreen,
    install: device.install,
    showHint,
    onOpenChange(open) {
      if (open) {
        dismissHint();
        device.primeSound();
      }
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

// The display shows the light's numbers to the eye; this status line reads
// gesture and shortcut changes out to screen readers.
function showHud(text) {
  const state = store.get();
  hud.textContent = text ?? `${state.kelvin}K · ${state.brightness}%`;
  wake();
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
  // A screen used as a light gets touched all the time, so a tap never opens
  // the controls: it wakes the display and puts an open faceplate away.
  onTap() {
    if (timer.done) {
      timer.cancel();
      return;
    }
    dismissHint();
    panel.setOpen(false);
  },
  onDoubleTap: device.toggleFullscreen,
  onDragStart(axis) {
    if (timer.done || store.get().locked) return;
    dismissHint();
    cancelTween("kelvin");
    cancelTween("brightness");
    dragStart = store.get();
    panel.select(axis === "x" ? "kelvin" : "brightness");
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
    if (timer.done || store.get().locked) return;
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
    panel.select(key);
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

  const key = event.key.toLowerCase();
  const step = KEY_STEPS[event.key];
  const preset = PRESETS[Number(event.key) - 1];

  if (key === " ") {
    panel.setOpen(!panel.isOpen());
  } else if (key === "f") {
    device.toggleFullscreen();
  } else if (key === "l") {
    toggleState("locked");
    showHud(store.get().locked ? "Locked" : "Unlocked");
  } else if (store.get().locked) {
    // Locked: nothing below may change the light.
    return;
  } else if (step) {
    const [name, small, large] = step;
    set(name, store.get()[name] + (event.shiftKey ? large : small));
    panel.select(name);
    showHud();
  } else if (preset) {
    selectPreset(preset);
  } else if (key === "e") {
    cycleEffect();
  } else if (key === "p") {
    toggleState("standby");
    showHud(store.get().standby ? "Light off" : "Light on");
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

panel.sync(store.get());
onTimerChange();
syncDevice();
render(performance.now());
wake();

if (launch.timerMinutes) timer.start(launch.timerMinutes);
// The hint is for someone looking at a bare light: not over an open unit.
if (!getFlag("hintSeen")) window.setTimeout(() => panel.isOpen() || showHint(), 400);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
