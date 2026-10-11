const root = document.documentElement;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function onDeviceChange(listener) {
  listeners.add(listener);
}

// Wake Lock -----------------------------------------------------------------

export const wakeLockSupported = "wakeLock" in navigator;
let sentinel = null;
let wanted = false;

export const isAwake = () => Boolean(sentinel && !sentinel.released);

export async function setWakeLock(on) {
  wanted = on;
  if (!wakeLockSupported) return;

  if (!on) {
    const current = sentinel;
    sentinel = null;
    await current?.release().catch(() => {});
    notify();
    return;
  }

  if (isAwake() || document.visibilityState !== "visible") return;
  try {
    sentinel = await navigator.wakeLock.request("screen");
    sentinel.addEventListener("release", () => {
      sentinel = null;
      notify();
    });
  } catch {
    // Some browsers refuse until a user gesture; main.js retries on the first one.
    sentinel = null;
  }
  notify();
}

// The system drops the lock whenever the page is hidden; take it back on return.
document.addEventListener("visibilitychange", () => {
  if (wanted && document.visibilityState === "visible") setWakeLock(true);
});

// Fullscreen ----------------------------------------------------------------

export const fullscreenSupported = Boolean(
  document.fullscreenEnabled || document.webkitFullscreenEnabled
);

export const isFullscreen = () =>
  Boolean(document.fullscreenElement || document.webkitFullscreenElement);

export function toggleFullscreen() {
  if (!fullscreenSupported) return;
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const request = root.requestFullscreen || root.webkitRequestFullscreen;
    Promise.resolve(request.call(root, { navigationUI: "hide" })).catch(() => {});
  }
}

document.addEventListener("fullscreenchange", notify);
document.addEventListener("webkitfullscreenchange", notify);

// Install prompt (Chromium only) ---------------------------------------------

let installPrompt = null;

export const canInstall = () => Boolean(installPrompt);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  notify();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  notify();
});

export async function install() {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  notify();
}

// Clicks -----------------------------------------------------------------------

let audio = null;
let samples = null;
let lastTick = 0;

// The click of a detent, built the way a mechanism makes one, in two movements
// a few milliseconds apart: the spring lets go, then the ball drops into the
// notch, knocks on the body and rattles as it settles. Each strike is a snap of
// noise with its top taken off, so it knocks instead of hissing, and the parts
// it sets ringing. It is made here, so the app ships without a sound file.
function clickSample(context) {
  const rate = context.sampleRate;
  const data = new Float32Array(Math.ceil(rate * 0.045));

  // One strike, `at` seconds in: noise below `cutoff`, and rings of [hertz, level, decay].
  function strike(at, level, cutoff, rings) {
    const soften = 1 - Math.exp((-2 * Math.PI * cutoff) / rate);
    let noise = 0;
    for (let i = Math.round(at * rate); i < data.length; i += 1) {
      const t = i / rate - at;
      noise += soften * (Math.random() * 2 - 1 - noise);
      let sample = 1.6 * noise * Math.exp(-t / 0.0007);
      for (const [hertz, gain, decay] of rings) {
        sample += gain * Math.sin(2 * Math.PI * hertz * t) * Math.exp(-t / decay);
      }
      data[i] += level * sample;
    }
  }

  // No mechanism lands twice alike: the drop comes a hair sooner or later each time.
  const drop = 0.0078 + Math.random() * 0.0018;
  strike(0, 0.85, 3000, [[1450, 0.55, 0.0015]]);
  // The body's knock is low. The quiet partial at 2.76 times its pitch is what a
  // steel part adds, and is why this reads as metal and not as wood.
  strike(drop, 1, 2200, [[540, 0.8, 0.0048], [230, 0.3, 0.007], [1490, 0.16, 0.002]]);
  strike(drop + 0.0055, 0.22, 2200, [[540, 0.5, 0.003]]);
  strike(drop + 0.0092, 0.1, 2200, []);

  const peak = data.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
  const buffer = context.createBuffer(1, data.length, rate);
  buffer.copyToChannel(data.map((value) => (value * 0.95) / peak), 0);
  return buffer;
}

// Browsers let sound start only from inside a tap or a key press, so this is
// called as the unit is opened, not just when the first click is due.
export function primeSound() {
  if (!window.AudioContext || !navigator.userActivation?.hasBeenActive) return;
  audio ??= new AudioContext();
  if (audio.state !== "running") audio.resume().catch(() => {});
}

// One detent of a knob or one press of a key: a click in the ear and, where
// the device can, a tick under the finger. `firm` is an end stop: lower and
// harder, and never skipped. The sound follows the device's own volume and,
// on a phone, its silent mode.
export function tick(firm = false) {
  const now = performance.now();
  if (!firm && now - lastTick < 30) return;
  lastTick = now;
  primeSound();
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(firm ? 14 : 8);
  if (audio?.state !== "running") return;

  // A handful of takes and a few percent of pitch, so a fast turn rattles like a
  // mechanism instead of droning like a recording.
  samples ??= Array.from({ length: 5 }, () => clickSample(audio));
  const buffer = samples[Math.floor(Math.random() * samples.length)];
  const playbackRate = firm ? 0.62 : 0.97 + Math.random() * 0.06;
  const source = new AudioBufferSourceNode(audio, { buffer, playbackRate });
  const level = new GainNode(audio, { gain: firm ? 0.6 : 0.36 });
  source.connect(level).connect(audio.destination);
  source.start();
}
