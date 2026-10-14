import { definePluginApp } from "@get-bb/plugin-sdk/app";
import "./app.css";

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "thread-view-styles",
    mount() {},
  });
});
