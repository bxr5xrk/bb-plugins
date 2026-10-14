import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function graphite(bb: BbPluginApi) {
  bb.log.info("graphite loaded");
}
