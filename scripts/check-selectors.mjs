import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const q = "[`\"']";
const attr = (name, value) => new RegExp(`"${name}":${q}${value}${q}`);

const selectors = {
  graphite: ["bg-surface-scrim"],
  "thread-view": [
    /"data-promptbox":/,
    "data-promptbox-submit-action",
    "data-promptbox-send-menu",
    "data-promptbox-submit-group",
    "data-promptbox-editor-scroll",
    "data-promptbox-action-row",
    "data-promptbox-compact",
    "data-markdown-preview",
    "max-w-[760px]",
    "thread-scrollbar",
    "data-page-scroll-viewport",
    "chat-prompt-box",
    "data-message-column",
    "group/message",
    "max-w-[70%]",
    "data-sent-message-inline-editor-host",
    "data-timeline-row-id",
  ],
  "project-workspace": [
    "app-layout-root",
    "app-sidebar-body",
    "app-nav-rail",
    "app-sidebar-top-reserve-row",
    "nav-rail-header",
    "nav-rail-sidebar-body",
    "data-nav-rail-item",
    "data-footer-item",
    "data-framed",
    "sidebar-footer-row",
    "plugin-sidebar-footer-disclosure-",
    "plugin-sidebar-footer-trigger-",
    attr("data-sidebar", "panel"),
    attr("data-sidebar", "gap"),
    attr("data-sidebar", "footer"),
    attr("data-sidebar", "collapsible-body"),
  ],
};

const fetchAssets = (version) => {
  const dir = mkdtempSync(join(tmpdir(), "bb-app-"));
  const tarball = execFileSync("npm", ["pack", `bb-app@${version}`, "--silent", "--pack-destination", dir], { encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["-xzf", join(dir, tarball), "-C", dir, "package/app/dist/assets", "package/package.json"]);
  const { version: resolved } = JSON.parse(readFileSync(join(dir, "package/package.json"), "utf8"));
  return { assets: join(dir, "package/app/dist/assets"), resolved };
};

const [arg = "latest"] = process.argv.slice(2);
const { assets, resolved } = arg.includes("/") ? { assets: arg, resolved: arg } : fetchAssets(arg);
const bundle = readdirSync(assets)
  .filter((file) => /\.(js|css)$/.test(file))
  .map((file) => readFileSync(join(assets, file), "utf8"))
  .join("\n");

let missing = 0;
for (const [plugin, needles] of Object.entries(selectors)) {
  for (const needle of needles) {
    const found = needle instanceof RegExp ? needle.test(bundle) : bundle.includes(needle);
    if (!found) {
      missing++;
      console.log(`MISSING  ${plugin}  ${needle}`);
    }
  }
}
console.log(missing ? `${missing} selector(s) missing in bb-app ${resolved}` : `all selectors present in bb-app ${resolved}`);
process.exit(missing ? 1 : 0);
