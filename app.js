const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20"];
const MAX_DICE = 10;
const DEFAULT_COLOR = "#202020";

const table = document.getElementById("table");
const picker = document.getElementById("dice-picker");
const cap = document.getElementById("cap");
const colorToggle = document.getElementById("color-toggle");
const colorDot = document.getElementById("color-dot");
const colorPanel = document.getElementById("color-panel");
const colorWheel = document.getElementById("color-wheel");
const colorPreview = document.getElementById("color-preview");
const colorBrightness = document.getElementById("color-brightness");
const colorReset = document.getElementById("color-reset");
const colorClose = document.getElementById("color-close");
const rollButton = document.getElementById("roll-btn");
const clearButton = document.getElementById("clear-btn");
const result = document.getElementById("result");
const notationEl = document.getElementById("notation");
const breakdownEl = document.getElementById("breakdown");
const totalEl = document.getElementById("total");
const statusEl = document.getElementById("status");

const counts = {
  d4: 0,
  d6: 0,
  d8: 0,
  d10: 0,
  d12: 0,
  d20: 0,
};

let diceColor = DEFAULT_COLOR;
let box = null;
let rolling = false;

function totalDice() {
  return DICE_TYPES.reduce((sum, type) => sum + counts[type], 0);
}

function buildNotation() {
  return DICE_TYPES.filter((type) => counts[type] > 0)
    .map((type) => `${counts[type]}${type}`)
    .join("+");
}

function labelColor(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  return lightness < 0.5 ? "#ffffff" : "#140c09";
}

function hexToHsl(hex) {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    throw new Error(`Invalid hex color values: ${hex}`);
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (diff === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / diff) % 6;
  } else if (max === g) {
    h = (b - r) / diff + 2;
  } else {
    h = (r - g) / diff + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) {
    h += 360;
  }

  const l = (max + min) / 2;
  const s = max === 0 ? 0 : diff / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  } else {
    throw new Error(`Unhandled hue: ${h}`);
  }

  const rHex = Math.round((r + m) * 255)
    .toString(16)
    .padStart(2, "0");
  const gHex = Math.round((g + m) * 255)
    .toString(16)
    .padStart(2, "0");
  const bHex = Math.round((b + m) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${rHex}${gHex}${bHex}`;
}

function currentLightness() {
  return hexToHsl(diceColor).l;
}

function showStatus(message) {
  statusEl.hidden = false;
  statusEl.textContent = message;
}

function hideStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}

function fail(error) {
  rolling = false;
  rollButton.disabled = totalDice() === 0;
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  showStatus(message);
}

function renderPicker() {
  const total = totalDice();
  picker.replaceChildren();
  for (const type of DICE_TYPES) {
    const wrap = document.createElement("div");
    wrap.className = "die-wrap";

    const button = document.createElement("button");
    button.className = "die-btn";
    button.type = "button";
    button.disabled = total >= MAX_DICE;
    button.title = `Add ${type}`;
    button.addEventListener("click", () => addDie(type));

    const face = document.createElement("span");
    face.className = "die-face";
    face.textContent = type.toUpperCase();
    face.style.backgroundColor = diceColor;
    face.style.color = labelColor(diceColor);
    button.append(face);
    wrap.append(button);

    if (counts[type] > 0) {
      const badge = document.createElement("button");
      badge.className = "badge";
      badge.type = "button";
      badge.title = `Remove ${type}`;
      badge.textContent = String(counts[type]);
      badge.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeDie(type);
      });
      wrap.append(badge);
    }

    picker.append(wrap);
  }

  cap.textContent = `${total}/${MAX_DICE}`;
  rollButton.disabled = total === 0 || rolling;
  clearButton.disabled = total === 0 || rolling;
  colorToggle.disabled = rolling;
}

function applyDiceColor(hex) {
  diceColor = hex;
  colorDot.style.backgroundColor = hex;
  colorPreview.style.backgroundColor = hex;
  colorBrightness.value = String(Math.round(currentLightness()));
  colorBrightness.style.background = `linear-gradient(to right, #000, ${hex}, #fff)`;
  window.DICE?.clearMaterialCache?.();
  table.replaceChildren();
  box = null;
  renderPicker();
}

function closeColorPanel() {
  colorPanel.hidden = true;
}

function positionColorPanel() {
  const rect = colorToggle.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const panelWidth = colorPanel.offsetWidth || 200;
  const panelHeight = colorPanel.offsetHeight || 280;
  let top = rect.top + rect.height / 2 - panelHeight / 2;
  let left = rect.right + 12;

  if (top < 10) {
    top = 10;
  }
  if (top + panelHeight > viewportHeight - 10) {
    top = Math.max(10, viewportHeight - panelHeight - 10);
  }
  if (left < 12) {
    left = 12;
  }
  if (left + panelWidth > viewportWidth - 12) {
    left = Math.max(12, rect.left - panelWidth - 12);
  }
  if (left + panelWidth > viewportWidth - 12) {
    left = viewportWidth - panelWidth - 12;
  }

  colorPanel.style.top = `${top}px`;
  colorPanel.style.left = `${left}px`;
}

function openColorPanel() {
  colorPanel.hidden = false;
  positionColorPanel();
}

function toggleColorPanel() {
  if (colorPanel.hidden) {
    openColorPanel();
    return;
  }
  closeColorPanel();
}

function pickWheelColor(event) {
  const rect = colorWheel.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const x = event.clientX - rect.left - centerX;
  const y = event.clientY - rect.top - centerY;
  const radius = Math.hypot(x, y);
  if (radius < 28) {
    return;
  }

  const angle = (Math.atan2(x, -y) * 180) / Math.PI;
  const hue = (angle + 360) % 360;
  applyDiceColor(hslToHex(hue, 100, 50));
}

function addDie(type) {
  if (totalDice() >= MAX_DICE) {
    return;
  }
  counts[type] += 1;
  syncUrl();
  renderPicker();
}

function removeDie(type) {
  counts[type] = Math.max(0, counts[type] - 1);
  syncUrl();
  renderPicker();
}

function clearDice() {
  for (const type of DICE_TYPES) {
    counts[type] = 0;
  }
  result.hidden = true;
  hideStatus();
  syncUrl();
  renderPicker();
}

function parseQuery(search) {
  const params = new URLSearchParams(search);
  let remaining = MAX_DICE;
  for (const type of DICE_TYPES) {
    const raw = params.get(type);
    const value = raw == null ? 0 : Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid count for ${type}: ${raw}`);
    }
    const next = Math.min(value, remaining);
    counts[type] = next;
    remaining -= next;
  }
}

function syncUrl() {
  const params = new URLSearchParams();
  for (const type of DICE_TYPES) {
    if (counts[type] > 0) {
      params.set(type, String(counts[type]));
    }
  }
  const query = params.toString();
  const next = query ? `?${query}` : window.location.pathname;
  window.history.replaceState(null, "", next);
}

function configureDice() {
  if (!window.DICE?.vars) {
    throw new Error("The dice library did not load.");
  }
  window.DICE.vars.dice_color = diceColor;
  window.DICE.vars.label_color = labelColor(diceColor);
  window.DICE.vars.desk_color = "#14241c";
  window.DICE.vars.desk_opacity = 0;
  window.DICE.clearMaterialCache?.();
}

function getBox() {
  if (box) {
    return box;
  }
  if (!table.clientWidth || !table.clientHeight) {
    throw new Error("The table has no room for the dice.");
  }
  configureDice();
  table.replaceChildren();
  box = new window.DICE.dice_box(table);
  return box;
}

function showResult(notation) {
  result.hidden = false;
  notationEl.textContent = window.DICE.stringify_notation(notation);
  breakdownEl.textContent = notation.resultString;
  totalEl.textContent = String(notation.resultTotal);
}

function roll() {
  const notation = buildNotation();
  if (!notation) {
    return;
  }
  if (rolling) {
    return;
  }

  hideStatus();
  rolling = true;
  rollButton.disabled = true;
  clearButton.disabled = true;

  try {
    const tableBox = getBox();
    tableBox.setDice(notation);
    tableBox.start_throw(null, (thrown) => {
      rolling = false;
      renderPicker();
      if (thrown.error) {
        fail(new Error("The dice notation could not be read."));
        return;
      }
      showResult(thrown);
    });
  } catch (error) {
    fail(error);
  }
}

function onResize() {
  if (box) {
    box.reinit(table);
  }
}

rollButton.addEventListener("click", roll);
clearButton.addEventListener("click", clearDice);
colorToggle.addEventListener("click", toggleColorPanel);
colorClose.addEventListener("click", closeColorPanel);
colorReset.addEventListener("click", () => applyDiceColor(DEFAULT_COLOR));
colorWheel.addEventListener("click", pickWheelColor);
colorBrightness.addEventListener("input", (event) => {
  const brightness = Number.parseInt(event.target.value, 10);
  const hsl = hexToHsl(diceColor);
  applyDiceColor(hslToHex(hsl.h, hsl.s, brightness));
});
document.addEventListener("mousedown", (event) => {
  if (colorPanel.hidden) {
    return;
  }
  if (colorPanel.contains(event.target) || colorToggle.contains(event.target)) {
    return;
  }
  closeColorPanel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeColorPanel();
  }
});
window.addEventListener("resize", () => {
  onResize();
  if (!colorPanel.hidden) {
    positionColorPanel();
  }
});

applyDiceColor(DEFAULT_COLOR);

try {
  const hadQuery = window.location.search.length > 1;
  parseQuery(window.location.search);
  renderPicker();
  if (hadQuery && totalDice() > 0) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(roll);
    });
  }
} catch (error) {
  renderPicker();
  fail(error);
}
