import { PRESETS, describeHue, describeKelvin, describeLight } from "./color.js";

const SWEEP_DEG = 270;
// A knob clicks every six degrees of its turn.
const DETENTS = SWEEP_DEG / 6;
// A slide this long takes a knob from one end stop to the other.
const TRAVEL_PX = 220;
const TAP_SLOP_PX = 5;
const DOUBLE_TAP_MS = 320;
// How near its neutral a knob has to come to catch there, as a share of its range.
const CATCH = 0.015;
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

// Time left, the way a camera writes timecode.
function timecode(ms) {
  const seconds = Math.ceil(ms / 1000);
  return [seconds / 3600, (seconds / 60) % 60, seconds % 60]
    .map((part) => String(Math.floor(part)).padStart(2, "0"))
    .join(":");
}

export function createPanel({ timer, actions }) {
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

  // A knob is worked the way Apple's are on a touch screen: put a finger on it
  // and slide, up or to the right for more. There is no circle to trace on a
  // cap the finger is hiding, and once it is held the finger can wander off it.
  // Like a swipe on the light, a slide keeps to the direction it set off in.
  knobs.forEach(({ key, input }) => {
    const knob = input.parentElement;
    const min = Number(input.min);
    const max = Number(input.max);
    const home = Number(input.defaultValue);
    // A knob with a neutral worth landing on exactly catches there for a moment.
    const catches = "catch" in input.dataset;
    let grab = null;
    let notch = 0;
    let lastTap = 0;

    // Clicks as the knob passes a detent, and harder as it meets an end stop.
    function feel(value, silent) {
      const turned = (value - min) / (max - min);
      const now = Math.round(turned * DETENTS);
      if (now !== notch && !silent) actions.tick(turned <= 0 || turned >= 1);
      notch = now;
    }

    knob.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (input.disabled) return;
      knob.setPointerCapture(event.pointerId);
      const value = Number(input.value);
      grab = { x: event.clientX, y: event.clientY, value, axis: null, caught: catches && value === home };
      feel(grab.value, true);
      input.focus({ preventScroll: true });
    });

    knob.addEventListener("pointermove", (event) => {
      if (!grab) return;
      const dx = event.clientX - grab.x;
      const dy = event.clientY - grab.y;
      // The first few pixels only tell a slide from a tap, and which way it is going.
      if (!grab.axis && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
      grab.x = event.clientX;
      grab.y = event.clientY;
      if (!grab.axis) {
        grab.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        knob.classList.add("turning");
        return;
      }
      const slid = grab.axis === "x" ? dx : -dy;

      // The value is carried unrounded, so a slow slide adds up instead of stalling.
      grab.value = Math.min(max, Math.max(min, grab.value + (slid / TRAVEL_PX) * (max - min)));
      const caught = catches && Math.abs(grab.value - home) < (max - min) * CATCH;
      if (caught && !grab.caught) actions.tick(true);
      grab.caught = caught;
      actions.set(key, caught ? home : grab.value);
      feel(caught ? home : grab.value);
    });

    const release = (event) => {
      knob.classList.remove("turning");
      // Two taps put a knob back where it started, as they do in Apple's own apps.
      if (grab && !grab.axis && event.type === "pointerup") {
        if (event.timeStamp - lastTap < DOUBLE_TAP_MS) {
          actions.set(key, home);
          actions.tick(true);
        }
        lastTap = event.timeStamp;
      }
      grab = null;
    };
    knob.addEventListener("pointerup", release);
    knob.addEventListener("pointercancel", release);

    // From the keyboard every step is a click of its own.
    input.addEventListener("input", () => {
      actions.set(key, Number(input.value));
      actions.tick();
    });
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
    if (event.target.closest(".key:enabled")) actions.tick();
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
