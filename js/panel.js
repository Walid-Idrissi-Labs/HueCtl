import { PRESETS, describeKelvin, kelvinToRgb, rgbCss } from "./color.js";

const THUMB_PX = 26;
const $ = (id) => document.getElementById(id);

function formatRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export function createPanel({ store, timer, actions }) {
  const panel = $("panel");
  const inner = panel.querySelector(".panel-inner");
  const toggle = $("toggle-panel");
  const kelvinInput = $("kelvin");
  const brightnessInput = $("brightness");
  const kelvinValue = $("kelvin-value");
  const kelvinName = $("kelvin-name");
  const brightnessValue = $("brightness-value");
  const presetList = $("presets");
  const effectInputs = [...document.querySelectorAll('input[name="effect"]')];
  const timerInputs = [...document.querySelectorAll('input[name="timer"]')];
  const timerStatus = $("timer-status");
  const awakeButton = $("awake");
  const fullscreenButton = $("fullscreen");
  const installButton = $("install");

  const presetButtons = PRESETS.map((preset, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.style.setProperty("--chip-color", rgbCss(kelvinToRgb(preset.kelvin).map(Math.round)));
    button.setAttribute("aria-pressed", "false");
    button.title = `${preset.kelvin}K (${index + 1})`;
    button.innerHTML = `<span class="chip-dot" aria-hidden="true"></span>${preset.name}`;
    button.addEventListener("click", () => actions.animateTo("kelvin", preset.kelvin));
    presetList.append(button);
    return button;
  });

  // Tapping the track away from the thumb glides there instead of jumping.
  // Grabbing the thumb itself keeps the native drag.
  function enhanceRange(input, key) {
    input.addEventListener("pointerdown", (event) => {
      const rect = input.getBoundingClientRect();
      const min = Number(input.min);
      const max = Number(input.max);
      const usable = rect.width - THUMB_PX;
      const thumbX = rect.left + THUMB_PX / 2 + ((Number(input.value) - min) / (max - min)) * usable;
      if (Math.abs(event.clientX - thumbX) <= THUMB_PX) return;

      event.preventDefault();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - THUMB_PX / 2) / usable));
      actions.animateTo(key, min + ratio * (max - min));
      input.focus({ preventScroll: true });
    });

    input.addEventListener("input", () => actions.set(key, Number(input.value)));
  }

  enhanceRange(kelvinInput, "kelvin");
  enhanceRange(brightnessInput, "brightness");

  effectInputs.forEach((input) =>
    input.addEventListener("change", () => actions.set("effect", input.value))
  );

  timerInputs.forEach((input) =>
    input.addEventListener("change", () => {
      const minutes = Number(input.value);
      if (minutes > 0) actions.startTimer(minutes);
      else actions.cancelTimer();
    })
  );

  awakeButton.addEventListener("click", actions.toggleAwake);
  fullscreenButton.addEventListener("click", actions.toggleFullscreen);
  installButton.addEventListener("click", actions.install);
  $("help").addEventListener("click", () => {
    setOpen(false);
    actions.showHint();
  });
  toggle.addEventListener("click", () => setOpen(!isOpen()));

  const isOpen = () => panel.classList.contains("open");

  // Grow the panel out of the toggle button. Uses layout offsets, which ignore
  // the panel's current transform, so it is correct mid-animation too.
  function updateOrigin() {
    const anchor = toggle.getBoundingClientRect();
    const host = panel.getBoundingClientRect();
    const x = anchor.left + anchor.width / 2 - (host.left + inner.offsetLeft);
    const y = anchor.top + anchor.height / 2 - (host.top + inner.offsetTop);
    inner.style.setProperty("--origin-x", `${x}px`);
    inner.style.setProperty("--origin-y", `${y}px`);
  }

  function revealActivePreset() {
    const active = presetButtons.find((button) => button.getAttribute("aria-pressed") === "true");
    if (active) {
      presetList.scrollLeft = active.offsetLeft - (presetList.clientWidth - active.offsetWidth) / 2;
    }
  }

  function setOpen(open) {
    if (open === isOpen()) return;
    updateOrigin();
    if (open) revealActivePreset();
    panel.classList.toggle("open", open);
    panel.inert = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (!open && panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
    actions.onOpenChange(open);
  }

  function sync(state) {
    const name = describeKelvin(state.kelvin);
    kelvinInput.value = String(state.kelvin);
    kelvinInput.setAttribute("aria-valuetext", `${state.kelvin} kelvin, ${name}`);
    brightnessInput.value = String(state.brightness);
    brightnessInput.setAttribute("aria-valuetext", `${state.brightness} percent`);
    kelvinValue.textContent = String(state.kelvin);
    kelvinName.textContent = name;
    brightnessValue.textContent = `${state.brightness}%`;

    PRESETS.forEach((preset, index) => {
      presetButtons[index].setAttribute("aria-pressed", String(preset.kelvin === state.kelvin));
    });
    effectInputs.forEach((input) => {
      input.checked = input.value === state.effect;
    });
  }

  function syncTimer() {
    timerInputs.forEach((input) => {
      input.checked = timer.active ? Number(input.value) === timer.minutes : input.value === "0";
    });
    timerStatus.hidden = !timer.active;
    if (timer.active) {
      timerStatus.textContent = timer.done
        ? "Lights out."
        : `Fading to dark · ${formatRemaining(timer.remainingMs)} left`;
    }
  }

  function syncDevice({ awakeWanted, awakeActive, awakeSupported, fullscreen, fullscreenSupported, installable }) {
    awakeButton.hidden = !awakeSupported;
    awakeButton.setAttribute("aria-pressed", String(awakeWanted));
    awakeButton.title = awakeWanted && !awakeActive ? "Waiting for a tap to lock the screen on" : "";
    fullscreenButton.hidden = !fullscreenSupported;
    fullscreenButton.setAttribute("aria-pressed", String(fullscreen));
    installButton.hidden = !installable;
  }

  panel.inert = true;

  return { isOpen, setOpen, sync, syncTimer, syncDevice, contains: (node) => panel.contains(node) };
}
