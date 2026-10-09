import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TOKEN = "__DICE_VERSION__";

export function stampVersion(html, versionJson, sha) {
  if (!sha || sha.includes(TOKEN)) throw new Error("Missing revision");
  const nextHtml = replaceToken("index.html", html, sha);
  const nextVersion = replaceToken("version.json", versionJson, sha);
  const meta = nextHtml.match(/name="dice-version" content="([^"]+)"/);
  const version = JSON.parse(nextVersion).version;
  if (!meta || meta[1] !== sha || version !== sha) {
    throw new Error("Published revision does not match this commit");
  }
  return { html: nextHtml, versionJson: nextVersion };
}

function replaceToken(name, text, sha) {
  if (!text.includes(TOKEN)) throw new Error(`${name} has no version token`);
  const next = text.replaceAll(TOKEN, sha);
  if (next.includes(TOKEN)) throw new Error(`${name} still has the version token`);
  return next;
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
}

if (isDirectRun()) {
  const sha = process.argv[2];
  const dir = process.argv[3] || ".";
  const htmlPath = join(dir, "index.html");
  const versionPath = join(dir, "version.json");
  const stamped = stampVersion(readFileSync(htmlPath, "utf8"), readFileSync(versionPath, "utf8"), sha);
  writeFileSync(htmlPath, stamped.html);
  writeFileSync(versionPath, stamped.versionJson);
}
