const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const MAX_DICE = 10;
const COLOR_COOKIE = "dice_color";
const MARBLE_COOKIE = "dice_marble";
const HUNDRED_COOKIE = "dice_hundred";
const COLOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COLORS = [
  { name: "Onyx", dice: "#1a1a1a", preview: "#393939", label: "#c4a15a" },
  { name: "Bone", dice: "#c4b089", preview: "#d8cbb2", label: "#1a1410", light: true },
  { name: "Blood", dice: "#6e1512", preview: "#a31f1b", label: "#f3efe4" },
  { name: "Navy", dice: "#1a2c4a", preview: "#2a4777", label: "#f3efe4" },
  { name: "Forest", dice: "#1c3326", preview: "#325b43", label: "#c4a15a" },
  { name: "Plum", dice: "#3a2044", preview: "#5d346e", label: "#f3efe4" },
  { name: "Rose", dice: "#a24d62", preview: "#bb7183", label: "#f3efe4" },
  { name: "Aqua", dice: "#2a8f8c", preview: "#38beba", label: "#f3efe4" },
];

const table = document.getElementById("table");
const picker = document.getElementById("dice-picker");
const cap = document.getElementById("cap");
const colorToggle = document.getElementById("color-toggle");
const colorPanel = document.getElementById("color-panel");
const colorSwatches = document.getElementById("color-swatches");
const marbleToggle = document.getElementById("marble-toggle");
const colorClose = document.getElementById("color-close");
const hundredDie = document.getElementById("hundred-die");
const hundredPair = document.getElementById("hundred-pair");
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
  d100: 0,
};

const SHAKE_THRESHOLD = 15;
const SHAKE_LOCK_MS = 1000;
const SHAKE_SAMPLE_MS = 100;
const SHAKE_WINDOW_MS = 300;

let selectedColor = COLORS[0];
let marble = false;
let hundredAsPair = false;
let box = null;
let rolling = false;
let shakeWatching = false;
let shakeRequestPending = false;
let shakeLockedUntil = 0;
let lastGravity = null;

function physicalDice(type) {
  if (type !== "d100") {
    return [type];
  }
  return hundredAsPair ? ["d100", "d9"] : ["d100s"];
}

function totalDice() {
  return DICE_TYPES.reduce((sum, type) => sum + counts[type] * physicalDice(type).length, 0);
}

function selectedDice() {
  const dice = [];
  for (const type of DICE_TYPES) {
    for (let count = 0; count < counts[type]; count += 1) {
      dice.push(...physicalDice(type));
    }
  }
  return dice;
}

function selectHundred() {
  for (const type of DICE_TYPES) {
    counts[type] = 0;
  }
  counts.d100 = 1;
}

function appearance() {
  return {
    dice: selectedColor.dice,
    label: selectedColor.label,
    marble,
  };
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
  return COLORS.find((color) => color.name === name) || COLORS[0];
}

function savedMarble() {
  return readCookie(MARBLE_COOKIE) === "1";
}

function savedHundredAsPair() {
  return readCookie(HUNDRED_COOKIE) === "pair";
}

function writeHundredCookie() {
  document.cookie = `${HUNDRED_COOKIE}=${hundredAsPair ? "pair" : "die"}${cookieSuffix()}`;
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
    button.disabled = type !== "d100" && total + physicalDice(type).length > MAX_DICE;
    button.title = `Add ${type}`;
    button.addEventListener("click", () => addDie(type));

    const face = document.createElement("span");
    face.className = "die-face";
    face.textContent = type.toUpperCase();
    if (type === "d100") face.classList.add("is-wide");
    face.style.backgroundColor = selectedColor.preview;
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
    button.style.backgroundColor = color.preview;
    button.style.color = color.label;
    button.classList.toggle("is-current", color.dice === selectedColor.dice);
    button.classList.toggle("is-light", color.light === true);
    button.addEventListener("click", () => applyDiceColor(color));
    colorSwatches.append(button);
  }
}

function applyAppearance() {
  if (!box) {
    return;
  }
  const changed = box.setAppearance(appearance());
  if (!changed || !rolling) {
    return;
  }
  rolling = false;
  renderPicker();
}

function applyDiceColor(color) {
  selectedColor = color;
  writeColorCookie(color);
  applyAppearance();
  renderSwatches();
  renderPicker();
}

function applyMarble(enabled) {
  marble = enabled;
  marbleToggle.checked = enabled;
  writeMarbleCookie(enabled);
  applyAppearance();
}

function renderHundredChoice() {
  hundredDie.checked = !hundredAsPair;
  hundredPair.checked = hundredAsPair;
}

function applyHundred(asPair) {
  hundredAsPair = asPair;
  writeHundredCookie();
  renderHundredChoice();
  renderPicker();
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
  colorToggle.setAttribute("aria-expanded", "true");
  positionColorPanel();
}

function closeColorPanel() {
  colorPanel.hidden = true;
  colorToggle.setAttribute("aria-expanded", "false");
}

function toggleColorPanel() {
  if (colorPanel.hidden) {
    openColorPanel();
    return;
  }
  closeColorPanel();
}

function addDie(type) {
  if (type === "d100") {
    selectHundred();
  } else {
    counts.d100 = 0;
    if (totalDice() + physicalDice(type).length > MAX_DICE) {
      return;
    }
    counts[type] += 1;
  }
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
    const slots = physicalDice(type).length;
    const next = Math.min(value, Math.floor(remaining / slots));
    counts[type] = next;
    remaining -= next * slots;
  }
  if (counts.d100 > 0) {
    selectHundred();
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

function getBox() {
  if (!window.DICE?.dice_box) {
    throw new Error("The dice library did not load.");
  }
  if (box) {
    return box;
  }
  if (!table.clientWidth || !table.clientHeight) {
    throw new Error("The table has no room for the dice.");
  }
  box = new window.DICE.dice_box(table);
  box.setAppearance(appearance());
  return box;
}

function showResult(notation) {
  const set = notation.set;
  const rolled = notation.result;
  result.hidden = false;
  if (set.length === 2 && set[0] === "d100" && set[1] === "d9") {
    const total = rolled[0] + rolled[1] === 0 ? 100 : rolled[0] + rolled[1];
    notationEl.textContent = "d100";
    breakdownEl.textContent = `${String(rolled[0]).padStart(2, "0")} + ${rolled[1]} = ${total}`;
    totalEl.textContent = String(total);
    return;
  }
  if (set.length === 1 && set[0] === "d100s") {
    notationEl.textContent = "d100";
    breakdownEl.textContent = String(rolled[0]);
    totalEl.textContent = String(rolled[0]);
    return;
  }
  notationEl.textContent = window.DICE.stringify_notation(notation);
  breakdownEl.textContent = notation.resultString;
  totalEl.textContent = String(notation.resultTotal);
}

function roll() {
  const dice = selectedDice();
  if (dice.length === 0 || rolling) {
    return;
  }

  hideStatus();
  rolling = true;
  rollButton.disabled = true;
  clearButton.disabled = true;

  try {
    const tableBox = getBox();
    tableBox.setDice(dice);
    tableBox.start_throw((thrown) => {
      rolling = false;
      renderPicker();
      showResult(thrown);
    });
  } catch (error) {
    fail(error);
  }
}

function acceleration(reading) {
  if (!reading || !Number.isFinite(reading.x) || !Number.isFinite(reading.y) || !Number.isFinite(reading.z)) {
    return null;
  }
  return reading;
}

function rollFromShake(now) {
  if (now < shakeLockedUntil) {
    return;
  }
  shakeLockedUntil = now + SHAKE_LOCK_MS;
  roll();
}

function startShakeWatch() {
  if (shakeWatching) {
    return;
  }
  shakeWatching = true;
  window.addEventListener("devicemotion", onShake);
}

async function enableShake() {
  if (shakeWatching || shakeRequestPending) {
    return;
  }
  shakeRequestPending = true;
  try {
    const state = await DeviceMotionEvent.requestPermission();
      if (state !== "granted") {
        showStatus("Shake needs motion access.");
        return;
      }
    startShakeWatch();
  } catch {
    shakeRequestPending = false;
  }
}

function onShake(event) {
  const now = Date.now();
  const linear = acceleration(event.acceleration);
  if (linear) {
    if (Math.hypot(linear.x, linear.y, linear.z) >= SHAKE_THRESHOLD) {
      rollFromShake(now);
    }
    return;
  }

  const gravity = acceleration(event.accelerationIncludingGravity);
  const previous = lastGravity;
  if (!gravity) {
    return;
  }
  if (previous && now - previous.time < SHAKE_SAMPLE_MS) {
    return;
  }
  if (previous && now - previous.time < SHAKE_WINDOW_MS) {
    const delta = Math.hypot(gravity.x - previous.x, gravity.y - previous.y, gravity.z - previous.z);
    if (delta >= SHAKE_THRESHOLD) {
      rollFromShake(now);
    }
  }
  lastGravity = { x: gravity.x, y: gravity.y, z: gravity.z, time: now };
}

function setupShake() {
  if (typeof DeviceMotionEvent === "undefined") {
    return;
  }
  if (typeof DeviceMotionEvent.requestPermission !== "function") {
    startShakeWatch();
    return;
  }
  document.addEventListener("click", enableShake, true);
}

setupShake();

rollButton.addEventListener("click", roll);
clearButton.addEventListener("click", clearDice);
colorToggle.addEventListener("click", toggleColorPanel);
colorClose.addEventListener("click", closeColorPanel);
marbleToggle.addEventListener("change", () => {
  applyMarble(marbleToggle.checked);
});
hundredDie.addEventListener("change", () => applyHundred(false));
hundredPair.addEventListener("change", () => applyHundred(true));
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
  if (box) {
    box.reinit(table);
  }
  if (!colorPanel.hidden) {
    positionColorPanel();
  }
});

function boot() {
  marble = savedMarble();
  marbleToggle.checked = marble;
  hundredAsPair = savedHundredAsPair();
  renderHundredChoice();
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
