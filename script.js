const STORAGE_KEY = "huectl-kelvin";
const KELVIN_MIN = 1500;
const KELVIN_MAX = 9000;
const DEFAULT_KELVIN = 4500;

const slider = document.getElementById("temp-slider");
const bottomOutput = document.getElementById("temp-value");
const panelOutput = document.getElementById("temp-panel-value");
const toggleButton = document.getElementById("toggle-panel");
const toggleIcon = toggleButton.querySelector(".toggle-icon");
const panel = document.getElementById("temp-panel");
const panelInner = document.querySelector(".panel-inner");
const sliderStep = Number.parseInt(slider.step, 10) || 1;

let animationFrameId = null;

function updateGenieOrigin() {
  const anchorRect = toggleIcon
    ? toggleIcon.getBoundingClientRect()
    : toggleButton.getBoundingClientRect();
  const panelRect = panelInner.getBoundingClientRect();
  const originX = anchorRect.left + anchorRect.width / 2 - panelRect.left;
  const originY = anchorRect.top + anchorRect.height / 2 - panelRect.top;

  panelInner.style.setProperty("--genie-origin-x", `${originX}px`);
  panelInner.style.setProperty("--genie-origin-y", `${originY}px`);
}

function clampKelvin(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_KELVIN;
  }
  return Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, Math.round(value)));
}

function quantizeToStep(value) {
  return Math.round(value / sliderStep) * sliderStep;
}

function valueFromClientX(clientX) {
  const rect = slider.getBoundingClientRect();
  const ratio = (clientX - rect.left) / rect.width;
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const rawValue = KELVIN_MIN + clampedRatio * (KELVIN_MAX - KELVIN_MIN);
  return clampKelvin(quantizeToStep(rawValue));
}

function currentThumbX() {
  const rect = slider.getBoundingClientRect();
  const range = KELVIN_MAX - KELVIN_MIN;
  const ratio = (Number.parseInt(slider.value, 10) - KELVIN_MIN) / range;
  return rect.left + ratio * rect.width;
}

function kelvinToRgb(kelvin) {
  const temp = kelvin / 100;
  let red;
  let green;
  let blue;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  const clampChannel = (channel) => Math.min(255, Math.max(0, Math.round(channel)));

  return {
    r: clampChannel(red),
    g: clampChannel(green),
    b: clampChannel(blue)
  };
}

function applyTemperature(kelvin) {
  const { r, g, b } = kelvinToRgb(kelvin);
  document.documentElement.style.setProperty("--bg-r", String(r));
  document.documentElement.style.setProperty("--bg-g", String(g));
  document.documentElement.style.setProperty("--bg-b", String(b));

  const label = `Current light temperature: ${kelvin}K`;
  bottomOutput.textContent = label;
  panelOutput.value = label;
  panelOutput.textContent = label;
}

function setKelvin(kelvin, persist) {
  slider.value = String(kelvin);
  applyTemperature(kelvin);
  if (persist) {
    saveKelvin(kelvin);
  }
}

function cancelAnimation() {
  if (animationFrameId !== null) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function animateKelvin(from, to) {
  cancelAnimation();

  if (from === to) {
    setKelvin(to, true);
    return;
  }

  const distance = Math.abs(to - from);
  const durationMs = Math.max(180, Math.min(620, distance * 0.09));
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const interpolated = from + (to - from) * eased;
    const stepped = clampKelvin(quantizeToStep(interpolated));

    setKelvin(stepped, false);

    if (progress < 1) {
      animationFrameId = window.requestAnimationFrame(tick);
      return;
    }

    animationFrameId = null;
    setKelvin(to, true);
  }

  animationFrameId = window.requestAnimationFrame(tick);
}

function setPanelOpen(isOpen) {
  updateGenieOrigin();
  panel.classList.toggle("open", isOpen);
  panel.setAttribute("aria-hidden", String(!isOpen));
  toggleButton.setAttribute("aria-expanded", String(isOpen));
}

function getSavedKelvin() {
  const saved = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
  return clampKelvin(saved);
}

function saveKelvin(value) {
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

function init() {
  const startKelvin = getSavedKelvin();
  setKelvin(startKelvin, false);
  updateGenieOrigin();

  slider.addEventListener("pointerdown", (event) => {
    const clickTarget = valueFromClientX(event.clientX);
    const thumbDistance = Math.abs(event.clientX - currentThumbX());

    if (thumbDistance <= 18) {
      cancelAnimation();
      return;
    }

    event.preventDefault();
    const startValue = clampKelvin(Number.parseInt(slider.value, 10));
    animateKelvin(startValue, clickTarget);
  });

  slider.addEventListener("input", (event) => {
    cancelAnimation();
    const target = event.target;
    const nextValue = clampKelvin(quantizeToStep(Number.parseInt(target.value, 10)));

    setKelvin(nextValue, true);
  });

  toggleButton.addEventListener("click", () => {
    const isOpen = !panel.classList.contains("open");
    setPanelOpen(isOpen);
  });

  window.addEventListener("resize", updateGenieOrigin);
  window.addEventListener("scroll", updateGenieOrigin, { passive: true });
}

init();
