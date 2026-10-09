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
