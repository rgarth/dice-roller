const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const MAX_DICE = 10;
const YEAR_ZERO_CAP = 15;

const ROLE_PAINT = {
  chance: { dice: "#c4b089", label: "#1a1410", weight: "700", preview: "#d8cbb2" },
  risk: { dice: "#6e1512", label: "#f3efe4", weight: "400", preview: "#a31f1b" },
  base: { dice: "#c4b089", label: "#1a1410", weight: "700", preview: "#d8cbb2" },
  skill: { dice: "#1c3326", label: "#c4a15a", weight: "400", preview: "#325b43" },
  gear: { dice: "#1a1a1a", label: "#c4a15a", weight: "400", preview: "#393939" },
  stress: { dice: "#6e1512", label: "#f3efe4", weight: "400", preview: "#a31f1b" },
};

const YEAR_ZERO_ROLES = [
  { role: "base", label: "Base" },
  { role: "skill", label: "Skill" },
  { role: "gear", label: "Gear" },
  { role: "stress", label: "Stress" },
];

const TWIST_SUBJECT = [null, "A third party", "The protagonist", "An encounter", "A physical event", "An emotional event", "An object"];
const TWIST_ACTION = [null, "appears", "alters the location", "helps the protagonist", "hinders the protagonist", "changes the goal", "ends the scene"];

const LONER_STANCES = [
  ["neutral", "EVN", "Even"],
  ["advantage", "ADV", "Advantage"],
  ["disadvantage", "DIS", "Disadvantage"],
];

export function querySelectsStandard(search) {
  const params = new URLSearchParams(search);
  return DICE_TYPES.some((type) => params.has(type));
}

function paintFor(role) {
  return { role, ...ROLE_PAINT[role] };
}

function showPhrase(host, notation, breakdown, total) {
  host.result.hidden = false;
  host.totalEl.classList.add("is-phrase");
  host.notationEl.textContent = notation;
  host.breakdownEl.textContent = breakdown;
  host.totalEl.textContent = total;
}

function showNumber(host, notation, breakdown, total) {
  host.result.hidden = false;
  host.totalEl.classList.remove("is-phrase");
  host.notationEl.textContent = notation;
  host.breakdownEl.textContent = breakdown;
  host.totalEl.textContent = String(total);
}

function notationWithModifier(base, rollModifier) {
  if (rollModifier === 0) return base;
  return rollModifier > 0 ? `${base} + ${rollModifier}` : `${base} - ${-rollModifier}`;
}

function applyModifier(diceText, diceTotal, rollModifier) {
  if (rollModifier === 0) return { text: diceText, total: diceTotal };
  const total = diceTotal + rollModifier;
  const term = rollModifier < 0 ? `- ${-rollModifier}` : `+ ${rollModifier}`;
  const split = diceText.lastIndexOf(" = ");
  const base = split === -1 ? diceText : diceText.slice(0, split);
  return { text: `${base} ${term} = ${total}`, total };
}

function canReroll(role, value) {
  if (value === 6) return false;
  if (value === 1 && (role === "base" || role === "gear" || role === "stress")) return false;
  return true;
}

function facesOf(notation, role) {
  const faces = [];
  for (let index = 0; index < notation.roles.length; index += 1) {
    if (notation.roles[index].role === role) faces.push(notation.result[index]);
  }
  return faces;
}

export function createGames(host) {
  const counts = { d4: 0, d6: 0, d8: 0, d10: 0, d12: 0, d20: 0, d100: 0 };
  let lonerStance = "neutral";
  let twistCounter = 0;
  const yearCounts = { base: 0, skill: 0, gear: 0, stress: 0 };
  let yearZeroDice = null;
  let yearPushed = false;
  let yearKept = null;
  let standardModifier = 0;

  function physicalDice(type) {
    if (type !== "d100") return [type];
    return host.hundredAsPair() ? ["d100", "d9"] : ["d100s"];
  }

  function totalDice() {
    return DICE_TYPES.reduce((sum, type) => sum + counts[type] * physicalDice(type).length, 0);
  }

  function selectedDice() {
    const dice = [];
    for (const type of DICE_TYPES) {
      for (let count = 0; count < counts[type]; count += 1) dice.push(...physicalDice(type));
    }
    return dice;
  }

  function syncUrl() {
    const params = new URLSearchParams();
    for (const type of DICE_TYPES) {
      if (counts[type] > 0) params.set(type, String(counts[type]));
    }
    const query = params.toString();
    const next = query ? `?${query}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }

  function selectHundred() {
    for (const type of DICE_TYPES) counts[type] = 0;
    counts.d100 = 1;
  }

  function addDie(type) {
    if (type === "d100") {
      selectHundred();
    } else {
      counts.d100 = 0;
      if (totalDice() + physicalDice(type).length > MAX_DICE) return;
      counts[type] += 1;
    }
    syncUrl();
    host.refresh();
  }

  function removeDie(type) {
    counts[type] = Math.max(0, counts[type] - 1);
    syncUrl();
    host.refresh();
  }

  function showStandard(notation) {
    const set = notation.set;
    const rolled = notation.result;
    const rollModifier = standardModifier;
    if (set.length === 2 && set[0] === "d100" && set[1] === "d9") {
      const diceTotal = rolled[0] + rolled[1] === 0 ? 100 : rolled[0] + rolled[1];
      const shown = applyModifier(`${String(rolled[0]).padStart(2, "0")} + ${rolled[1]} = ${diceTotal}`, diceTotal, rollModifier);
      showNumber(host, notationWithModifier("d100", rollModifier), shown.text, shown.total);
      return;
    }
    if (set.length === 1 && set[0] === "d100s") {
      const shown = applyModifier(String(rolled[0]), rolled[0], rollModifier);
      showNumber(host, notationWithModifier("d100", rollModifier), shown.text, shown.total);
      return;
    }
    const shown = applyModifier(notation.resultString, notation.resultTotal, rollModifier);
    showNumber(host, notationWithModifier(window.DICE.stringify_notation(notation), rollModifier), shown.text, shown.total);
  }

  function yearZeroTotal() {
    return YEAR_ZERO_ROLES.reduce((sum, { role }) => sum + yearCounts[role], 0);
  }

  function yearZeroRoles() {
    const roles = [];
    for (const { role } of YEAR_ZERO_ROLES) {
      for (let count = 0; count < yearCounts[role]; count += 1) roles.push(role);
    }
    return roles;
  }

  function forgetYearZeroRoll() {
    yearZeroDice = null;
    yearPushed = false;
    yearKept = null;
  }

  function showYearZero() {
    const successes = yearZeroDice.filter((die) => die.value === 6).length;
    const notes = [successes === 1 ? "1 success" : `${successes} successes`];
    if (yearPushed) {
      const baseBanes = yearZeroDice.filter((die) => die.role === "base" && die.value === 1).length;
      const gearBanes = yearZeroDice.filter((die) => die.role === "gear" && die.value === 1).length;
      if (baseBanes) notes.push(`Base damage ${baseBanes}`);
      if (gearBanes) notes.push(`Gear damage ${gearBanes}`);
    }
    if (yearZeroDice.some((die) => die.role === "stress" && die.value === 1)) notes.push("Panic");
    const faces = YEAR_ZERO_ROLES
      .map(({ role, label }) => {
        const values = yearZeroDice.filter((die) => die.role === role).map((die) => die.value);
        return values.length ? `${label} ${values.join(", ")}` : "";
      })
      .filter(Boolean)
      .join(". ");
    showPhrase(host, yearPushed ? "Pushed" : "Year Zero", faces, notes.join(". "));
  }

  const standard = {
    controls: { options: true, modifier: true, cap: true, roll: true, clear: true, twist: false },
    plan() {
      standardModifier = host.modifier();
      return { types: selectedDice(), paints: null };
    },
    notation() {
      return DICE_TYPES.filter((type) => counts[type] > 0).map((type) => `${counts[type]}${type}`).join("+");
    },
    readThrow(notation) {
      showStandard(notation);
      host.setModifier(0);
    },
    clearTray() {
      for (const type of DICE_TYPES) counts[type] = 0;
      syncUrl();
    },
    total: totalDice,
    loadQuery(search) {
      const params = new URLSearchParams(search);
      let remaining = MAX_DICE;
      for (const type of DICE_TYPES) {
        const raw = params.get(type);
        const value = raw == null ? 0 : Number.parseInt(raw, 10);
        if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid count for ${type}: ${raw}`);
        const slots = physicalDice(type).length;
        const next = Math.min(value, Math.floor(remaining / slots));
        counts[type] = next;
        remaining -= next * slots;
      }
      if (counts.d100 > 0) selectHundred();
    },
    render() {
      const total = totalDice();
      const color = host.color();
      host.picker.replaceChildren();
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
        face.style.backgroundColor = color.preview;
        face.style.color = color.label;
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
        host.picker.append(wrap);
      }
      host.cap.textContent = `${total}/${MAX_DICE}`;
      host.rollButton.disabled = total === 0 || host.rolling();
      host.clearButton.disabled = host.rolling() || (total === 0 && !host.tableOccupied());
      host.pushButton.hidden = true;
    },
  };

  const loner = {
    controls: { options: false, modifier: false, cap: false, roll: false, clear: false, twist: true },
    plan() {
      const roles = lonerStance === "advantage"
        ? ["chance", "chance", "risk"]
        : lonerStance === "disadvantage"
          ? ["chance", "risk", "risk"]
          : ["chance", "risk"];
      return { types: roles.map(() => "d6"), paints: roles.map(paintFor) };
    },
    notation() {
      return `loner-${lonerStance}`;
    },
    readThrow(notation) {
      const chanceFaces = facesOf(notation, "chance");
      const riskFaces = facesOf(notation, "risk");
      const chance = Math.max(...chanceFaces);
      const risk = Math.max(...riskFaces);
      const tied = chance === risk;
      const bothLow = chance <= 3 && risk <= 3;
      const bothHigh = chance >= 4 && risk >= 4;
      const tail = tied || bothLow ? ", but..." : bothHigh ? ", and..." : "";
      const text = tied ? "Yes, but..." : `${chance > risk ? "Yes" : "No"}${tail}`;
      if (tied) twistCounter += 1;
      let prompt = "";
      if (twistCounter >= 3) {
        prompt = `${TWIST_SUBJECT[1 + Math.floor(Math.random() * 6)]} ${TWIST_ACTION[1 + Math.floor(Math.random() * 6)]}`;
        twistCounter = 0;
      }
      showPhrase(
        host,
        `Twist ${twistCounter}`,
        prompt ? `${text}. ${prompt}` : `Chance ${chanceFaces.join(", ")}. Risk ${riskFaces.join(", ")}`,
        prompt ? "Twist" : text,
      );
    },
    clearTray() {
      twistCounter = 0;
    },
    render() {
      host.picker.replaceChildren();
      for (const [stance, label, title] of LONER_STANCES) {
        const button = document.createElement("button");
        button.className = "die-btn stance-btn";
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.disabled = host.rolling();
        button.addEventListener("click", () => {
          lonerStance = stance;
          host.roll("button");
        });
        host.picker.append(button);
      }
      host.twistReadout.textContent = `Twist ${twistCounter}`;
      host.pushButton.hidden = true;
    },
  };

  const yearzero = {
    controls: { options: false, modifier: false, cap: true, roll: true, clear: true, twist: false },
    plan(source) {
      if (source === "push") {
        const sourceDice = yearZeroDice.filter((die) => canReroll(die.role, die.value));
        if (sourceDice.length === 0) return { types: [], paints: [] };
        yearKept = yearZeroDice;
        return {
          types: sourceDice.map(() => "d6"),
          paints: sourceDice.map((die) => paintFor(die.role)),
        };
      }
      yearKept = null;
      const roles = yearZeroRoles();
      return { types: roles.map(() => "d6"), paints: roles.map(paintFor) };
    },
    notation(source) {
      if (source === "push") return "yearzero-push";
      return YEAR_ZERO_ROLES
        .filter(({ role }) => yearCounts[role] > 0)
        .map(({ role }) => `${yearCounts[role]}${role}`)
        .join("+");
    },
    readThrow(notation) {
      if (!yearKept) {
        yearZeroDice = notation.roles.map((paint, index) => ({ role: paint.role, value: notation.result[index] }));
        yearPushed = false;
      } else {
        let next = 0;
        yearZeroDice = yearKept.map((die) => {
          if (!canReroll(die.role, die.value)) return die;
          const value = notation.result[next];
          next += 1;
          return { role: die.role, value };
        });
        yearPushed = true;
        yearKept = null;
      }
      showYearZero();
    },
    clearTray() {
      for (const { role } of YEAR_ZERO_ROLES) yearCounts[role] = 0;
      forgetYearZeroRoll();
    },
    render() {
      const total = yearZeroTotal();
      host.picker.replaceChildren();
      for (const { role, label } of YEAR_ZERO_ROLES) {
        const wrap = document.createElement("div");
        wrap.className = "die-wrap";
        const button = document.createElement("button");
        button.className = "die-btn";
        button.type = "button";
        button.disabled = total >= YEAR_ZERO_CAP || host.rolling();
        button.title = `Add ${label}`;
        button.addEventListener("click", () => {
          if (yearZeroTotal() >= YEAR_ZERO_CAP) return;
          yearCounts[role] += 1;
          forgetYearZeroRoll();
          host.refresh();
        });
        const face = document.createElement("span");
        face.className = "die-face is-wide";
        face.textContent = label;
        face.style.backgroundColor = ROLE_PAINT[role].preview;
        face.style.color = ROLE_PAINT[role].label;
        button.append(face);
        wrap.append(button);
        if (yearCounts[role] > 0) {
          const badge = document.createElement("button");
          badge.className = "badge";
          badge.type = "button";
          badge.title = `Remove ${label}`;
          badge.textContent = String(yearCounts[role]);
          badge.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            yearCounts[role] -= 1;
            forgetYearZeroRoll();
            host.refresh();
          });
          wrap.append(badge);
        }
        host.picker.append(wrap);
      }
      host.cap.textContent = `${total}/${YEAR_ZERO_CAP}`;
      const pushable = yearZeroDice && !yearPushed && yearZeroDice.some((die) => canReroll(die.role, die.value));
      host.rollButton.disabled = total === 0 || host.rolling();
      host.clearButton.disabled = host.rolling() || (total === 0 && !host.tableOccupied());
      host.pushButton.hidden = !pushable;
    },
  };

  return { standard, loner, yearzero };
}
