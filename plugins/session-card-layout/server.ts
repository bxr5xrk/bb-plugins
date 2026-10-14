import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    layout: {
      type: "select",
      label: "Вигляд картки сесії",
      description: "Застосовується одразу до списків сесій Project Workspace.",
      options: ["Поточний", "Два рядки", "Один рядок"],
      default: "Поточний",
    },
  });
}
