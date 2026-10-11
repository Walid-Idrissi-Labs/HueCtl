#!/usr/bin/env node
// Redraws the README artwork in assets/readme:
//
//     node scripts/readme-art.mjs
//
// The colors of the page are in COLORS, as a light and a dark value each. The light is
// never restated here: its colors, presets and ranges come from js/color.js and
// js/store.js. The control unit is drawn to the app's own measurements (UNIT, below), so
// when index.html or styles.css change it, unit() has to follow.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { KELVIN_MAX, KELVIN_MIN, PRESETS, describeLight, lightColor, rgbHex } from "../js/color.js";
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN, HUE_MAX, TINT_MAX } from "../js/store.js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const out = "assets/readme";
mkdirSync(out, { recursive: true });

const SANS = '-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI","Helvetica Neue",Arial,sans-serif';
const SERIF = 'ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif';
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';

// Light and dark values of every color the page around the drawings uses.
const COLORS = {
  "ground-a": ["#f6f6f4", "#202022"],
  "ground-b": ["#e9e9e6", "#161618"],
  edge: ["#1c1c1e14", "#ffffff14"],
  ink: ["#1c1c1e", "#f5f5f7"],
  soft: ["#5e5e62", "#a1a1a6"],
  faint: ["#8e8e93", "#77777c"],
  pill: ["#ffffff", "#2a2a2d"],
  "pill-edge": ["#1c1c1e26", "#ffffff2e"]
};

// The control unit is the same in both schemes, as it is in the app (styles.css).
const U = { body: "#18181a", edge: "#2b2b2e", glass: "#050506", ink: "#ededee", soft: "#909094", dim: "#4b4b4f", line: "#ffffff17", red: "#e2231a", green: "#3bd16f" };
const DAYLIGHT = { kelvin: 5600, brightness: 100, tint: 0, hue: 0, saturation: 0 };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (value) => Number(value.toFixed(2));
const hex = (light, level = 1) => rgbHex(lightColor({ ...DAYLIGHT, ...light }, level));

function style(extra = "") {
  const scheme = (index) => Object.entries(COLORS).map(([key, value]) => `--${key}:${value[index]};`).join("");
  return (
    `<style>svg{${scheme(0)}}@media (prefers-color-scheme:dark){svg{${scheme(1)}}}` +
    `text{font-family:${SANS}}.serif{font-family:${SERIF};font-style:italic}.mono{font-family:${MONO}}` +
    `.ink{fill:var(--ink)}.soft{fill:var(--soft)}.faint{fill:var(--faint)}` +
    `.u-ink{fill:${U.ink}}.u-soft{fill:${U.soft}}.u-dim{fill:${U.dim}}.u-green{fill:${U.green}}.u-red{fill:${U.red}}${extra}</style>`
  );
}

const gradient = (name, stops, vertical = true) =>
  `<linearGradient id="${name}"${vertical ? ' x1="0" y1="0" x2="0" y2="1"' : ""}>${stops.map(([offset, color]) => `<stop offset="${offset}" ${color.startsWith("var") ? `style="stop-color:${color}"` : `stop-color="${color}"`}/>`).join("")}</linearGradient>`;

const text = (x, y, s, size, cls = "ink", weight = 400, anchor = "middle", extra = "") =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="${weight}" text-anchor="${anchor}" class="${cls}"${extra}>${esc(s)}</text>`;

const rect = (x, y, w, h, rx, attrs) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(rx)}" ${attrs}/>`;
const circle = (cx, cy, r, attrs) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attrs}/>`;
const scaled = (x, y, scale, body) => `<g transform="translate(${n(x)} ${n(y)}) scale(${scale})">${body}</g>`;

const GROUND = gradient("ground", [[0, "var(--ground-a)"], [1, "var(--ground-b)"]]);
const card = (w, h, rx = 18) =>
  rect(0, 0, w, h, rx, 'fill="url(#ground)"') + rect(0.5, 0.5, w - 1, h - 1, rx - 0.5, 'fill="none" style="stroke:var(--edge)"');

function svg(name, w, h, title, body, defs = "", extraStyle = "") {
  const doc =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title>${style(extraStyle)}<defs>${defs}</defs>${body}</svg>\n`;
  writeFileSync(`${out}/${name}`, doc);
  console.log(`${name}: ${doc.length} bytes`);
}

// ---------------------------------------------------------------- the control unit
// The app's own layout, measured from the page: upright on a 390 wide phone, and with the
// keys beside the knobs on a short, wide screen. knobs and keys are [left, width, y, y].
const UNIT = {
  upright: { w: 390, h: 341.3, cap: 52.65, knobs: [9, 372, 142.2, 182.6], keys: [9, 372, 198.1, 254.9], legends: 311.7 },
  wide: { w: 736, h: 250.3, cap: 64, knobs: [9, 375.5, 153.5, 199.6], keys: [400.5, 326.5, 107.1, 163.9], legends: 220.7 }
};

const UNIT_DEFS =
  gradient("u-body", [[0, U.edge], [1, U.body]]) +
  gradient("u-key", [[0, "#343437"], [1, "#1d1d1f"]]) +
  gradient("u-power", [[0, "#f2382d"], [1, "#ac130c"]]) +
  gradient("u-sheen", [[0, "#ffffff26"], [0.5, "#ffffff00"], [1, "#ffffff12"]]) +
  '<radialGradient id="u-face"><stop offset="0" stop-color="#303034"/><stop offset="0.6" stop-color="#1b1b1d"/><stop offset="1" stop-color="#0d0d0e"/></radialGradient>' +
  '<filter id="u-glow" x="-100%" y="-300%" width="300%" height="700%"><feGaussianBlur stdDeviation="2.4"/></filter>';

// The scale printed round every knob: eleven marks over 270 degrees, as in styles.css.
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const angle = ((-135 + 27 * i - 90) * Math.PI) / 180;
  const inner = i % 10 ? 44 : 41;
  return `M${n(inner * Math.cos(angle))} ${n(inner * Math.sin(angle))}L${n(48.5 * Math.cos(angle))} ${n(48.5 * Math.sin(angle))}`;
}).join("");

function knob(cx, cy, size, turn, legend, legendY, selected) {
  const r = size / 2;
  return (
    `<path transform="translate(${n(cx)} ${n(cy)}) scale(${n((size + 17.6) / 100)})" d="${TICKS}" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1.5" stroke-linecap="round" fill="none"/>` +
    circle(cx, cy + 5, r * 0.94, 'fill="#000000" opacity="0.55"') +
    circle(cx, cy, r, 'fill="#0f0f10" stroke="#000000"') +
    circle(cx, cy, r * 0.94, `fill="none" stroke="#3d3d41" stroke-width="${n(r * 0.12)}" stroke-dasharray="${n(r * 0.052)}"`) +
    circle(cx, cy, r * 0.76, 'fill="url(#u-face)" stroke="#000000"') +
    circle(cx, cy, r * 0.76, 'fill="url(#u-sheen)"') +
    `<rect transform="rotate(${n(turn)} ${n(cx)} ${n(cy)})" x="${n(cx - 1.3)}" y="${n(cy - r * 0.9)}" width="2.6" height="${n(r * 0.72)}" rx="1" fill="${selected ? U.red : U.ink}"/>` +
    text(cx, legendY, legend, 9.92, "u-ink", 750, "middle", ' letter-spacing="1.4"')
  );
}

function key(x, y, w, legend, lamp, power = false) {
  const lit = { green: U.green, red: U.red, white: "#ffffff" }[lamp];
  return (
    rect(x, y + 2, w, 44, 6.4, 'fill="#000000"') +
    rect(x, y, w, 44, 6.4, `fill="url(#${power ? "u-power" : "u-key"})" stroke="#000000"`) +
    `<path d="M${n(x + 5)} ${n(y + 1.5)}H${n(x + w - 5)}" stroke="#ffffff" stroke-opacity="0.17"/>` +
    (lit ? rect(x + w / 2 - 9, y + 4, 18, 5.4, 2, `fill="${lit}" filter="url(#u-glow)" opacity="0.9"`) : "") +
    rect(x + w / 2 - 7.2, y + 5.4, 14.4, 2.7, 1, `fill="${lit ?? "#060606"}"${lit ? "" : ' stroke="#ffffff" stroke-opacity="0.07"'}`) +
    legend
  );
}

const screw = (cx, cy) => circle(cx, cy, 4, 'fill="#060607"') + circle(cx, cy, 2.7, 'fill="#4c4c50"') + circle(cx, cy, 1.3, 'fill="#070708"');

// The unit with its faceplate open, its top left corner at the origin. `state` is a light,
// with `selected` (the knob in hand), `effect`, `timecode`, `locked` and `standby`.
function unit(layout, state = {}) {
  const { w, h, cap, knobs: [knobsX, knobsW, knobY, legendY], keys: [keysX, keysW, presetsY, functionsY], legends } = UNIT[layout];
  const light = { ...DAYLIGHT, selected: "kelvin", ...state };
  const cell = (w - 18) / 5;
  const right = w - 17.8;

  const KNOBS = [
    ["kelvin", "CCT", light.kelvin, "K", KELVIN_MIN, KELVIN_MAX],
    ["brightness", "INT", light.brightness, "%", BRIGHTNESS_MIN, BRIGHTNESS_MAX],
    ["tint", "TINT", light.tint ? `${light.tint < 0 ? "G" : "M"}${Math.abs(light.tint)}` : "0", "", -TINT_MAX, TINT_MAX],
    ["hue", "HUE", light.hue, "°", 0, HUE_MAX],
    ["saturation", "SAT", light.saturation, "%", 0, 100]
  ];

  const cells = KNOBS.map(([id, label, value, suffix], i) => {
    const cx = 9 + cell * (i + 0.5);
    return (
      (i ? `<path d="M${n(9 + cell * i)} 9.5V52" stroke="${U.line}"/>` : "") +
      (light.selected === id ? rect(9 + cell * i, 50, cell, 2, 0, `fill="${U.red}"`) : "") +
      text(cx, 23.8, label, 8.96, "u-soft", 650, "middle", ' letter-spacing="1.1"') +
      `<text x="${n(cx)}" y="42.6" text-anchor="middle" font-size="16.8" font-weight="550" class="u-ink">${esc(value)}<tspan font-size="9.92" font-weight="650" class="u-soft" dx="1">${suffix}</tspan></text>`
    );
  }).join("");

  // The status line is set from the right: the timecode, then the four flags.
  let x = right - 52.6 - 9.6;
  const flags = [["STBY", light.standby, "u-red"], ["LOCK", light.locked, "u-red"], ["AWAKE", true, "u-green"], [light.effect ?? "FX", Boolean(light.effect), "u-green"]]
    .map(([label, on, color]) => {
      const drawn = text(x, 66.3, label.toUpperCase(), 9.28, on ? color : "u-dim", 700, "end", ' letter-spacing="0.95"');
      x -= label.length * 7.3 + 9.6;
      return drawn;
    })
    .join("");

  const column = knobsW / 5;
  const dials = KNOBS.map(([id, label, , , min, max], i) =>
    knob(knobsX + column * (i + 0.5), knobY, cap, ((light[id] - min) / (max - min) - 0.5) * 270, label, legendY, light.selected === id)
  ).join("");

  const presetW = (keysW - 5.6 * 6) / 7;
  const presets = PRESETS.map((preset, i) => {
    const left = keysX + i * (presetW + 5.6);
    const on = light.saturation === 0 && preset.kelvin === light.kelvin;
    const legend =
      text(left + presetW / 2, presetsY + 26.9, i + 1, 12.8, "u-ink", 700) +
      text(left + presetW / 2, presetsY + 35.6, preset.kelvin, 8, "mono u-soft", 500);
    return key(left, presetsY, presetW, legend, on ? "green" : null);
  }).join("");

  const functionW = (keysW - 5.6 * 5) / 6;
  const functions = [["FX", light.effect ? "green" : null], ["TIMER", light.timecode ? "green" : null], ["AWAKE", "green"], ["FULL", null], ["LOCK", light.locked ? "red" : null], ["PWR", light.standby ? null : "white"]]
    .map(([label, lamp], i) => {
      const left = keysX + i * (functionW + 5.6);
      const legend = text(left + functionW / 2, functionsY + 30.2, label, 9.6, "u-ink", 750, "middle", ' letter-spacing="0.95"');
      return key(left, functionsY, functionW, legend, lamp, label === "PWR");
    })
    .join("");

  return (
    `<path d="M0 ${h}V13.6Q0 0 13.6 0H${w - 13.6}Q${w} 0 ${w} 13.6V${h}Z" fill="${U.body}" stroke="#000000"/>` +
    `<path d="M0.5 44V13.6Q0.5 0.5 13.6 0.5H${w - 13.6}Q${w - 0.5} 0.5 ${w - 0.5} 13.6V44Z" fill="url(#u-body)"/>` +
    `<path d="M13 1.5H${w - 13}" stroke="#ffffff" stroke-opacity="0.16"/>` +
    rect(9, 9, w - 18, 64.9, 4.8, `fill="${U.glass}" stroke="#000000"`) +
    cells +
    `<path d="M9.5 52H${w - 9.5}" stroke="${U.line}"/>` +
    text(17.8, 66.3, describeLight(light).toUpperCase(), 9.28, "u-ink", 700, "start", ' letter-spacing="0.95"') +
    flags +
    text(right, 66.6, light.timecode ?? "--:--:--", 10.56, `mono ${light.timecode ? "u-ink" : "u-dim"}`, 700, "end") +
    screw(15.8, 86.3) + screw(w - 15.8, 86.3) +
    text(25.8, 90.4, "HUECTL", 11.84, "u-ink", 800, "start", ' letter-spacing="0.95"') +
    text(88.5, 89.6, "SB-1", 8.96, "u-soft", 650, "start", ' letter-spacing="1.4"') +
    text(w - 25.8, 89.6, "CLOSE ▾", 8.96, "u-ink", 650, "end", ' letter-spacing="1.4"') +
    dials + presets + functions +
    screw(15.8, legends + 8.8) + screw(w - 15.8, legends + 8.8) +
    text(25.8, legends + 12.4, "How it works", 11.2, "u-soft", 400, "start", ' text-decoration="underline"')
  );
}

// ---------------------------------------------------------------- hero
// A studio in the dark: one screen lit as daylight, the unit open across the foot of it.
const SCREEN = { x: 96, y: 352, w: 1008, h: 308 };
const HERO_SCALE = 1;
const hero =
  rect(0, 0, 1200, 680, 32, 'fill="url(#night)"') +
  rect(0.5, 0.5, 1199, 679, 31.5, 'fill="none" stroke="#ffffff" stroke-opacity="0.08"') +
  rect(417, 44, 366, 38, 19, 'fill="#1b1b1d" stroke="#ffffff" stroke-opacity="0.12"') +
  circle(441, 63, 5, `fill="${U.red}"`) +
  text(457, 68.5, "A softbox in the browser · nothing to install", 15, "h-soft", 600, "start", ' textLength="306" lengthAdjust="spacingAndGlyphs"') +
  text(600, 178, "Any screen.", 86, "h-ink", 700, "middle", ' letter-spacing="-2.5"') +
  `<text x="600" y="270" font-size="92" text-anchor="middle" class="serif" fill="${hex({})}" letter-spacing="-1">A softbox.</text>` +
  text(600, 322, "Five knobs, thirteen keys and a display, for the light your screen already is.", 23, "h-soft", 400) +
  rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 26, `fill="${hex({})}" filter="url(#bloom)" opacity="0.5"`) +
  rect(SCREEN.x - 9, SCREEN.y - 9, SCREEN.w + 18, SCREEN.h + 18, 35, 'fill="#050506" stroke="#ffffff" stroke-opacity="0.16"') +
  `<g clip-path="url(#screen)">${rect(SCREEN.x, SCREEN.y, SCREEN.w, SCREEN.h, 0, `fill="${hex({})}"`)}` +
  scaled(600 - (UNIT.wide.w * HERO_SCALE) / 2, SCREEN.y + SCREEN.h - UNIT.wide.h * HERO_SCALE, HERO_SCALE, unit("wide")) +
  "</g>";
svg("hero.svg", 1200, 680, "Any screen. A softbox. Five knobs, thirteen keys and a display, for the light your screen already is.", hero,
  UNIT_DEFS +
    gradient("night", [[0, "#17171a"], [1, "#070708"]]) +
    '<filter id="bloom" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="34"/></filter>' +
    `<clipPath id="screen"><rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" rx="26"/></clipPath>`,
  ".h-ink{fill:#f5f5f7}.h-soft{fill:#a1a1a6}");

// ---------------------------------------------------------------- buttons
const ARROW = '<path d="M-6 6L6 -6M-3 -6H6V3" fill="none" style="stroke:var(--on)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
svg(
  "open.svg", 216, 56, "Open HueCtl",
  rect(1, 1, 214, 54, 27, 'style="fill:var(--ink);stroke:var(--edge)"') +
    `<g transform="translate(42 28)">${ARROW}</g>` +
    text(64, 34, "Open HueCtl", 18, "on", 650, "start", ' textLength="112" lengthAdjust="spacingAndGlyphs"'),
  "",
  "svg{--on:#ffffff}@media (prefers-color-scheme:dark){svg{--on:#1c1c1e}}.on{fill:var(--on)}"
);
for (const [name, title, width, length] of [["install.svg", "Install as an app", 208, 140], ["local.svg", "Run it locally", 180, 112]]) {
  svg(
    name, width, 56, title,
    rect(1, 1, width - 2, 54, 27, 'style="fill:var(--pill);stroke:var(--pill-edge)"') +
      text(width / 2, 34, title, 18, "ink", 600, "middle", ` textLength="${length}" lengthAdjust="spacingAndGlyphs"`)
  );
}

// ---------------------------------------------------------------- the unit, part by part
// Drawn as a camera manual draws its panels: the unit, and a numbered mark on each part.
const PARTS = { w: 620, h: 500, x: 76, y: 70, scale: 1.2 };
const at = (x, y) => [PARTS.x + x * PARTS.scale, PARTS.y + y * PARTS.scale];
function mark(number, side, x, y) {
  const [tx, ty] = at(x, y);
  const cx = side === "left" ? 34 : PARTS.w - 34;
  return (
    `<path d="M${cx} ${n(ty)}H${n(tx)}" stroke="${U.red}" stroke-width="2"/>` +
    circle(tx, ty, 3.5, `fill="${U.red}"`) +
    circle(cx, ty, 16, `fill="${U.red}"`) +
    text(cx, ty + 5.8, number, 16.5, "on-red", 700)
  );
}
const parts =
  card(PARTS.w, PARTS.h) +
  '<g clip-path="url(#parts)">' +
  rect(PARTS.x - 11, -40, UNIT.upright.w * PARTS.scale + 22, PARTS.h + 80, 0, 'fill="#0a0a0b"') +
  rect(PARTS.x, 0, UNIT.upright.w * PARTS.scale, PARTS.h, 0, `fill="${hex({ kelvin: 3200, tint: -20 })}"`) +
  scaled(PARTS.x, PARTS.y, PARTS.scale, unit("upright", { kelvin: 3200, tint: -20, selected: "tint", timecode: "00:14:59" })) +
  "</g>" +
  mark(1, "left", 9, 31) +
  mark(2, "right", 381, 63) +
  mark(3, "left", 20, 142.2) +
  mark(4, "right", 381, 220) +
  mark(5, "left", 9, 277) +
  mark(6, "right", 381, 277);
svg("unit.svg", PARTS.w, PARTS.h,
  "The control unit over a tungsten light, with its parts numbered: 1 the display, 2 the status line, 3 the five knobs, 4 the preset keys, 5 the function keys, 6 the red power key.",
  parts, GROUND + UNIT_DEFS + `<clipPath id="parts"><rect width="${PARTS.w}" height="${PARTS.h}" rx="18"/></clipPath>`, ".on-red{fill:#ffffff}");

// ---------------------------------------------------------------- what each knob does
// A strip a knob: the light the app paints as that knob goes from one end stop to the other.
const STRIPS = [
  ["CCT", "kelvin", KELVIN_MIN, KELVIN_MAX, {}, `${KELVIN_MIN}K`, `${KELVIN_MAX}K`],
  ["INT", "brightness", BRIGHTNESS_MIN, BRIGHTNESS_MAX, {}, `${BRIGHTNESS_MIN}%`, `${BRIGHTNESS_MAX}%`],
  ["TINT", "tint", -TINT_MAX, TINT_MAX, {}, `G${TINT_MAX}`, `M${TINT_MAX}`],
  ["HUE", "hue", 0, HUE_MAX, { saturation: 100 }, "0°", `${HUE_MAX}°`],
  ["SAT", "saturation", 0, 100, { hue: 210 }, "0%", "100%"]
];
const W = 760, ROW = 68, BAR_X = 112, BAR_W = 536, TOP = 66, H = TOP + ROW * STRIPS.length + 2;

function sweep([label, id, from, to, base]) {
  const stops = Array.from({ length: 25 }, (_, i) => {
    const value = from + ((to - from) * i) / 24;
    return [n(i / 24), hex({ ...base, [id]: value }, id === "brightness" ? value / 100 : 1)];
  });
  return gradient(`strip-${label}`, stops, false);
}

const rows = STRIPS.map(([label, , , , , low, high], i) => {
  const y = TOP + ROW * i;
  return (
    text(BAR_X - 18, y + 25, label, 15, "ink", 750, "end", ' letter-spacing="1.5"') +
    rect(BAR_X, y, BAR_W, 38, 10, `fill="url(#strip-${label})" style="stroke:var(--edge)"`) +
    text(BAR_X + 2, y + 54, low, 12, "mono soft", 500, "start") +
    text(BAR_X + BAR_W - 2, y + 54, high, 12, "mono soft", 500, "end")
  );
}).join("");

// The seven preset keys, set down on the CCT strip where each one lands.
const stops =
  text(W / 2, TOP - 22, PRESETS.map((preset, i) => `${i + 1} ${preset.name}`).join("   ·   "), 13, "soft", 500) +
  PRESETS.map((preset, i) => {
    const x = BAR_X + ((preset.kelvin - KELVIN_MIN) / (KELVIN_MAX - KELVIN_MIN)) * BAR_W;
    const left = Math.min(Math.max(x, BAR_X + 13), BAR_X + BAR_W - 13) - 9;
    return rect(left, TOP + 10, 18, 18, 4.5, 'fill="#1d1d1f" stroke="#000000"') + text(left + 9, TOP + 23.4, i + 1, 11.5, "u-ink", 700);
  }).join("");

svg("knobs.svg", W, H,
  `What each knob does to the light, from one end stop to the other: CCT from ${KELVIN_MIN}K to ${KELVIN_MAX}K with the seven preset keys marked on it, INT from ${BRIGHTNESS_MIN} to ${BRIGHTNESS_MAX} percent, TINT from green to magenta, HUE round the color wheel, and SAT from white to a pure color.`,
  card(W, H) + rows + stops, GROUND + STRIPS.map(sweep).join(""));

// ---------------------------------------------------------------- stats
const CODE = ["index.html", "styles.css", "sw.js", "manifest.webmanifest", ...readdirSync("js").map((file) => `js/${file}`)];
const gzipped = CODE.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
const checks = readFileSync("tests/e2e.mjs", "utf8").match(/^\s*check\(/gm).length;
const STATS = [
  ["5", "knobs, one for each setting"],
  [String(PRESETS.length + 6), "keys, each with its own lamp"],
  [`${KELVIN_MAX - KELVIN_MIN}K`, `of white: ${KELVIN_MIN}K to ${KELVIN_MAX}K`],
  [`${HUE_MAX + 1}°`, "of hue, at any saturation"],
  ["0", "menus opened by a stray tap"],
  [`${Math.round(gzipped / 1000)} kB`, "of code in all, gzipped"],
  ["0", "dependencies or build steps"],
  [String(checks), "checks in a real browser"]
];
const CW = 282, CH = 126, CG = 24;
const cards = STATS.map(([figure, caption], i) => {
  const x = (i % 4) * (CW + CG), y = Math.floor(i / 4) * (CH + CG);
  return (
    rect(x + 0.5, y + 0.5, CW - 1, CH - 1, 18, 'fill="url(#ground)" style="stroke:var(--edge)"') +
    text(x + 26, y + 64, figure, 44, "ink", 700, "start", ' letter-spacing="-1"') +
    text(x + 26, y + 96, caption, 17, "soft", 400, "start")
  );
}).join("");
svg("stats.svg", 4 * CW + 3 * CG, 2 * CH + CG, STATS.map(([figure, caption]) => `${figure} ${caption}`).join("; "), cards, GROUND);
