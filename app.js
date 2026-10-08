import { createGames, querySelectsStandard } from "./games.js?v=eng2";

const COLOR_COOKIE = "dice_color";
const MARBLE_COOKIE = "dice_marble";
const HUNDRED_COOKIE = "dice_hundred";
const ENGINE_COOKIE = "dice_engine";
const COLOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const COLORS = [
  { name: "Onyx", dice: "#1a1a1a", preview: "#393939", label: "#c4a15a" },
  { name: "Bone", dice: "#c4b089", preview: "#d8cbb2", label: "#1a1410", light: true },
  { name: "Blood", dice: "#6e1512", preview: "#a31f1b", label: "#f3efe4" },
  { name: "Navy", dice: "#1a2c4a", preview: "#2a4777", label: "#f3efe4" },
  { name: "Forest", dice: "#1c3326", preview: "#325b43", label: "#c4a15a" },
  { name: "Plum", dice: "#3a2044", preview: "#5d346e", label: "#f3efe4" },
  { name: "Rose", dice: "#a24d62", preview: "#bb7183", label: "#6e1512", light: true },
  { name: "Aqua", dice: "#2a8f8c", preview: "#38beba", label: "#000000", light: true },
];

const table = document.getElementById("table");
const picker = document.getElementById("dice-picker");
const cap = document.getElementById("cap");
const colorToggle = document.getElementById("color-toggle");
const colorPanel = document.getElementById("color-panel");
const modifierToggle = document.getElementById("modifier-toggle");
const modifierPanel = document.getElementById("modifier-panel");
const modifierClose = document.getElementById("modifier-close");
const colorSwatches = document.getElementById("color-swatches");
const marbleToggle = document.getElementById("marble-toggle");
const colorClose = document.getElementById("color-close");
const hundredDie = document.getElementById("hundred-die");
const hundredPair = document.getElementById("hundred-pair");
const rollButton = document.getElementById("roll-btn");
const clearButton = document.getElementById("clear-btn");
const modifierMinus = document.getElementById("modifier-minus");
const modifierPlus = document.getElementById("modifier-plus");
const modifierReset = document.getElementById("modifier-reset");
const modifierValue = document.getElementById("modifier-value");
const engineSelect = document.getElementById("engine-select");
const twistReadout = document.getElementById("twist-readout");
const optionsSlot = document.getElementById("options-slot");
const modifierSlot = document.getElementById("modifier-slot");
const pushButton = document.getElementById("push-btn");
const result = document.getElementById("result");
const notationEl = document.getElementById("notation");
const breakdownEl = document.getElementById("breakdown");
const totalEl = document.getElementById("total");
const statusEl = document.getElementById("status");

const SHAKE_THRESHOLD = 15;
const SHAKE_LOCK_MS = 1000;
const SHAKE_SAMPLE_MS = 100;
const SHAKE_WINDOW_MS = 300;

let selectedColor = COLORS[0];
let marble = false;
let hundredAsPair = false;
let modifier = 0;
let engine = "standard";
let box = null;
let rolling = false;
let shakeWatching = false;
let shakeRequestPending = false;
let shakeLockedUntil = 0;
let lastGravity = null;

const games = createGames({
  picker,
  cap,
  twistReadout,
  result,
  notationEl,
  breakdownEl,
  totalEl,
  rollButton,
  clearButton,
  pushButton,
  color: () => selectedColor,
  rolling: () => rolling,
  tableOccupied: () => (box && box.dices.length > 0) || !result.hidden,
  hundredAsPair: () => hundredAsPair,
  modifier: () => modifier,
  setModifier(value) {
    modifier = value;
    showModifier();
  },
  roll(source) {
    roll(source);
  },
  refresh() {
    renderTray();
  },
});

function game() {
  return games[engine];
}

function appearance() {
  return {
    dice: selectedColor.dice,
    label: selectedColor.label,
    weight: selectedColor.light ? "700" : "400",
    marble,
  };
}

function renderTray() {
  game().render();
  colorToggle.disabled = rolling;
  engineSelect.disabled = rolling;
  pushButton.disabled = rolling;
}

function applyChrome() {
  const controls = game().controls;
  optionsSlot.hidden = !controls.options;
  modifierSlot.hidden = !controls.modifier;
  cap.hidden = !controls.cap;
  rollButton.hidden = !controls.roll;
  clearButton.hidden = !controls.clear;
  twistReadout.hidden = !controls.twist;
  if (!controls.options) {
    closeColorPanel();
    closeModifierPanel();
  }
  engineSelect.value = engine;
}

function emptyTable() {
  result.hidden = true;
  hideStatus();
  if (box) box.clear();
}

function wipeBoard() {
  for (const entry of Object.values(games)) entry.clearTray();
  emptyTable();
}

function applyEngine(next) {
  engine = next;
  document.cookie = `${ENGINE_COOKIE}=${engine}${cookieSuffix()}`;
  wipeBoard();
  applyChrome();
  renderTray();
}

function clearDice() {
  game().clearTray();
  emptyTable();
  renderTray();
}

function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function cookieSuffix() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `; Max-Age=${COLOR_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

function savedEngine() {
  const raw = readCookie(ENGINE_COOKIE);
  if (raw === "loner" || raw === "yearzero" || raw === "standard") return raw;
  return "standard";
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

function formatModifier(value) {
  return value > 0 ? `+${value}` : String(value);
}

function showModifier() {
  const label = formatModifier(modifier);
  modifierValue.textContent = label;
  modifierToggle.textContent = label;
  modifierToggle.classList.toggle("is-set", modifier !== 0);
  modifierToggle.classList.toggle("is-wide", label.length > 3);
}

function commitModifier(value) {
  modifier = value === 0 ? 0 : value;
  showModifier();
}

function stepModifier(delta) {
  commitModifier(modifier + delta);
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
  renderTray();
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  showStatus(message);
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
  if (!box) return;
  const changed = box.setAppearance(appearance());
  if (!changed || !rolling) return;
  rolling = false;
  renderTray();
}

function applyDiceColor(color) {
  selectedColor = color;
  writeColorCookie(color);
  applyAppearance();
  renderSwatches();
  renderTray();
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
  renderTray();
}

function positionPanel(panel, anchor) {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const panelWidth = panel.offsetWidth || 200;
  const panelHeight = panel.offsetHeight || 160;
  let top = rect.top + rect.height / 2 - panelHeight / 2;
  let left = rect.right + 12;

  if (top < 10) top = 10;
  if (top + panelHeight > viewportHeight - 10) top = Math.max(10, viewportHeight - panelHeight - 10);
  if (left < 12) left = 12;
  if (left + panelWidth > viewportWidth - 12) left = Math.max(12, rect.left - panelWidth - 12);
  if (left + panelWidth > viewportWidth - 12) left = viewportWidth - panelWidth - 12;

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

function openColorPanel() {
  closeModifierPanel();
  colorPanel.hidden = false;
  colorToggle.setAttribute("aria-expanded", "true");
  positionPanel(colorPanel, colorToggle);
}

function closeColorPanel() {
  colorPanel.hidden = true;
  colorToggle.setAttribute("aria-expanded", "false");
}

function openModifierPanel() {
  closeColorPanel();
  modifierPanel.hidden = false;
  modifierToggle.setAttribute("aria-expanded", "true");
  positionPanel(modifierPanel, modifierToggle);
}

function closeModifierPanel() {
  modifierPanel.hidden = true;
  modifierToggle.setAttribute("aria-expanded", "false");
}

function toggleModifierPanel() {
  if (modifierPanel.hidden) {
    openModifierPanel();
    return;
  }
  closeModifierPanel();
}

function toggleColorPanel() {
  if (colorPanel.hidden) {
    openColorPanel();
    return;
  }
  closeColorPanel();
}

function getBox() {
  if (!window.DICE?.dice_box) throw new Error("The dice library did not load.");
  if (box) return box;
  if (!table.clientWidth || !table.clientHeight) throw new Error("The table has no room for the dice.");
  box = new window.DICE.dice_box(table);
  box.setAppearance(appearance());
  return box;
}

function track(name, params) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

function beginThrow(plan, notation, source) {
  try {
    const tableBox = getBox();
    tableBox.setDice(plan.types, plan.paints);
    tableBox.start_throw((thrown) => {
      rolling = false;
      game().readThrow(thrown);
      renderTray();
      track("roll", { dice_count: plan.types.length, notation, method: source });
    });
  } catch (error) {
    fail(error);
  }
}

function roll(source = "button") {
  if (rolling) return;
  const plan = game().plan(source);
  if (plan.types.length === 0) return;

  const notation = game().notation(source);
  hideStatus();
  rolling = true;
  rollButton.disabled = true;
  clearButton.disabled = true;
  colorToggle.disabled = true;
  engineSelect.disabled = true;
  pushButton.disabled = true;
  for (const button of picker.querySelectorAll("button")) button.disabled = true;

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  Promise.all([fontsReady, whenDiceReady()])
    .then(() => {
      if (box) {
        beginThrow(plan, notation, source);
        return;
      }
      window.requestAnimationFrame(() => beginThrow(plan, notation, source));
    })
    .catch((error) => fail(error));
}

function acceleration(reading) {
  if (!reading || !Number.isFinite(reading.x) || !Number.isFinite(reading.y) || !Number.isFinite(reading.z)) return null;
  return reading;
}

function rollFromShake(now) {
  if (now < shakeLockedUntil) return;
  shakeLockedUntil = now + SHAKE_LOCK_MS;
  roll("shake");
}

function startShakeWatch() {
  if (shakeWatching) return;
  shakeWatching = true;
  window.addEventListener("devicemotion", onShake);
}

async function enableShake() {
  if (shakeWatching || shakeRequestPending) return;
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
    if (Math.hypot(linear.x, linear.y, linear.z) >= SHAKE_THRESHOLD) rollFromShake(now);
    return;
  }

  const gravity = acceleration(event.accelerationIncludingGravity);
  const previous = lastGravity;
  if (!gravity) return;
  if (previous && now - previous.time < SHAKE_SAMPLE_MS) return;
  if (previous && now - previous.time < SHAKE_WINDOW_MS) {
    const delta = Math.hypot(gravity.x - previous.x, gravity.y - previous.y, gravity.z - previous.z);
    if (delta >= SHAKE_THRESHOLD) rollFromShake(now);
  }
  lastGravity = { x: gravity.x, y: gravity.y, z: gravity.z, time: now };
}

function setupShake() {
  if (typeof DeviceMotionEvent === "undefined") return;
  if (typeof DeviceMotionEvent.requestPermission !== "function") {
    startShakeWatch();
    return;
  }
  document.addEventListener("click", enableShake, true);
}

setupShake();

rollButton.addEventListener("click", () => roll("button"));
pushButton.addEventListener("click", () => roll("push"));
engineSelect.addEventListener("change", () => applyEngine(engineSelect.value));
clearButton.addEventListener("click", clearDice);
modifierToggle.addEventListener("click", toggleModifierPanel);
modifierClose.addEventListener("click", closeModifierPanel);
modifierMinus.addEventListener("click", () => stepModifier(-1));
modifierPlus.addEventListener("click", () => stepModifier(1));
modifierReset.addEventListener("click", () => commitModifier(0));
colorToggle.addEventListener("click", toggleColorPanel);
colorClose.addEventListener("click", closeColorPanel);
marbleToggle.addEventListener("change", () => {
  applyMarble(marbleToggle.checked);
});
hundredDie.addEventListener("change", () => applyHundred(false));
hundredPair.addEventListener("change", () => applyHundred(true));
document.addEventListener("mousedown", (event) => {
  const target = event.target;
  if (!colorPanel.hidden && !colorPanel.contains(target) && !colorToggle.contains(target)) closeColorPanel();
  if (!modifierPanel.hidden && !modifierPanel.contains(target) && !modifierToggle.contains(target)) closeModifierPanel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeColorPanel();
    closeModifierPanel();
  }
});
window.addEventListener("resize", () => {
  if (box) box.reinit(table);
  if (!colorPanel.hidden) positionPanel(colorPanel, colorToggle);
  if (!modifierPanel.hidden) positionPanel(modifierPanel, modifierToggle);
});

function whenDiceReady() {
  if (window.DICE?.dice_box) return Promise.resolve();
  return new Promise((resolve, reject) => {
    function finish(error) {
      window.removeEventListener("dice-ready", onReady);
      window.removeEventListener("dice-failed", onFailed);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }
    function onReady() {
      finish();
    }
    function onFailed(event) {
      const error = event.detail instanceof Error ? event.detail : new Error("The dice library did not load.");
      finish(error);
    }
    window.addEventListener("dice-ready", onReady);
    window.addEventListener("dice-failed", onFailed);
  });
}

function boot() {
  marble = savedMarble();
  marbleToggle.checked = marble;
  hundredAsPair = savedHundredAsPair();
  renderHundredChoice();
  showModifier();
  document.cookie = "dice_modifier=; Max-Age=0; Path=/; SameSite=Lax";
  engine = savedEngine();
  applyChrome();
  applyDiceColor(savedColor());

  try {
    const hadQuery = window.location.search.length > 1;
    if (querySelectsStandard(window.location.search)) engine = "standard";
    applyChrome();
    games.standard.loadQuery(window.location.search);
    renderTray();
    if (hadQuery && engine === "standard" && games.standard.total() > 0) roll();
  } catch (error) {
    renderTray();
    fail(error);
  }
}

boot();
