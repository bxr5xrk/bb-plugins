import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function graphiteGlass(bb: BbPluginApi) {
  bb.log.info("graphite-glass loaded");
}
