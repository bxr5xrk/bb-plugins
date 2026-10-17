import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

const PROVIDER_PLUGIN_ID = "provider-claude-code";
export const NARRATION_CHECK = "bbThreadViewIsNarration";
export const EXTRACT_TEXT_PATTERN =
  /function ([\w$]+)\(e\)\{let t=\[\];for\(let n of ([\w$]+)\(e\)\)\{let i=([\w$]+)\.safeParse\(n\);i\.success&&t\.push\(i\.data\.text\)\}/g;
const EXTRACT_TEXT_PATCHED =
  `function ${NARRATION_CHECK}(s){if(typeof s!="string"||!s)return!1;try{let v=(b,p)=>{let x=0,m=1,c;do{c=b[p++];x+=(c&127)*m;m*=128}while(c&128&&p<b.length);return[x,p]},f=(b,n)=>{let p=0;while(b&&p<b.length){let k,l,w;[k,p]=v(b,p);w=k&7;if(w===0){[,p]=v(b,p);continue}if(w===1){p+=8;continue}if(w===5){p+=4;continue}if(w!==2)return;[l,p]=v(b,p);if(Math.floor(k/8)===n)return b.subarray(p,p+l);p+=l}},r=f(f(f(Buffer.from(s,"base64"),2),1),8);return!!r&&Buffer.from(r).toString()==="narration"}catch{return!1}}` +
  `function $1(e){let t=[];for(let n of $2(e)){let i=$3.safeParse(n);i.success?t.push(i.data.text):n.type==="thinking"&&typeof n.thinking=="string"&&n.thinking.trim()&&${NARRATION_CHECK}(n.signature)&&t.push(n.thinking)}`;

const patchProviderHost = async (rootDir: string) => {
  const hostPath = join(rootDir, "dist", "host.js");
  const metaPath = join(rootDir, "dist", "host.meta.json");
  const host = await readFile(hostPath, "utf8");

  if (host.includes(NARRATION_CHECK)) {
    return "already-patched";
  }

  const matches = host.match(EXTRACT_TEXT_PATTERN);
  if (matches?.length !== 1) {
    return "unsupported";
  }

  const patchedHost = host.replace(EXTRACT_TEXT_PATTERN, EXTRACT_TEXT_PATCHED);
  const meta = JSON.parse(await readFile(metaPath, "utf8"));
  const artifactDigest = createHash("sha256").update(patchedHost).digest("hex");

  await writeFile(hostPath, patchedHost);
  await writeFile(metaPath, `${JSON.stringify({ ...meta, artifactDigest }, null, 2)}\n`);
  return "patched";
};

const showNarrationAsText = async (bb: BbPluginApi) => {
  const { plugins } = await bb.sdk.plugins.list();
  const provider = plugins.find((plugin) => plugin.id === PROVIDER_PLUGIN_ID);

  if (!provider) {
    return;
  }

  const result = await patchProviderHost(provider.rootDir);
  bb.log.info(`narration patch: ${result}`);

  if (result !== "patched") {
    return;
  }

  await bb.sdk.plugins.reload({ pluginId: PROVIDER_PLUGIN_ID });
};

export default function threadView(bb: BbPluginApi) {
  bb.log.info("thread-view loaded");
  showNarrationAsText(bb).catch((error: unknown) => {
    bb.log.error(`narration patch failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}
