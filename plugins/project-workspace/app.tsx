import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { activateHostNavigation } from "./components/workspace-navigation";
import { ProjectWorkspace } from "./components/project-workspace";
import { WorkspaceSettings } from "./components/workspace-settings";
import { SessionCardsSettings } from "./components/session-cards-settings";
import { NativePreviewBridge } from "./components/native-preview-bridge";
import { mountShellStyle } from "./lib/shell-style";
import "./workspace.css";

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "preview-bridge", title: "Workspace file preview", component: NativePreviewBridge,
  });
  app.slots.experimental_threadList({
    id: "workspace", title: "Project Workspace",
    description: "Projects with adjacent Sessions and Explorer; native BB chat stays available.",
    component: ProjectWorkspace,
  });
  app.slots.settingsSection({
    id: "workspace-mode", title: "Workspace layout",
    description: "Switch between project-first navigation and Default BB.",
    component: WorkspaceSettings,
  });
  app.slots.settingsSection({
    id: "session-cards", title: "Session cards",
    description: "How much of each session the Sessions list shows. Shorter cards fit more sessions on screen.",
    component: SessionCardsSettings,
  });
  app.experimental_sidebarFooter.register({
    kind: "action", id: "settings", label: "Settings", icon: "Settings",
    onActivate: () => { activateHostNavigation("settings"); },
  });
  app.contentScripts.register({ id: "workspace-shell", mount: mountShellStyle });
});
