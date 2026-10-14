import { useEffect } from "react";
import { useBbNavigate, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { registerNativePreview } from "../lib/native-preview";

export function NativePreviewBridge({ threadId }: PluginThreadHeaderActionProps) {
  const navigate = useBbNavigate();
  useEffect(() => registerNativePreview(threadId, options => navigate.experimental_openFilePreview(options)), [threadId, navigate]);
  return null;
}
