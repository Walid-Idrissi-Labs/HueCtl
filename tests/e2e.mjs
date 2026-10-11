// End-to-end test: the app in a real Chrome, worked by touch, mouse and keyboard.
//
//     node tests/e2e.mjs
//
// It serves the folder itself and needs Chrome or Chromium (set CHROME if it is not in a
// usual place). Every line it prints is one behavior; it exits with 1 if any failed.
import { launch, openPage, serve, sleep } from "./browser.mjs";

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== "" ? `  (${detail})` : ""}`);
}

const server = await serve();
const browser = await launch();
try {
  const page = await openPage(browser);
  const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
  const text = (selector) => page.eval(`${q(selector)}.textContent`);
  const value = (id) => page.eval(`Number(document.getElementById("${id}").value)`);
  const has = (selector, name) => page.eval(`${q(selector)}.classList.contains("${name}")`);
  const pressed = (selector) => page.eval(`${q(selector)}.getAttribute("aria-pressed") === "true"`);
  const isOpen = () => has("#panel", "open");
  const idle = () => has("html", "idle");
  const light = () => page.eval(`getComputedStyle(document.documentElement).backgroundColor`);
  const digits = (color) => color.match(/\d+/g).join(",");
  const tapOn = async (selector) => {
    const box = await page.box(selector);
    await page.tap(box.x, box.y);
    await sleep(250);
  };
  const open = async (query = "") => {
    await page.goto(server.url + query);
    await page.eval(`document.getElementById("toggle-panel").click()`);
    await sleep(700);
  };

  // ------------------------------------------------------------ a phone, by touch
  await page.viewport({ width: 390, height: 844 });
  await page.goto(`${server.url}?k=5600&b=100`, 1200);
  check("the hint shows on a first visit", await has("#hint", "show"));

  await page.tap(195, 300);
  await sleep(800);
  check("a tap on the light opens nothing", !(await isOpen()));
  check("a tap dismisses the hint", !(await has("#hint", "show")));
  await page.tap(120, 500);
  await sleep(800);
  check("nor does a second tap", !(await isOpen()));

  let unit = await page.box("#panel");
  check("closed, the unit shows only its display, along the bottom edge", unit.bottom === 844 && unit.height < 120 && unit.width === 390, JSON.stringify(unit));
  check("closed, the knobs and keys are out of reach", await page.eval(`document.getElementById("controls").inert`));

  await tapOn("#toggle-panel");
  await sleep(600);
  check("a tap on the display opens the faceplate", await isOpen());
  check("open, the knobs and keys can be used", !(await page.eval(`document.getElementById("controls").inert`)));
  unit = await page.box("#panel");
  check("open, the unit is still inside the screen", unit.top >= 0 && unit.bottom === 844, JSON.stringify(unit));

  await page.tap(195, unit.top - 80);
  await sleep(900);
  check("a tap on the light puts the faceplate away", !(await isOpen()));

  await page.swipe(100, 300, 250, 300);
  await sleep(200);
  const swiped = await value("kelvin");
  check("a swipe to the right cools the light", swiped > 8000 && swiped <= 9000, swiped);
  check("the display follows the swipe", (await text("#kelvin-value")) === String(swiped), await text("#kelvin-value"));
  check("the swiped parameter is underlined", await has('[data-for="kelvin"]', "selected"));
  await page.swipe(195, 200, 195, 400);
  await sleep(200);
  const dimmed = await value("brightness");
  check("a swipe down dims it", dimmed > 60 && dimmed < 80, dimmed);
  check("the underline moves to brightness", (await has('[data-for="brightness"]', "selected")) && !(await has('[data-for="kelvin"]', "selected")));
  check("swiping opens nothing", !(await isOpen()));

  await sleep(4400);
  check("left alone, the unit goes idle", await idle());
  await sleep(600);
  const away = await page.box("#panel");
  check("idle, the unit is off the screen", away.top >= 844, away.top);
  await page.tap(195, 800);
  await sleep(900);
  check("a tap where the display was only brings it back", !(await isOpen()) && !(await idle()));
  await tapOn("#toggle-panel");
  await sleep(600);
  check("and the next tap on it opens the faceplate", await isOpen());
  await sleep(4400);
  check("an open unit never goes idle", !(await idle()));

  // ------------------------------------------------------------ knobs and keys
  await open("?k=5600&b=100");
  const cap = await page.box("#kelvin + .knob-cap");
  await page.turn(cap.x, cap.y, 20, 0, 90);
  await sleep(200);
  check("a quarter turn of the CCT knob is a third of its range", (await value("kelvin")) === 8100, await value("kelvin"));
  await page.turn(cap.x, cap.y, 20, 90, -180);
  await sleep(200);
  check("a knob stops at the end of its scale", (await value("kelvin")) === 1500, await value("kelvin"));
  const pointer = await page.eval(`${q("#kelvin")}.parentElement.style.getPropertyValue("--turn")`);
  check("and its index line points there", pointer === "-135deg", pointer);

  const sat = await page.box("#saturation + .knob-cap");
  await page.turn(sat.x, sat.y, 20, 0, 135);
  const hue = await page.box("#hue + .knob-cap");
  await page.turn(hue.x, hue.y, 20, 0, 180);
  await sleep(200);
  check("the knob in hand is underlined on the display", (await has('[data-for="hue"]', "selected")) && !(await has('[data-for="kelvin"]', "selected")));
  check("SAT and HUE give the light a color", (await value("saturation")) === 50 && (await value("hue")) > 200, `${await value("saturation")} ${await value("hue")}`);
  check("the display names the color", /^(Azure|Blue)$/.test(await text("#light-name")), await text("#light-name"));

  await tapOn("#presets .key:nth-child(3)");
  await sleep(900);
  check("preset key 3 is Tungsten at 3200K", (await value("kelvin")) === 3200 && (await text("#light-name")) === "Tungsten");
  check("a preset takes the color back out", (await value("saturation")) === 0);
  check("its lamp is lit, and only its lamp", (await pressed("#presets .key:nth-child(3)")) && !(await pressed("#presets .key:nth-child(5)")));

  const tint = await page.box("#tint + .knob-cap");
  await page.turn(tint.x, tint.y, 20, 0, -27);
  await sleep(200);
  check("the TINT knob leans the white toward green", (await text("#tint-value")) === "G20", await text("#tint-value"));
  const tinted = (await light()).match(/\d+/g).map(Number);
  check("which takes red and blue out of the light", tinted[1] === 187 && tinted[0] < 255, tinted);

  await tapOn("#effect");
  check("the FX key starts Candle", (await text("#flag-effect")) === "candle" && (await pressed("#effect")), await text("#flag-effect"));
  await tapOn("#effect");
  await tapOn("#effect");
  check("and comes round to steady", (await text("#flag-effect")) === "FX" && !(await pressed("#effect")));

  await tapOn("#timer");
  check("the TIMER key starts a 15 minute sunset", /^00:1[45]:\d\d$/.test(await text("#timecode")) && (await pressed("#timer")), await text("#timecode"));
  await tapOn("#timer");
  await tapOn("#timer");
  await tapOn("#timer");
  check("and comes round to off", (await text("#timecode")) === "--:--:--" && !(await pressed("#timer")), await text("#timecode"));

  await tapOn("#power");
  check("the PWR key puts the light out", (await light()) === "rgb(0, 0, 0)" && (await has("#flag-standby", "on")), await light());
  await tapOn("#power");
  check("and brings it back", (await light()) !== "rgb(0, 0, 0)" && !(await has("#flag-standby", "on")));

  await tapOn("#lock");
  const before = await value("kelvin");
  check("the LOCK key shows on the display", (await has("#flag-lock", "on")) && (await pressed("#lock")));
  await page.turn(cap.x, cap.y, 20, 0, 120);
  await tapOn("#presets .key:nth-child(7)");
  await tapOn("#power");
  check("locked, knobs and keys change nothing", (await value("kelvin")) === before && (await light()) !== "rgb(0, 0, 0)", await value("kelvin"));
  await page.key("ArrowRight");
  await page.key("9", "Digit9");
  check("locked, the keyboard changes nothing", (await value("kelvin")) === before);
  await page.eval(`document.getElementById("toggle-panel").click()`);
  await sleep(700);
  await page.swipe(100, 300, 280, 300);
  check("locked, a swipe changes nothing", (await value("kelvin")) === before, await value("kelvin"));
  await page.key("l", "KeyL");
  await page.key("ArrowRight");
  check("L unlocks it", (await value("kelvin")) === before + 100 && !(await has("#flag-lock", "on")), await value("kelvin"));

  // ------------------------------------------------------------ keyboard
  await open("?k=5600&b=100");
  await page.key("Escape");
  await sleep(500);
  check("Escape closes the faceplate", !(await isOpen()));
  await page.eval(`document.activeElement.blur()`);
  await page.key(" ", "Space");
  await sleep(500);
  check("Space opens it", await isOpen());
  await page.key("Escape");
  await page.eval(`document.activeElement.blur()`);
  await page.key("e", "KeyE");
  check("E starts an effect and says so", (await text("#flag-effect")) === "candle" && (await text("#hud")) === "Candle", await text("#hud"));
  await page.key("e", "KeyE");
  await page.key("e", "KeyE");
  await page.key("2", "Digit2");
  await sleep(900);
  check("2 calls up Incandescent", (await value("kelvin")) === 2700);
  await page.key("ArrowDown");
  await page.key("ArrowUp");
  await page.key("ArrowLeft");
  check("the arrows step the light and say where it is", (await text("#hud")) === "2600K · 100%", await text("#hud"));
  await page.key("p", "KeyP");
  await sleep(100);
  check("P puts the light out and says so", (await light()) === "rgb(0, 0, 0)" && (await text("#hud")) === "Light off");
  await page.key("p", "KeyP");
  const hud = await page.box("#hud");
  check("what is said is not shown", hud.width <= 1 && hud.height <= 1);

  // ------------------------------------------------------------ what a launch remembers
  await open("?k=3200&b=60&tint=-10&h=210&s=80");
  check("an address can carry the whole light", (await value("tint")) === -10 && (await value("hue")) === 210 && (await value("saturation")) === 80);
  await tapOn("#lock");
  await tapOn("#lock");
  await tapOn("#lock");
  await page.eval(`window.dispatchEvent(new Event("pagehide"))`);
  const color = digits(await light());
  await page.goto(server.url);
  const painted = await page.eval(`document.documentElement.style.getPropertyValue("--light")`);
  check("the last light is painted before the app loads", digits(painted) === color, `${painted} vs ${color}`);
  check("and comes back as it was", (await value("kelvin")) === 3200 && (await value("saturation")) === 80);
  check("but a lock does not outlive the session", !(await has("#flag-lock", "on")));

  // ------------------------------------------------------------ the sunset timer
  await page.goto(`${server.url}?k=2700&b=70&timer=0.02`, 2600);
  check("when the timer ends the light is out", (await has("html", "timer-done")) && (await light()) === "rgb(0, 0, 0)");
  await page.tap(195, 400);
  await sleep(700);
  check("and a tap brings it back without opening anything", !(await has("html", "timer-done")) && !(await isOpen()));

  // ------------------------------------------------------------ a desktop, by mouse
  await page.viewport({ width: 1280, height: 800, scale: 1, mobile: false });
  await page.goto(`${server.url}?k=5600&b=100`);
  await page.click(640, 300);
  await sleep(700);
  check("a click on the light opens nothing", !(await isOpen()));
  const display = await page.box("#toggle-panel");
  await page.click(display.x, display.y);
  await sleep(700);
  check("a click on the display opens the faceplate", await isOpen());
  await page.click(100, 100);
  await sleep(700);
  check("a click on the light closes it", !(await isOpen()));

  // ------------------------------------------------------------ screens of every shape
  // Each is tried twice, as it comes and in a wide font: a phone's own font can be a good
  // deal wider than the one this was drawn in, and the fullest status line has to fit.
  const WIDE = '*, *::before, *::after { font-family: Verdana, "DejaVu Sans", sans-serif !important; }';
  for (const [width, height] of [[320, 568], [360, 640], [740, 360], [1024, 1366]]) {
    for (const font of ["", WIDE]) {
      await page.viewport({ width, height, scale: 1 });
      await page.goto(`${server.url}?k=4200&b=100&fx=breathe&timer=15`);
      await page.eval(`document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(font)} }))`);
      await page.eval(`document.getElementById("toggle-panel").click()`);
      await sleep(700);
      const fits = await page.eval(`(() => {
        const unit = document.getElementById("panel").getBoundingClientRect();
        const inside = [...document.querySelectorAll(".glass, .flags, .chin, .cell, .knob-cap, .key:not([hidden])")].every((part) => {
          const box = part.getBoundingClientRect();
          return box.left >= unit.left && box.right <= unit.right + 0.5;
        });
        const page = document.documentElement;
        return inside && unit.left >= 0 && unit.right <= innerWidth && unit.top >= 0 && page.scrollWidth <= innerWidth && page.scrollHeight <= innerHeight;
      })()`);
      check(`everything fits a ${width} by ${height} screen${font ? " in a wide font" : ""}`, fits);
    }
  }

  check("nothing was logged as an error", page.errors.length === 0, page.errors.join(" | "));
} finally {
  browser.close();
  server.close();
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
