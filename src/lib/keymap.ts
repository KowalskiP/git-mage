/**
 * Central keyboard-shortcut registry (SPEC §M5). One source of truth for every
 * bindable action: its label, group, default chord and the store action it
 * runs. Bindings are normalised to a canonical, layout-independent string built
 * from physical key codes (so Cyrillic/other layouts still match), persisted as
 * id→chord overrides, and rendered with platform glyphs.
 */

export interface KeymapAction {
  id: string;
  label: string;
  group: string;
  /** Canonical default chord, e.g. "mod+shift+f"; "" means unbound. */
  defaultKey: string;
  /** True when the action needs an open repository. */
  needsRepo: boolean;
}

/** "mod" = ⌘ on macOS, Ctrl elsewhere. */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export const KEYMAP_ACTIONS: KeymapAction[] = [
  { id: "palette", label: "Command palette", group: "General", defaultKey: "mod+k", needsRepo: false },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "General", defaultKey: "mod+/", needsRepo: false },
  { id: "toggleTerminal", label: "Toggle terminal", group: "View", defaultKey: "mod+j", needsRepo: true },
  { id: "refresh", label: "Refresh", group: "View", defaultKey: "mod+shift+r", needsRepo: true },
  { id: "fetch", label: "Fetch", group: "Sync", defaultKey: "mod+shift+f", needsRepo: true },
  { id: "pull", label: "Pull", group: "Sync", defaultKey: "mod+shift+l", needsRepo: true },
  { id: "push", label: "Push", group: "Sync", defaultKey: "mod+shift+u", needsRepo: true },
  { id: "stageAll", label: "Stage all", group: "Changes", defaultKey: "mod+shift+a", needsRepo: true },
  { id: "stash", label: "Stash changes", group: "Changes", defaultKey: "mod+shift+s", needsRepo: true },
];

const CODE_TO_KEY: Record<string, string> = {
  Slash: "/",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Enter: "enter",
  Space: "space",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function keyFromCode(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  return CODE_TO_KEY[code] ?? null;
}

/**
 * Canonical chord for a keyboard event, or null for a modifier-only / unknown
 * press. Modifier order is fixed (mod, alt, shift) so it matches stored chords.
 */
export function eventBinding(e: {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string | null {
  const key = keyFromCode(e.code);
  if (!key) return null;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const GLYPH: Record<string, string> = {
  mod: IS_MAC ? "⌘" : "Ctrl",
  shift: "⇧",
  alt: IS_MAC ? "⌥" : "Alt",
  enter: "⏎",
  space: "Space",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  tab: "⇥",
};

/** Human-readable chord, e.g. "mod+shift+f" → "⌘⇧F". */
export function formatBinding(binding: string): string {
  if (!binding) return "—";
  return binding
    .split("+")
    .map((p) => GLYPH[p] ?? (p.length === 1 ? p.toUpperCase() : p))
    .join(IS_MAC ? "" : "+");
}

/** Effective id→chord map: defaults overlaid with the user's overrides. */
export function effectiveBindings(overrides: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of KEYMAP_ACTIONS) {
    out[a.id] = a.id in overrides ? overrides[a.id] : a.defaultKey;
  }
  return out;
}
