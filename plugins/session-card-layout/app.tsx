import { useEffect } from "react";
import { definePluginApp, useSettings } from "@get-bb/plugin-sdk/app";
import "./layout.css";

const attribute = "data-bb-session-card-layout";
const changeEvent = "bb-session-card-layout-change";

const LayoutBridge = () => {
  const { values } = useSettings();
  const layout = values?.layout;
  useEffect(() => {
    document.dispatchEvent(new CustomEvent(changeEvent, { detail: layout }));
  }, [layout]);
  return null;
};

export default definePluginApp(app => {
  app.contentScripts.register({
    id: "session-layout",
    mount({ signal }) {
      const root = document.documentElement;
      const update = (event: Event) => {
        const layout = (event as CustomEvent<unknown>).detail;
        if (layout === "Два рядки") root.setAttribute(attribute, "two-lines");
        else if (layout === "Один рядок") root.setAttribute(attribute, "one-line");
        else root.removeAttribute(attribute);
      };
      document.addEventListener(changeEvent, update, { signal });
      return () => {
        document.removeEventListener(changeEvent, update);
        root.removeAttribute(attribute);
      };
    },
  });
  app.slots.experimental_appOverlay({ id: "layout-bridge", component: LayoutBridge });
});
