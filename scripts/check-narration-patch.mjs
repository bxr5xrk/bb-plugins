import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTRACT_TEXT_PATTERN, NARRATION_CHECK } from "../plugins/thread-view/server.ts";

const fetchProviderHost = (version) => {
  const dir = mkdtempSync(join(tmpdir(), "bb-app-"));
  const tarball = execFileSync("npm", ["pack", `bb-app@${version}`, "--silent", "--pack-destination", dir], { encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["-xzf", join(dir, tarball), "-C", dir, "package/server/dist/builtin-plugins/provider-claude-code/dist/host.js", "package/package.json"]);
  const { version: resolved } = JSON.parse(readFileSync(join(dir, "package/package.json"), "utf8"));
  return { host: readFileSync(join(dir, "package/server/dist/builtin-plugins/provider-claude-code/dist/host.js"), "utf8"), resolved };
};

const checkRelease = (version) => {
  const { host, resolved } = fetchProviderHost(version);
  const matches = host.match(EXTRACT_TEXT_PATTERN);
  if (matches?.length !== 1) {
    return `bb-app ${resolved}: EXTRACT_TEXT_PATTERN matched ${matches?.length ?? 0} times in provider host.js, update it and EXTRACT_TEXT_PATCHED in plugins/thread-view/server.ts`;
  }
  console.log(`bb-app ${resolved}: provider host.js is patchable`);
  return "";
};

const checkInstalled = () => {
  const { plugins } = JSON.parse(execFileSync("bb", ["plugin", "list", "--json"], { encoding: "utf8" }));
  const provider = plugins.find((plugin) => plugin.id === "provider-claude-code");
  const threadView = plugins.find((plugin) => plugin.id === "thread-view");
  if (provider?.status !== "running" || threadView?.status !== "running") {
    return `provider-claude-code is ${provider?.status}, thread-view is ${threadView?.status}; run bb plugin logs <id>`;
  }

  const host = readFileSync(join(provider.rootDir, "dist", "host.js"));
  const { artifactDigest } = JSON.parse(readFileSync(join(provider.rootDir, "dist", "host.meta.json"), "utf8"));
  if (!host.includes(NARRATION_CHECK)) {
    return "installed provider host.js is not patched; run bb plugin reload thread-view and read bb plugin logs thread-view";
  }
  if (createHash("sha256").update(host).digest("hex") !== artifactDigest) {
    return "installed provider host.js does not match artifactDigest in host.meta.json";
  }
  console.log("installed provider host.js is patched and its digest matches");
  return "";
};

const [version] = process.argv.slice(2);
const problem = version ? checkRelease(version) : checkInstalled();
if (problem) {
  console.log(`FAIL  ${problem}`);
}
process.exit(problem ? 1 : 0);
