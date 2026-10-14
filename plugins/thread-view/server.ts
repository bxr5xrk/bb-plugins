import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function threadView(bb: BbPluginApi) {
  bb.log.info("thread-view loaded");
}
