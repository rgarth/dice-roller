const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20"];
const MAX_DICE = 10;
const COLOR_COOKIE = "dice_color";
const MARBLE_COOKIE = "dice_marble";
const COLOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COLORS = [
  { name: "Onyx", dice: "#1a1a1a", label: "#c4a15a" },
  { name: "Bone", dice: "#c4b089", label: "#1a1410", light: true },
  { name: "Blood", dice: "#6e1512", label: "#f3efe4" },
  { name: "Navy", dice: "#1a2c4a", label: "#f3efe4" },
  { name: "Forest", dice: "#1c3326", label: "#c4a15a" },
  { name: "Plum", dice: "#3a2044", label: "#f3efe4" },
  { name: "Rose", dice: "#a24d62", label: "#f3efe4" },
  { name: "Aqua", dice: "#2a8f8c", label: "#f3efe4" },
];

const table = document.getElementById("table");
const picker = document.getElementById("dice-picker");
const cap = document.getElementById("cap");
const colorToggle = document.getElementById("color-toggle");
const colorDot = document.getElementById("color-dot");
const colorPanel = document.getElementById("color-panel");
const colorSwatches = document.getElementById("color-swatches");
const marbleToggle = document.getElementById("marble-toggle");
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

let selectedColor = COLORS[0];
let marble = false;
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

function isLightDie(color) {
  return color.light === true;
}

function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}

function cookieSuffix() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `; Max-Age=${COLOR_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

function writeColorCookie(color) {
  document.cookie = `${COLOR_COOKIE}=${encodeURIComponent(color.name)}${cookieSuffix()}`;
}

function writeMarbleCookie(enabled) {
  document.cookie = `${MARBLE_COOKIE}=${enabled ? "1" : "0"}${cookieSuffix()}`;
}

function savedColor() {
  const name = readCookie(COLOR_COOKIE);
  if (!name) {
    return COLORS[0];
  }
  const match = COLORS.find((color) => color.name === name);
  if (!match) {
    return COLORS[0];
  }
  return match;
}

function savedMarble() {
  return readCookie(MARBLE_COOKIE) === "1";
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
    face.style.backgroundColor = selectedColor.dice;
    face.style.color = selectedColor.label;
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

function renderSwatches() {
  colorSwatches.replaceChildren();
  for (const color of COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-swatch";
    button.title = color.name;
    button.textContent = "20";
    button.style.backgroundColor = color.dice;
    button.style.color = color.label;
    button.classList.toggle("is-current", color.dice === selectedColor.dice);
    button.classList.toggle("is-light", isLightDie(color));
    button.addEventListener("click", () => applyDiceColor(color));
    colorSwatches.append(button);
  }
}

function resetDiceTable() {
  window.DICE?.clearMaterialCache?.();
  table.replaceChildren();
  box = null;
}

function applyDiceColor(color) {
  selectedColor = color;
  colorDot.style.backgroundColor = color.dice;
  writeColorCookie(color);
  resetDiceTable();
  renderSwatches();
  renderPicker();
}

function applyMarble(enabled) {
  marble = enabled;
  marbleToggle.checked = enabled;
  writeMarbleCookie(enabled);
  resetDiceTable();
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
  window.DICE.vars.dice_color = selectedColor.dice;
  window.DICE.vars.label_color = selectedColor.label;
  window.DICE.vars.label_font = "Cinzel";
  window.DICE.vars.desk_color = "#14241c";
  window.DICE.vars.desk_opacity = 0;
  window.DICE.vars.use_marble = marble;
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
marbleToggle.addEventListener("change", () => {
  applyMarble(marbleToggle.checked);
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

function boot() {
  marble = savedMarble();
  marbleToggle.checked = marble;
  applyDiceColor(savedColor());

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
}

if (document.fonts?.load) {
  Promise.all([
    document.fonts.load("400 64px Cinzel"),
    document.fonts.load("700 64px Cinzel"),
    document.fonts.ready,
  ]).then(boot, boot);
} else {
  boot();
}
