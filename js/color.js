export const KELVIN_MIN = 1500;
export const KELVIN_MAX = 9000;
export const KELVIN_STEP = 50;

export const PRESETS = [
  { name: "Candle", kelvin: 1900 },
  { name: "Incandescent", kelvin: 2700 },
  { name: "Halogen", kelvin: 3200 },
  { name: "Neutral", kelvin: 4000 },
  { name: "Daylight", kelvin: 5500 },
  { name: "Overcast", kelvin: 6500 },
  { name: "Blue sky", kelvin: 9000 }
];

const BANDS = [
  [1900, "Ember"],
  [2300, "Candlelight"],
  [2900, "Incandescent"],
  [3500, "Halogen"],
  [4500, "Neutral white"],
  [6000, "Daylight"],
  [7500, "Overcast"],
  [Infinity, "Blue sky"]
];

export function describeKelvin(kelvin) {
  const preset = PRESETS.find((candidate) => candidate.kelvin === kelvin);
  return preset ? preset.name : BANDS.find(([limit]) => kelvin < limit)[1];
}

const clampChannel = (value) => Math.min(255, Math.max(0, value));

// Neil Bartlett's refit of Tanner Helland's blackbody data: same cost,
// noticeably closer to the measured curve in the warm range.
export function kelvinToRgb(kelvin) {
  const t = kelvin / 100;
  let r;
  let g;
  let b;

  if (t < 66) {
    r = 255;
    const x = t - 2;
    g = -155.25485562709179 - 0.44596950469579133 * x + 104.49216199393888 * Math.log(x);
    if (t <= 20) {
      b = 0;
    } else {
      const y = t - 10;
      b = -254.76935184120902 + 0.8274096064007395 * y + 115.67994401066147 * Math.log(y);
    }
  } else {
    const x = t - 55;
    r = 351.97690566805693 + 0.114206453784165 * x - 40.25366309332127 * Math.log(x);
    const y = t - 50;
    g = 325.4494125711974 + 0.07943456536662342 * y - 28.0852963507957 * Math.log(y);
    b = 255;
  }

  return [clampChannel(r), clampChannel(g), clampChannel(b)];
}

const toLinear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (linear) => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

// `level` is perceived brightness in 0..1. Scaling linear light by level^2.2
// keeps the hue exact while making the dimmer feel even across its range.
export function lightColor(kelvin, level) {
  const gain = Math.max(0, level) ** 2.2;
  return kelvinToRgb(kelvin).map((channel) => toSrgb(toLinear(channel) * gain));
}

export function relativeLuminance([r, g, b]) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Black text beats white text on anything brighter than ~0.18 luminance.
export function toneFor(rgb) {
  return relativeLuminance(rgb) > 0.18 ? "light" : "dark";
}

export const rgbCss = ([r, g, b]) => `rgb(${r} ${g} ${b})`;

export const rgbHex = (rgb) =>
  `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

export function kelvinGradient(stops = 16) {
  const colors = [];
  for (let i = 0; i < stops; i += 1) {
    const kelvin = KELVIN_MIN + ((KELVIN_MAX - KELVIN_MIN) * i) / (stops - 1);
    colors.push(rgbCss(kelvinToRgb(kelvin).map(Math.round)));
  }
  return `linear-gradient(90deg, ${colors.join(", ")})`;
}
