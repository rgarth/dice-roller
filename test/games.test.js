import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createGames, querySelectsStandard } from "../games.js";

function element() {
  const listeners = {};
  const node = {
    className: "",
    type: "",
    textContent: "",
    title: "",
    disabled: false,
    hidden: false,
    style: {},
    children: [],
    classList: {
      add(name) {
        node.className = `${node.className} ${name}`.trim();
      },
      remove(name) {
        node.className = node.className.split(" ").filter((part) => part !== name).join(" ");
      },
    },
    append(...kids) {
      node.children.push(...kids);
    },
    replaceChildren(...kids) {
      node.children = kids;
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    click() {
      for (const fn of listeners.click || []) fn({ preventDefault() {}, stopPropagation() {} });
    },
  };
  return node;
}

function find(node, title) {
  if (node?.title === title) return node;
  for (const child of node?.children || []) {
    const found = find(child, title);
    if (found) return found;
  }
  return null;
}

function harness() {
  let redraw = () => {};
  let modifier = 0;
  let hundredAsPair = false;
  const rolls = [];
  const urls = [];
  globalThis.document = { createElement: () => element() };
  globalThis.window = {
    location: { pathname: "/roller" },
    history: { replaceState(_state, _title, url) { urls.push(url); } },
    DICE: { stringify_notation: () => "1d6" },
  };
  const host = {
    picker: element(),
    cap: element(),
    twistReadout: element(),
    result: { hidden: true },
    notationEl: element(),
    breakdownEl: element(),
    totalEl: element(),
    rollButton: element(),
    clearButton: element(),
    pushButton: element(),
    color: () => ({ preview: "#393939", label: "#c4a15a" }),
    rolling: () => false,
    tableOccupied: () => false,
    hundredAsPair: () => hundredAsPair,
    modifier: () => modifier,
    setModifier(value) { modifier = value; },
    roll(source) { rolls.push(source); },
    refresh() { redraw(); },
  };
  const games = createGames(host);
  return {
    games,
    host,
    rolls,
    urls,
    setModifier(value) { modifier = value; },
    modifier: () => modifier,
    setPair(value) { hundredAsPair = value; },
    use(game) { redraw = () => game.render(); },
  };
}

function thrown(roles, values, extra = {}) {
  return {
    set: extra.set || roles.map(() => "d6"),
    result: values,
    roles: roles.map((role) => ({ role })),
    resultString: extra.resultString || "",
    resultTotal: extra.resultTotal || 0,
  };
}

describe("shared links", () => {
  test("a die query selects the standard tray", () => {
    assert.equal(querySelectsStandard("?d6=2"), true);
    assert.equal(querySelectsStandard("?d20=1&d6=1"), true);
    assert.equal(querySelectsStandard("?eng=1"), false);
    assert.equal(querySelectsStandard(""), false);
  });
});

describe("standard", () => {
  test("loads a tray from the query and applies a modifier once", () => {
    const { games, host, setModifier, modifier } = harness();
    games.standard.loadQuery("?d6=2&d20=1");
    assert.deepEqual(games.standard.plan().types, ["d6", "d6", "d20"]);
    assert.equal(games.standard.notation(), "2d6+1d20");

    setModifier(2);
    games.standard.plan();
    games.standard.readThrow(thrown(["d6"], [6], { set: ["d6"], resultString: "6 = 6", resultTotal: 6 }));
    assert.equal(host.totalEl.textContent, "8");
    assert.equal(host.breakdownEl.textContent, "6 + 2 = 8");
    assert.equal(host.notationEl.textContent, "1d6 + 2");
    assert.equal(modifier(), 0);
  });

  test("a later change to the modifier does not rewrite the finished roll", () => {
    const { games, host, setModifier } = harness();
    games.standard.loadQuery("?d6=1");
    setModifier(-1);
    games.standard.plan();
    games.standard.readThrow(thrown(["d6"], [4], { set: ["d6"], resultString: "4 = 4", resultTotal: 4 }));
    setModifier(9);
    assert.equal(host.totalEl.textContent, "3");
    assert.equal(host.breakdownEl.textContent, "4 - 1 = 3");
  });

  test("a percentile pair reads 00 and 0 as 100", () => {
    const { games, host, setPair } = harness();
    setPair(true);
    games.standard.loadQuery("?d100=1");
    assert.deepEqual(games.standard.plan().types, ["d100", "d9"]);
    games.standard.plan();
    games.standard.readThrow({ set: ["d100", "d9"], result: [0, 0], roles: [], resultString: "", resultTotal: 0 });
    assert.equal(host.totalEl.textContent, "100");
    assert.equal(host.breakdownEl.textContent, "00 + 0 = 100");
  });

  test("the big hundred die stays a single die", () => {
    const { games, host } = harness();
    games.standard.loadQuery("?d100=1&d6=2");
    assert.deepEqual(games.standard.plan().types, ["d100s"]);
    games.standard.plan();
    games.standard.readThrow({ set: ["d100s"], result: [42], roles: [], resultString: "", resultTotal: 0 });
    assert.equal(host.totalEl.textContent, "42");
    assert.equal(host.notationEl.textContent, "d100");
  });

  test("clear empties the tray and the address", () => {
    const { games, urls } = harness();
    games.standard.loadQuery("?d8=3");
    games.standard.clearTray();
    assert.deepEqual(games.standard.plan().types, []);
    assert.equal(urls.at(-1), "/roller");
  });

  test("rejects a bad count", () => {
    const { games } = harness();
    assert.throws(() => games.standard.loadQuery("?d6=no"), /Invalid count for d6/);
  });
});

describe("loner", () => {
  test("the three buttons throw the matching pools", () => {
    const { games, host, rolls, use } = harness();
    use(games.loner);
    games.loner.render();
    assert.deepEqual(host.picker.children.map((button) => button.textContent), ["EVN", "ADV", "DIS"]);

    find(host.picker, "Even").click();
    assert.deepEqual(games.loner.plan().paints.map((paint) => paint.role), ["chance", "risk"]);
    find(host.picker, "Advantage").click();
    assert.deepEqual(games.loner.plan().paints.map((paint) => paint.role), ["chance", "chance", "risk"]);
    find(host.picker, "Disadvantage").click();
    assert.deepEqual(games.loner.plan().paints.map((paint) => paint.role), ["chance", "risk", "risk"]);
    assert.deepEqual(rolls, ["button", "button", "button"]);
    assert.equal(games.loner.controls.clear, false);
  });

  test("keeps the highest face of each colour", () => {
    const { games, host } = harness();
    games.loner.render();
    find(host.picker, "Advantage").click();
    games.loner.readThrow(thrown(["chance", "chance", "risk"], [1, 6, 4]));
    assert.equal(host.totalEl.textContent, "Yes, and...");
    assert.equal(host.breakdownEl.textContent, "Chance 1, 6. Risk 4");
  });

  test("a tie banks a twist and the third tie spends it", () => {
    const { games, host, use } = harness();
    use(games.loner);
    const tie = () => games.loner.readThrow(thrown(["chance", "risk"], [3, 3]));
    tie();
    assert.equal(host.totalEl.textContent, "Yes, but...");
    assert.equal(host.notationEl.textContent, "Twist 1");
    tie();
    assert.equal(host.notationEl.textContent, "Twist 2");
    const random = Math.random;
    Math.random = () => 0;
    try {
      tie();
    } finally {
      Math.random = random;
    }
    assert.equal(host.totalEl.textContent, "Twist");
    assert.equal(host.breakdownEl.textContent, "Yes, but.... A third party appears");
    assert.equal(host.notationEl.textContent, "Twist 0");
    games.loner.render();
    assert.equal(host.twistReadout.textContent, "Twist 0");
  });

  test("reads yes and no, with but or and when both faces share a band", () => {
    const { games, host } = harness();
    games.loner.readThrow(thrown(["chance", "risk"], [2, 5]));
    assert.equal(host.totalEl.textContent, "No");
    games.loner.readThrow(thrown(["chance", "risk"], [2, 1]));
    assert.equal(host.totalEl.textContent, "Yes, but...");
    games.loner.readThrow(thrown(["chance", "risk"], [6, 4]));
    assert.equal(host.totalEl.textContent, "Yes, and...");
  });
});

describe("year zero", () => {
  test("counts sixes, and only a push reports damage", () => {
    const { games, host, use } = harness();
    use(games.yearzero);
    games.yearzero.render();
    find(host.picker, "Add Base").click();
    find(host.picker, "Add Skill").click();
    find(host.picker, "Add Gear").click();
    find(host.picker, "Add Stress").click();
    assert.equal(host.cap.textContent, "4/15");
    assert.equal(games.yearzero.notation(), "1base+1skill+1gear+1stress");

    const pool = games.yearzero.plan();
    games.yearzero.readThrow(thrown(pool.paints.map((paint) => paint.role), [1, 1, 6, 2]));
    games.yearzero.render();
    assert.equal(host.totalEl.textContent, "1 success");
    assert.equal(host.breakdownEl.textContent, "Base 1. Skill 1. Gear 6. Stress 2");
    assert.equal(host.pushButton.hidden, false);

    const push = games.yearzero.plan("push");
    assert.deepEqual(push.paints.map((paint) => paint.role), ["skill", "stress"]);
    games.yearzero.readThrow(thrown(push.paints.map((paint) => paint.role), [4, 1]));
    assert.equal(host.notationEl.textContent, "Pushed");
    assert.equal(host.totalEl.textContent, "1 success. Base damage 1. Panic");
    assert.equal(host.breakdownEl.textContent, "Base 1. Skill 4. Gear 6. Stress 1");
    assert.equal(games.yearzero.notation("push"), "yearzero-push");
  });

  test("a gear one dealt on the push is gear damage", () => {
    const { games, host, use } = harness();
    use(games.yearzero);
    games.yearzero.render();
    find(host.picker, "Add Gear").click();
    const pool = games.yearzero.plan();
    games.yearzero.readThrow(thrown(pool.paints.map((paint) => paint.role), [2]));
    const push = games.yearzero.plan("push");
    games.yearzero.readThrow(thrown(push.paints.map((paint) => paint.role), [1]));
    assert.equal(host.totalEl.textContent, "0 successes. Gear damage 1");
  });

  test("clear drops the pool and the last roll", () => {
    const { games, host, use } = harness();
    use(games.yearzero);
    games.yearzero.render();
    find(host.picker, "Add Base").click();
    const pool = games.yearzero.plan();
    games.yearzero.readThrow(thrown(pool.paints.map((paint) => paint.role), [2]));
    games.yearzero.clearTray();
    games.yearzero.render();
    assert.deepEqual(games.yearzero.plan().types, []);
    assert.equal(host.cap.textContent, "0/15");
    assert.equal(host.pushButton.hidden, true);
    assert.equal(host.rollButton.disabled, true);
  });
});
