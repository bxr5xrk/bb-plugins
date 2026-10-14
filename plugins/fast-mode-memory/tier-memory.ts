type StorageAccess = Pick<Storage, "getItem" | "setItem">;

export type TierMemory = {
  observe(tier: string): void;
  dispose(): void;
};

export function tierStorageKey(pluginId: string, threadId: string, providerId: string, model: string) {
  return `${pluginId}:tier:v1:${JSON.stringify([threadId, providerId, model])}`;
}

function isTier(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

/** Only changed selections are saved, so mounting never replaces saved Fast with server defaults. */
export function rememberTier({ key, current, storage, apply, report }: {
  key: string;
  current: string;
  storage: StorageAccess;
  apply(tier: string): Promise<string | undefined>;
  report(error: unknown): void;
}): TierMemory {
  let last = current;
  let disposed = false;
  let restoring = false;
  let saved: string | null = null;
  try {
    const value = storage.getItem(key);
    if (isTier(value)) saved = value;
  } catch (error) {
    report(error);
  }

  if (saved !== null && saved !== current) {
    restoring = true;
    const target = saved;
    // Defer one microtask so React cleanup can cancel an abandoned mount.
    Promise.resolve().then(async () => {
      if (disposed) return;
      try {
        const settled = await apply(target);
        if (disposed || !restoring) return;
        // Unsupported tiers can resolve as default. Keep the stored preference.
        last = settled ?? last;
      } catch (error) {
        if (!disposed) report(error);
      } finally {
        if (!disposed) restoring = false;
      }
    });
  }

  return {
    observe(tier) {
      if (disposed || !isTier(tier)) return;
      if (restoring) {
        if (tier === saved) {
          last = tier;
          restoring = false;
        }
        return;
      }
      if (tier === last) return;
      last = tier;
      try {
        storage.setItem(key, tier);
      } catch (error) {
        report(error);
      }
    },
    dispose() { disposed = true; },
  };
}
