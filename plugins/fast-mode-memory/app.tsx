import { useEffect, useRef } from "react";
import {
  definePluginApp,
  experimental_usePluginId,
  useComposers,
  type PluginComposerApi,
} from "@get-bb/plugin-sdk/app";
import { rememberTier, tierStorageKey, type TierMemory } from "./tier-memory";

function RememberComposer({ composer }: { composer: PluginComposerApi }) {
  const pluginId = experimental_usePluginId();
  const selection = composer.selection;
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const key = threadId && selection?.providerId && selection.model
    ? tierStorageKey(pluginId, threadId, selection.providerId, selection.model)
    : null;
  const tier = selection?.serviceTier;
  const memory = useRef<TierMemory | null>(null);

  useEffect(() => {
    if (!key || !tier) return;
    const instance = rememberTier({
      key,
      current: tier,
      storage: window.localStorage,
      apply: async (savedTier) => {
        const result = await composer.setSelection({ serviceTier: savedTier });
        return result.serviceTier;
      },
      report: (error) => console.warn(`[${pluginId}] Fast mode persistence`, error),
    });
    memory.current = instance;
    return () => {
      instance.dispose();
      memory.current = null;
    };
    // The controller owns tier changes; recreate only for a different chat/model.
  }, [key, composer, pluginId, tier === undefined]);

  useEffect(() => {
    if (tier) memory.current?.observe(tier);
  }, [key, tier]);

  return null;
}

function FastModeMemory() {
  const composers = useComposers();
  return composers
    .filter((composer) => composer.scope.kind === "thread")
    .map((composer) => <RememberComposer key={composer.key} composer={composer} />);
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "remember-fast-mode", component: FastModeMemory });
});
