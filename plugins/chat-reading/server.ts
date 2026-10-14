import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function chatReading(bb: BbPluginApi) {
  bb.log.info("chat-reading loaded");
}
