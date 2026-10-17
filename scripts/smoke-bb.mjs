import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.BB_URL ?? JSON.parse(readFileSync(join(homedir(), ".bb/bb-app-runtime.json"), "utf8")).serverUrl;
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const widths = [1400, 900];
const out = mkdtempSync(join(tmpdir(), "bb-smoke-"));
const profile = mkdtempSync(join(tmpdir(), "bb-smoke-profile-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const portFile = join(profile, "DevToolsActivePort");
for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
const port = readFileSync(portFile, "utf8").split("\n")[0];
const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++seq, { resolve, reject });
  ws.send(JSON.stringify({ id: seq, method, params }));
});
const evaluate = async (fn, ...args) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
};
const open = async (path) => {
  await send("Page.navigate", { url: new URL(path, base).href });
  for (let i = 0; i < 100 && !(await evaluate(() => !!document.querySelector("[data-project-workspace-sidebar]")).catch(() => false)); i++) await sleep(100);
  await sleep(1500);
};
const mouse = async (x, y) => {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
};
const click = async (selector) => {
  const box = await evaluate((s) => {
    const element = [...document.querySelectorAll(s)].find((e) => e.checkVisibility());
    if (!element) return { error: `not found: ${s}` };
    const r = element.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !element.contains(hit)) return { error: `covered by ${hit?.tagName.toLowerCase()}.${hit?.className.toString().split(" ")[0]}: ${s}` };
    return { x, y };
  }, selector);
  if (box.error) throw new Error(box.error);
  await mouse(box.x, box.y);
};
const screenshot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(data, "base64"));
};

const results = [];
const check = async (width, name, fn) => {
  try {
    const detail = await fn();
    results.push({ width, name, status: detail === "skip" ? "SKIP" : "PASS", detail: detail === "skip" ? "" : detail ?? "" });
  } catch (error) {
    results.push({ width, name, status: "FAIL", detail: error.message });
  }
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });

for (const width of widths) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await open("/");
  await screenshot(`${width}-home`);

  await check(width, "project-workspace sidebar mounted", async () => {
    assert(await evaluate(() => !!document.querySelector("[data-project-workspace-sidebar]")), "[data-project-workspace-sidebar] not rendered");
  });
  await check(width, "one visible Settings control", async () => {
    const count = await evaluate(() => [...document.querySelectorAll('[data-sidebar="panel"] button[aria-label^="Settings"]')].filter((e) => e.checkVisibility()).length);
    assert(count === 1, `${count} visible Settings buttons`);
  });
  await check(width, "sidebar footer visible and clickable", async () => {
    const state = await evaluate(() => {
      const footer = document.querySelector('[data-sidebar="footer"]');
      if (!footer?.checkVisibility()) return "footer hidden";
      const r = footer.getBoundingClientRect();
      if (r.height < 1 || r.bottom > innerHeight + 1) return `footer off-screen ${Math.round(r.y)}+${Math.round(r.height)}`;
      const hit = document.elementFromPoint(r.x + 12, r.y + r.height / 2);
      return footer.contains(hit) ? "" : `footer covered by ${hit?.className.toString().split(" ")[0]}`;
    });
    assert(!state, state);
  });
  await check(width, "Settings opens /settings", async () => {
    await click('[data-sidebar="panel"] button[aria-label^="Settings"]');
    await sleep(800);
    const path = await evaluate(() => location.pathname);
    assert(path.startsWith("/settings"), `stayed on ${path}`);
  });
  for (const label of ["Search threads", "Plugins", "Skills", "Automations"]) {
    await check(width, `rail ${label}`, async () => {
      await open("/");
      if (!(await evaluate((l) => document.querySelector(`.pw-navigation button[aria-label="${l}"]`)?.checkVisibility() ?? false, label))) return "skip";
      await click(`.pw-navigation button[aria-label="${label}"]`);
      await sleep(600);
      const error = await evaluate(() => document.querySelector(".pw-row-error")?.textContent ?? "");
      assert(!error, error);
    });
  }

  await open("/");
  const trigger = '[data-sidebar="footer"] [data-testid^="plugin-sidebar-footer-item-"][aria-controls]';
  const hasDisclosure = await evaluate((s) => !!document.querySelector(s), trigger);
  const railHeight = () => evaluate(() => document.querySelector(".pw-rail-scroll")?.clientHeight ?? null);
  const disclosureOpen = () => evaluate(() => !!document.querySelector('section[id^="plugin-sidebar-footer-disclosure-"]'));
  const before = await railHeight();
  await check(width, "footer disclosure opens without squeezing the rail", async () => {
    if (!hasDisclosure) return "skip";
    await click(trigger);
    await sleep(1000);
    await screenshot(`${width}-disclosure`);
    assert(await disclosureOpen(), "disclosure did not open");
    const after = await railHeight();
    assert(after === before, `rail height ${before} -> ${after}`);
  });
  await check(width, "click inside disclosure keeps it open", async () => {
    if (!hasDisclosure || !(await disclosureOpen())) return "skip";
    await click('section[id^="plugin-sidebar-footer-disclosure-"]');
    await sleep(500);
    assert(await disclosureOpen(), "closed on inside click");
  });
  await check(width, "click outside closes disclosure", async () => {
    if (!hasDisclosure || !(await disclosureOpen())) return "skip";
    await mouse(width - 150, 500);
    await sleep(800);
    assert(!(await disclosureOpen()), "still open");
  });
}

ws.close();
await new Promise((resolve) => { browser.once("exit", resolve); browser.kill(); });
rmSync(profile, { recursive: true, force: true });
const version = JSON.parse(readFileSync(join(homedir(), ".bb/bb-app-runtime.json"), "utf8")).version;
for (const r of results) console.log(`${r.status.padEnd(4)}  ${String(r.width).padEnd(4)}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\nbb ${version}: ${failed ? `${failed} check(s) failed` : "all checks passed"}; screenshots in ${out}`);
process.exit(failed ? 1 : 0);
