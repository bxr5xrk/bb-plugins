import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { SkillsTab } from "./components/skills-tab";
import "./skill-lens.css";

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "skills-tab", component: SkillsTab });
});
