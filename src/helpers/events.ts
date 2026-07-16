import type { UnlistenFn } from "@tauri-apps/api/event";

export function disposeListener(listener: Promise<UnlistenFn>) {
  listener
    .then((dispose) => {
      try {
        Promise.resolve(dispose()).catch(() => {});
      } catch {
        // Hot reload can remove native listeners before React cleanup runs.
      }
    })
    .catch(() => {});
}
