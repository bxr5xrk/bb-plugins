import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.BB_URL ?? JSON.parse(readFileSync(join(homedir(), ".bb/bb-app-runtime.json"), "utf8")).serverUrl;
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const passes = [{ width: 1400 }, { width: 900 }, { width: 1400, framed: true }];
// Desktop BB frames the window when window.bbDesktop exists; this stub is just enough to boot that layout.
const desktopStub = `(() => {
  const ret = Object.assign(() => {}, { then: (r, j) => Promise.resolve(undefined).then(r, j), catch: () => Promise.resolve(), finally: (f) => Promise.resolve().finally(f) });
  const pick = (p) => typeof p !== "string" ? undefined : p === "toString" || p === "valueOf" ? () => "" : /^(is|has)[A-Z]/.test(p) ? false : /^on[A-Z]/.test(p) ? () => () => {} : deep;
  const deep = new Proxy(function () {}, { get: (t, p) => p === "then" ? undefined : p === "prototype" ? t.prototype : pick(p), apply: () => ret });
  const base = { platform: "macos", macosTrafficLightInset: 17, macosTrafficLightTopInset: 15, getWindowState: () => Promise.resolve({ isFullScreen: false }), getInfo: () => Promise.resolve({ platform: "macos" }) };
  window.bbDesktop = new Proxy(base, { get: (t, p) => p in t ? t[p] : pick(p) });
})();`;
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

for (const pass of passes) {
  const { width } = pass, tag = pass.framed ? `${width}f` : width;
  const stub = pass.framed ? await send("Page.addScriptToEvaluateOnNewDocument", { source: desktopStub }) : null;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
  await open("/");
  await screenshot(`${tag}-home`);

  await check(tag, "project-workspace sidebar mounted", async () => {
    assert(await evaluate(() => !!document.querySelector("[data-project-workspace-sidebar]")), "[data-project-workspace-sidebar] not rendered");
  });
  await check(tag, "one visible Settings control", async () => {
    const count = await evaluate(() => [...document.querySelectorAll('[data-sidebar="panel"] button[aria-label^="Settings"]')].filter((e) => e.checkVisibility()).length);
    assert(count === 1, `${count} visible Settings buttons`);
  });
  await check(tag, "footer shows only usage, in rail above Settings", async () => {
    const state = await evaluate(() => {
      const items = [...document.querySelectorAll('[data-testid="sidebar-footer-body"] button, [data-testid="sidebar-footer-body"] a')].filter((e) => e.checkVisibility());
      if (items.length !== 1 || items[0].getAttribute("aria-label") !== "Provider usage") return `visible footer items: ${items.map((e) => e.getAttribute("aria-label")).join(", ")}`;
      const usage = items[0].getBoundingClientRect();
      const rail = document.querySelector('[data-testid="sidebar-navigation-rail"]').getBoundingClientRect();
      const settings = [...document.querySelectorAll('[data-sidebar="panel"] button[aria-label^="Settings"]')].find((e) => e.checkVisibility()).getBoundingClientRect();
      if (usage.right > rail.right || usage.bottom > settings.top) return `usage at ${Math.round(usage.x)},${Math.round(usage.y)}, settings at ${Math.round(settings.y)}`;
      return items[0].contains(document.elementFromPoint(usage.x + usage.width / 2, usage.y + usage.height / 2)) ? "" : "usage covered";
    });
    assert(!state, state);
  });
  await check(tag, "workspace reaches bottom and right edge", async () => {
    const state = await evaluate(() => {
      const shell = document.querySelector("[data-project-workspace-sidebar]").getBoundingClientRect();
      const panel = document.querySelector('[data-sidebar="panel"]').getBoundingClientRect();
      const card = document.querySelector('[data-testid="nav-rail-sidebar-body"]').getBoundingClientRect();
      if (card.bottom - shell.bottom > 2) return `workspace ends at ${Math.round(shell.bottom)}, sidebar card at ${Math.round(card.bottom)}`;
      return panel.right - shell.right > 2 ? `${Math.round(panel.right - shell.right)}px gap on the right` : "";
    });
    assert(!state, state);
  });
  await check(tag, "sidebar resize follows the pointer", async () => {
    const panelWidth = () => evaluate(() => document.querySelector('[data-sidebar="panel"]').getBoundingClientRect().width);
    const box = await evaluate(() => { const e = document.querySelector(".pw-sidebar-resize"); if (!e.checkVisibility()) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (!box) return "skip";
    const before = await panelWidth();
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + 5, y: box.y, button: "left", buttons: 1 });
    await sleep(400);
    const first = await panelWidth();
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x - 20, y: box.y, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x - 20, y: box.y, button: "left", clickCount: 1 });
    await sleep(400);
    const after = await panelWidth();
    assert(Math.abs(first - before - 5) <= 1 && Math.abs(after - before + 20) <= 1, `${before} -> +5: ${first} -> -20: ${after}`);
  });
  await check(tag, "Settings opens /settings", async () => {
    await click('[data-sidebar="panel"] button[aria-label^="Settings"]');
    await sleep(800);
    const path = await evaluate(() => location.pathname);
    assert(path.startsWith("/settings"), `stayed on ${path}`);
  });
  await check(tag, "plugin has no own navigation", async () => {
    assert(!(await evaluate(() => !!document.querySelector(".pw-navigation"))), ".pw-navigation rendered");
  });
  for (const label of ["Home", "Search threads", "Plugins", "Skills", "Automations"]) {
    await check(tag, `native rail ${label}`, async () => {
      const state = await evaluate((l) => {
        const button = document.querySelector(`[data-testid="sidebar-navigation-rail"] [aria-label^="${l}"]`);
        if (!button?.checkVisibility()) return "not visible";
        const r = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) ? "" : "covered";
      }, label);
      assert(!state, state);
    });
  }

  await open("/");
  const trigger = '[data-sidebar="footer"] [data-testid^="plugin-sidebar-footer-item-"][aria-controls]';
  const railHeight = () => evaluate(() => document.querySelector(".pw-rail-scroll")?.clientHeight ?? null);
  const disclosureOpen = () => evaluate(() => !!document.querySelector('section[id^="plugin-sidebar-footer-disclosure-"]'));
  const before = await railHeight();
  await check(tag, "usage disclosure opens without squeezing the rail", async () => {
    await click(trigger);
    await sleep(1000);
    await screenshot(`${tag}-disclosure`);
    assert(await disclosureOpen(), "disclosure did not open");
    const after = await railHeight();
    assert(after === before, `rail height ${before} -> ${after}`);
  });
  await check(tag, "usage disclosure is on top, usage icon has no frame", async () => {
    if (!(await disclosureOpen())) return "skip";
    const state = await evaluate(() => {
      const section = document.querySelector('section[id^="plugin-sidebar-footer-disclosure-"]');
      const r = section.getBoundingClientRect();
      for (let x = r.left + 4; x < r.right - 4; x += 6) for (let y = r.top + 4; y < r.bottom - 4; y += 20) {
        const hit = document.elementFromPoint(x, y);
        if (!section.contains(hit)) return `covered by ${hit?.className.toString().split(" ")[0]} at ${Math.round(x)},${Math.round(y)}`;
      }
      const c = getComputedStyle(document.querySelector('[data-testid="sidebar-footer-body"]'));
      return c.backgroundColor === "rgba(0, 0, 0, 0)" && c.borderLeftWidth === "0px" && c.borderBottomWidth === "0px" ? "" : `footer bg ${c.backgroundColor}, border ${c.borderLeftWidth}/${c.borderBottomWidth}`;
    });
    assert(!state, state);
  });
  await check(tag, "click inside disclosure keeps it open", async () => {
    if (!(await disclosureOpen())) return "skip";
    await click('section[id^="plugin-sidebar-footer-disclosure-"]');
    await sleep(500);
    assert(await disclosureOpen(), "closed on inside click");
  });
  await check(tag, "click outside closes disclosure", async () => {
    if (!(await disclosureOpen())) return "skip";
    await mouse(width - 150, 500);
    await sleep(800);
    assert(!(await disclosureOpen()), "still open");
  });

  await check(tag, "skill-lens tab replaces My skills content", async () => {
    await open("/skills?view=library");
    await sleep(1500);
    const tab = "[data-skill-lens-tab]";
    if (!(await evaluate((s) => !!document.querySelector(s), tab))) return "skip";
    await click(tab);
    await sleep(2000);
    await screenshot(`${tag}-skill-lens`);
    const state = await evaluate(() => {
      const main = document.querySelector('[data-testid="app-layout-content-shell"] > main');
      if (!main?.querySelector(".sl-root")?.checkVisibility()) return "skill lens not visible";
      const native = [...main.children].filter((n) => !n.classList.contains("sl-root") && n.checkVisibility());
      return native.length ? `${native.length} native block(s) still visible` : "";
    });
    assert(!state, state);
    await click('.sl-root button[aria-label^="View details for"]');
    await sleep(2500);
    await screenshot(`${tag}-skill-lens-page`);
    assert(await evaluate(() => !!document.querySelector(".sl-page .sl-file[aria-pressed=true]")?.checkVisibility()), "skill page shows no selected file");
    await evaluate(() => [...document.querySelectorAll('[data-testid="skills-sidebar-body"] a')].find((a) => a.textContent === "My skills")?.click());
    await sleep(800);
    assert(!(await evaluate(() => !!document.querySelector(".sl-root"))), "skill lens stayed after native tab click");
  });
  if (pass.framed) {
    await check(tag, "desktop frame active", async () => {
      assert(await evaluate(() => document.querySelector('[data-testid="app-layout-root"]')?.hasAttribute("data-framed")), "data-framed missing");
    });
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: stub.identifier });
  }
}

ws.close();
await new Promise((resolve) => { browser.once("exit", resolve); browser.kill(); });
rmSync(profile, { recursive: true, force: true });
const version = JSON.parse(readFileSync(join(homedir(), ".bb/bb-app-runtime.json"), "utf8")).version;
for (const r of results) console.log(`${r.status.padEnd(4)}  ${String(r.width).padEnd(4)}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\nbb ${version}: ${failed ? `${failed} check(s) failed` : "all checks passed"}; screenshots in ${out}`);
process.exit(failed ? 1 : 0);
