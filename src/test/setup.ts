import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { useRepos } from "../store/repos";

// Shared registry of Tauri event listeners so tests can fire events that the app
// subscribes to via listen() — e.g. the native-menu "menu" event. Kept inside a
// hoisted object (vi.mock factories are hoisted above imports).
const h = vi.hoisted(() => ({
  handlers: new Map<string, Array<(e: { payload: unknown }) => void>>(),
}));

/** Fire a Tauri event to all current listeners (test helper). */
export function fireTauriEvent(name: string, payload: unknown) {
  for (const cb of [...(h.handlers.get(name) ?? [])]) cb({ payload });
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
    const arr = h.handlers.get(name) ?? [];
    arr.push(cb);
    h.handlers.set(name, arr);
    return () => {
      const a = h.handlers.get(name);
      if (a) h.handlers.set(name, a.filter((f) => f !== cb));
    };
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn(async () => undefined) }));

// xterm touches browser APIs jsdom lacks; stub it (no test drives a terminal).
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    open() {}
    write() {}
    dispose() {}
    loadAddon() {}
    onData() {
      return { dispose() {} };
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    activate() {}
    fit() {}
    dispose() {}
  },
}));

// Pristine store snapshot (defaults + action fns), restored between tests.
const initialStore = { ...useRepos.getState() };

afterEach(() => {
  cleanup();
  h.handlers.clear();
  useRepos.setState(initialStore, true);
});
