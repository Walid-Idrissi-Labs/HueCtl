import { PRESETS, describeHue, describeKelvin, describeLight } from "./color.js";

const SWEEP_DEG = 270;
const TIMER_STEPS = [0, 15, 30, 60];
const $ = (id) => document.getElementById(id);

const tintText = (tint) => (tint ? `${tint < 0 ? "G" : "M"}${Math.abs(tint)}` : "0");

// What each knob puts on the display, and what it says to a screen reader.
const KNOBS = {
  kelvin: [String, (value) => `${value} kelvin, ${describeKelvin(value)}`],
  brightness: [String, (value) => `${value} percent`],
  tint: [tintText, (value) => (value ? `${Math.abs(value)} toward ${value < 0 ? "green" : "magenta"}` : "neutral")],
  hue: [String, (value) => `${value} degrees, ${describeHue(value)}`],
  saturation: [String, (value) => `${value} percent`]
};

// A short tick under the finger, where the device can give one. Browsers refuse
// to vibrate before the first real tap, so it waits for that.
let lastTick = 0;
function tick() {
  if (performance.now() - lastTick < 30 || !navigator.userActivation?.hasBeenActive) return;
  lastTick = performance.now();
  navigator.vibrate?.(8);
}

// Time left, the way a camera writes timecode.
function timecode(ms) {
  const seconds = Math.ceil(ms / 1000);
  return [seconds / 3600, (seconds / 60) % 60, seconds % 60]
    .map((part) => String(Math.floor(part)).padStart(2, "0"))
    .join(":");
}

export function createPanel({ store, timer, actions }) {
  const panel = $("panel");
  const toggle = $("toggle-panel");
  const controls = $("controls");
  const presetList = $("presets");
  const effectKey = $("effect");
  const timerKey = $("timer");
  const awakeKey = $("awake");
  const fullscreenKey = $("fullscreen");
  const lockKey = $("lock");
  const powerKey = $("power");
  const installButton = $("install");

  const knobs = Object.keys(KNOBS).map((key) => ({
    key,
    input: $(key),
    value: $(`${key}-value`),
    cell: panel.querySelector(`[data-for="${key}"]`)
  }));

  const presetKeys = PRESETS.map((preset, index) => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key";
    key.setAttribute("aria-pressed", "false");
    key.setAttribute("aria-label", `${preset.name}, ${preset.kelvin} kelvin`);
    key.title = `${preset.name} (${index + 1})`;
    key.innerHTML = `<b>${index + 1}</b><small>${preset.kelvin}</small>`;
    key.addEventListener("click", () => actions.selectPreset(preset));
    presetList.append(key);
    return key;
  });

  // Everything that changes the light, and so goes dead while it is locked.
  const lockable = [...knobs.map((knob) => knob.input), ...presetKeys, effectKey, timerKey, powerKey];

  // Underlines one parameter on the display in red: the one in hand.
  function select(key) {
    knobs.forEach((knob) => knob.cell.classList.toggle("selected", knob.key === key));
  }

  // A knob turns the way a real one does: the pointer goes round its center,
  // and the further out it travels, the finer the adjustment.
  knobs.forEach(({ key, input }) => {
    const knob = input.parentElement;
    const cap = knob.querySelector(".knob-cap");
    const span = Number(input.max) - Number(input.min);
    let grab = null;

    function angle(event) {
      const box = cap.getBoundingClientRect();
      const x = event.clientX - (box.left + box.width / 2);
      const y = event.clientY - (box.top + box.height / 2);
      return (Math.atan2(y, x) * 180) / Math.PI;
    }

    knob.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (input.disabled) return;
      knob.setPointerCapture(event.pointerId);
      // The value is carried unrounded, so slow turns add up instead of stalling.
      grab = { angle: angle(event), value: Number(input.value) };
      input.focus({ preventScroll: true });
    });

    knob.addEventListener("pointermove", (event) => {
      if (!grab) return;
      const now = angle(event);
      const turned = now - grab.angle - 360 * Math.round((now - grab.angle) / 360);
      const value = grab.value + (turned / SWEEP_DEG) * span;
      grab = { angle: now, value: Math.min(Number(input.max), Math.max(Number(input.min), value)) };
      const before = store.get()[key];
      actions.set(key, grab.value);
      if (store.get()[key] !== before) tick();
    });

    const release = () => {
      grab = null;
    };
    knob.addEventListener("pointerup", release);
    knob.addEventListener("pointercancel", release);

    input.addEventListener("input", () => actions.set(key, Number(input.value)));
    input.addEventListener("focus", () => select(key));
  });

  effectKey.addEventListener("click", actions.cycleEffect);
  timerKey.addEventListener("click", () => {
    const current = TIMER_STEPS.indexOf(timer.active ? timer.minutes : 0);
    const minutes = TIMER_STEPS[(current + 1) % TIMER_STEPS.length];
    if (minutes) actions.startTimer(minutes);
    else actions.cancelTimer();
  });
  awakeKey.addEventListener("click", () => actions.toggle("awake"));
  fullscreenKey.addEventListener("click", actions.toggleFullscreen);
  lockKey.addEventListener("click", () => actions.toggle("locked"));
  powerKey.addEventListener("click", () => actions.toggle("standby"));
  installButton.addEventListener("click", actions.install);
  $("help").addEventListener("click", () => {
    setOpen(false);
    actions.showHint();
  });
  toggle.addEventListener("click", () => setOpen(!isOpen()));
  controls.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".key:enabled")) tick();
  });

  const isOpen = () => panel.classList.contains("open");

  function setOpen(open) {
    if (open === isOpen()) return;
    panel.classList.toggle("open", open);
    controls.inert = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (!open && controls.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    actions.onOpenChange(open);
  }

  function sync(state) {
    knobs.forEach(({ key, input, value }) => {
      const [show, say] = KNOBS[key];
      const turn = (state[key] - Number(input.min)) / (Number(input.max) - Number(input.min)) - 0.5;
      input.value = String(state[key]);
      input.setAttribute("aria-valuetext", say(state[key]));
      input.parentElement.style.setProperty("--turn", `${turn * SWEEP_DEG}deg`);
      value.textContent = show(state[key]);
    });

    const white = state.saturation === 0;
    PRESETS.forEach((preset, index) => {
      presetKeys[index].setAttribute("aria-pressed", String(white && preset.kelvin === state.kelvin));
    });

    const effect = state.effect !== "none";
    effectKey.setAttribute("aria-pressed", String(effect));
    effectKey.setAttribute("aria-label", `Effect: ${effect ? state.effect : "steady"}`);
    powerKey.setAttribute("aria-pressed", String(!state.standby));
    lockKey.setAttribute("aria-pressed", String(state.locked));
    lockable.forEach((control) => {
      control.disabled = state.locked;
    });

    $("light-name").textContent = describeLight(state);
    $("flag-effect").textContent = effect ? state.effect : "FX";
    $("flag-effect").classList.toggle("on", effect);
    $("flag-lock").classList.toggle("on", state.locked);
    $("flag-standby").classList.toggle("on", state.standby);
  }

  function syncTimer() {
    const running = timer.active && !timer.done;
    timerKey.setAttribute("aria-pressed", String(timer.active));
    timerKey.setAttribute("aria-label", `Sunset timer: ${timer.active ? `${timer.minutes} minutes` : "off"}`);
    $("timecode").textContent = running ? timecode(timer.remainingMs) : "--:--:--";
    $("timecode").classList.toggle("on", running);
  }

  function syncDevice({ awakeWanted, awakeActive, awakeSupported, fullscreen, fullscreenSupported, installable }) {
    awakeKey.hidden = !awakeSupported;
    awakeKey.setAttribute("aria-pressed", String(awakeWanted));
    awakeKey.title = awakeWanted && !awakeActive ? "Waiting for a tap to lock the screen on" : "Keep the screen on";
    $("flag-awake").classList.toggle("on", awakeActive);
    fullscreenKey.hidden = !fullscreenSupported;
    fullscreenKey.setAttribute("aria-pressed", String(fullscreen));
    installButton.hidden = !installable;
  }

  select("kelvin");

  return { isOpen, setOpen, select, sync, syncTimer, syncDevice };
}
