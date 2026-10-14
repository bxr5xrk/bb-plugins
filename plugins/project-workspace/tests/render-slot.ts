import { renderSlot as renderSdkSlot } from "@get-bb/plugin-sdk/testing/app";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";

// Minimal successful SDK mutations; overrides retain failure/in-flight behavior.
export const renderSlot: typeof renderSdkSlot = (registration, props, options = {}) => {
  const mutation = async ({ threadId }: { threadId: string }) => makeThreadResponse({ id: threadId });
  return renderSdkSlot(registration, props, {
    ...options,
    sdk: {
      ...options.sdk,
      threads: { markRead: mutation, markUnread: mutation, pin: mutation, unpin: mutation,
        update: mutation, ...options.sdk?.threads },
    },
  });
};
