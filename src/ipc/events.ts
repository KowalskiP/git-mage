// Typed wrappers around Tauri events emitted by the Rust backend.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Fired when the watched repo's working tree changes. Payload = repo path. */
export const onFsChange = (cb: (repoPath: string) => void): Promise<UnlistenFn> =>
  listen<string>("repo:fs-change", (e) => cb(e.payload));
