import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { SHELL, shouldOfferUpdate, storedCacheKey, workerHandles } from "../offline.js";
import { stampVersion } from "../stamp-version.js";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const boot = readFileSync(new URL("boot.js", root), "utf8");
const version = JSON.parse(readFileSync(new URL("version.json", root), "utf8"));

describe("version check", () => {
  test("the page and version.json name the same revision", () => {
    const meta = html.match(/name="dice-version" content="([^"]+)"/);
    assert.equal(meta[1], version.version);
  });

  test("a different revision offers an update and the current one does not", () => {
    assert.equal(shouldOfferUpdate("dev", "dev"), false);
    assert.equal(shouldOfferUpdate("dev", "abc1234"), true);
  });

  test("a missing revision does not offer an update", () => {
    assert.equal(shouldOfferUpdate("dev", ""), false);
    assert.equal(shouldOfferUpdate("dev", null), false);
    assert.equal(shouldOfferUpdate("", "abc1234"), false);
  });

  test("the publish stamp writes the commit into both files", () => {
    const sha = "abc1234deadbeef";
    const stamped = stampVersion(html, JSON.stringify(version), sha);
    assert.equal(stamped.html.includes("__DICE_VERSION__"), false);
    assert.equal(stamped.versionJson.includes("__DICE_VERSION__"), false);
    assert.match(stamped.html, new RegExp(`name="dice-version" content="${sha}"`));
    assert.equal(JSON.parse(stamped.versionJson).version, sha);
  });

  test("the publish stamp stops when a file has no token", () => {
    const sha = "abc1234deadbeef";
    assert.throws(() => stampVersion(html.replaceAll("__DICE_VERSION__", "dev"), JSON.stringify(version), sha), /index.html/);
    assert.throws(() => stampVersion(html, JSON.stringify({ version: "dev" }), sha), /version.json/);
  });
});

describe("saved copy", () => {
  test("navigation is stored as the page, and other requests keep their own key", () => {
    assert.equal(storedCacheKey("navigate"), "index.html");
    assert.equal(storedCacheKey("same-origin"), null);
  });

  test("the version file is always read from the network", () => {
    const origin = "https://dice.example";
    assert.equal(workerHandles(`${origin}/version.json`, origin, "GET"), false);
    assert.equal(workerHandles(`${origin}/roller/version.json`, origin, "GET"), false);
    assert.equal(workerHandles(`${origin}/app.js?v=eng4`, origin, "GET"), true);
    assert.equal(workerHandles(`${origin}/app.js?v=eng4`, origin, "POST"), false);
    assert.equal(workerHandles("https://www.googletagmanager.com/gtag/js", origin, "GET"), false);
  });

  test("the precache lists the page assets and not the version file", () => {
    const refs = [
      ...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g),
      ...boot.matchAll(/"([^"]+\?v=[^"]+)"/g),
    ].map((match) => match[1]);
    for (const ref of refs) {
      assert.ok(SHELL.includes(ref), ref);
    }
    assert.equal(SHELL.includes("version.json"), false);
    assert.equal(SHELL.includes("offline.js?v=off1"), true);
  });
});
