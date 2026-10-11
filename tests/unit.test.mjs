// Unit tests for the parts that have no page in them: color, state, timer, effects.
//
//     node --test
import assert from "node:assert/strict";
import { mock, test } from "node:test";

// The modules are written for a browser. This is all of it they touch.
const storage = new Map();
const calls = [];
globalThis.document = { visibilityState: "visible", addEventListener() {} };
globalThis.window = {
  addEventListener() {},
  matchMedia: () => ({ matches: false }),
  setInterval: (...args) => setInterval(...args),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (...args) => setTimeout(...args),
  clearTimeout: (id) => clearTimeout(id),
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  },
  location: { search: "", pathname: "/", hash: "" },
  history: { replaceState: (...args) => calls.push(args) }
};

const color = await import("../js/color.js");
const store = await import("../js/store.js");
const { createTimer } = await import("../js/timer.js");
const { modulate } = await import("../js/effects.js");

const white = { kelvin: 5600, tint: 0, hue: 0, saturation: 0 };

test("the scale runs from orange to blue through white", () => {
  const [, warmGreen, warmBlue] = color.kelvinToRgb(color.KELVIN_MIN);
  assert.ok(warmGreen < 130 && warmBlue === 0, "1500K is a deep orange");
  const [coolRed, , coolBlue] = color.kelvinToRgb(color.KELVIN_MAX);
  assert.ok(coolRed < 230 && coolBlue === 255, "9000K is blue");
  assert.ok(color.kelvinToRgb(6500).every((channel) => channel > 245), "6500K is white");
  assert.deepEqual(color.lightColor(white, 1), [255, 237, 226]);
});

test("every preset is on the scale, in order, and has its own name", () => {
  const kelvins = color.PRESETS.map((preset) => preset.kelvin);
  assert.deepEqual(kelvins, [...kelvins].sort((a, b) => a - b));
  for (const preset of color.PRESETS) {
    assert.equal(preset.kelvin % color.KELVIN_STEP, 0);
    assert.ok(preset.kelvin >= color.KELVIN_MIN && preset.kelvin <= color.KELVIN_MAX);
    assert.equal(color.describeKelvin(preset.kelvin), preset.name);
  }
});

test("the dimmer keeps the color and ends in black", () => {
  const linear = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const full = color.lightColor({ ...white, kelvin: 3200 }, 1).map(linear);
  const dim = color.lightColor({ ...white, kelvin: 3200 }, 0.4).map(linear);
  for (const i of [1, 2]) {
    assert.ok(Math.abs(dim[i] / dim[0] - full[i] / full[0]) < 0.02, "channel ratios hold");
  }
  assert.ok(dim[0] < full[0] / 5, "40% on the dial is far less than 40% of the light");
  assert.deepEqual(color.lightColor(white, 0), [0, 0, 0]);
});

test("tint takes light away and never adds any", () => {
  const [r, g, b] = color.lightColor(white, 1);
  const magenta = color.lightColor({ ...white, tint: 100 }, 1);
  const green = color.lightColor({ ...white, tint: -100 }, 1);
  assert.ok(magenta[0] === r && magenta[1] < g && magenta[2] === b, "magenta is less green");
  assert.ok(green[0] < r && green[1] === g && green[2] < b, "green is less red and blue");
});

test("saturation carries the white to a pure hue", () => {
  assert.deepEqual(color.lightColor({ ...white, saturation: 100, hue: 0 }, 1), [255, 0, 0]);
  assert.deepEqual(color.lightColor({ ...white, saturation: 100, hue: 120 }, 1), [0, 255, 0]);
  assert.deepEqual(color.lightColor({ ...white, saturation: 100, hue: 240 }, 1), [0, 0, 255]);
  assert.deepEqual(color.lightColor({ ...white, saturation: 0, hue: 200 }, 1), color.lightColor(white, 1));
  assert.equal(color.describeLight({ ...white, kelvin: 3200 }), "Tungsten");
  assert.equal(color.describeLight({ ...white, saturation: 40, hue: 210 }), "Azure");
  assert.equal(color.describeHue(359), "Red");
});

test("the state refuses values a control could not have set", () => {
  assert.equal(store.clampKelvin(5623), 5600);
  assert.equal(store.clampKelvin(99999), color.KELVIN_MAX);
  assert.equal(store.clampKelvin(NaN), 5600);
  assert.equal(store.clampBrightness(0), store.BRIGHTNESS_MIN);

  const state = store.createStore(store.loadState({}));
  const seen = [];
  state.subscribe((next, previous) => seen.push([next.kelvin, previous.kelvin]));
  state.set({ kelvin: 3210, brightness: 300, tint: -500, hue: 400, saturation: 12.4, effect: "strobe" });
  assert.deepEqual(
    { ...state.get() },
    { kelvin: 3200, brightness: 100, tint: -100, hue: 359, saturation: 12, effect: "none", awake: true, locked: false, standby: false }
  );
  state.set({ kelvin: 3200 });
  assert.deepEqual(seen, [[3200, 5600]], "listeners hear changes, and only changes");
});

test("an address carries a light, once", () => {
  window.location.search = "?k=3200&b=60&tint=-10&h=210&s=80&fx=candle&timer=30";
  const launch = store.readLaunchParams();
  assert.deepEqual(launch, {
    overrides: { kelvin: 3200, brightness: 60, tint: -10, hue: 210, saturation: 80, effect: "candle" },
    timerMinutes: 30
  });
  assert.deepEqual(calls.at(-1), [null, "", "/"], "and is then taken out of the address bar");
  window.location.search = "";
});

test("the last light is kept, a lock and a blackout are not", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const save = store.createPersister();
  save({ ...store.loadState({ kelvin: 2700, hue: 30 }), locked: true, standby: true }, { color: "rgb(1 2 3)", hex: "#010203" });
  mock.timers.tick(1000);
  mock.timers.reset();

  assert.equal(JSON.parse(storage.get("huectl:v2")).paint.color, "rgb(1 2 3)");
  const loaded = store.loadState({});
  assert.equal(loaded.kelvin, 2700);
  assert.equal(loaded.hue, 30);
  assert.equal(loaded.locked, false);
  assert.equal(loaded.standby, false);
});

test("the sunset timer warms, fades to black and stops", () => {
  mock.timers.enable({ apis: ["setInterval", "Date"] });
  let changes = 0;
  const timer = createTimer(() => {
    changes += 1;
  });
  assert.deepEqual(timer.apply(5600, 1), { kelvin: 5600, level: 1 }, "idle, it leaves the light alone");

  timer.start(30);
  assert.ok(timer.active && !timer.done);
  mock.timers.tick(15 * 60_000);
  const half = timer.apply(5600, 1);
  assert.ok(Math.abs(half.level - 0.5) < 0.01 && Math.abs(half.kelvin - 3700) < 30, JSON.stringify(half));
  assert.equal(timer.apply(1600, 1).kelvin, 1600, "a light warmer than a sunset is not cooled");

  mock.timers.tick(15 * 60_000);
  assert.ok(timer.done);
  assert.equal(timer.apply(5600, 1).level, 0);
  const settled = changes;
  mock.timers.tick(60_000);
  assert.equal(changes, settled, "after lights out it stops ticking");

  timer.cancel();
  assert.ok(!timer.active);
  mock.timers.reset();
});

test("effects stay soft: no strobe hides in them", () => {
  assert.deepEqual(modulate("none", 1234), { gain: 1, kelvinShift: 0 });

  let steepest = 0;
  let last = modulate("candle", 0).gain;
  for (let ms = 10; ms < 120_000; ms += 10) {
    const { gain, kelvinShift } = modulate("candle", ms);
    assert.ok(gain >= 0.88 && gain <= 1.12 && Math.abs(kelvinShift) <= 150);
    steepest = Math.max(steepest, Math.abs(gain - last));
    last = gain;
  }
  assert.ok(steepest < 0.01, `the candle never jumps: ${steepest} in 10 ms`);

  assert.equal(modulate("breathe", 0).gain, 1);
  assert.ok(Math.abs(modulate("breathe", 5000).gain - 0.55) < 1e-9, "half way through a breath");
  assert.ok(Math.abs(modulate("breathe", 10_000).gain - 1) < 1e-9, "one breath is ten seconds");
});
