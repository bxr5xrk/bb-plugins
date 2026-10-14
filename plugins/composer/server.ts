import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function composer(bb: BbPluginApi) {
  bb.log.info("composer loaded");
}
