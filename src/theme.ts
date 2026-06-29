// Theme tokens + applier (SPEC: appearance settings). The palette lives in CSS
// custom properties on :root; this module overrides them at runtime so users can
// switch dark/light/system and tweak individual colors, with reset-to-default.

export type ThemeMode = "system" | "dark" | "light";
export type IconTheme = "lucide" | "fantasy";

export const THEME_VARS = [
  "bg",
  "bg-elev",
  "bg-hover",
  "border",
  "text",
  "text-dim",
  "accent",
  "green",
  "red",
  "yellow",
  "blue",
] as const;
export type ThemeVar = (typeof THEME_VARS)[number];

/** Human labels for the customizer. */
export const THEME_VAR_LABELS: Record<ThemeVar, string> = {
  bg: "Background",
  "bg-elev": "Surface",
  "bg-hover": "Hover",
  border: "Border",
  text: "Text",
  "text-dim": "Muted text",
  accent: "Accent",
  green: "Added / success",
  red: "Removed / error",
  yellow: "Modified / warning",
  blue: "Branch / info",
};

export const DARK: Record<ThemeVar, string> = {
  bg: "#16181d",
  "bg-elev": "#1d2027",
  "bg-hover": "#262a33",
  border: "#2c313c",
  text: "#d8dce4",
  "text-dim": "#8b93a3",
  accent: "#8b5cf6",
  green: "#5ec27a",
  red: "#e06c75",
  yellow: "#d6a35c",
  blue: "#61afef",
};

export const LIGHT: Record<ThemeVar, string> = {
  bg: "#f6f7f9",
  "bg-elev": "#ffffff",
  "bg-hover": "#eceef2",
  border: "#d6dae2",
  text: "#1c2027",
  "text-dim": "#5c6573",
  accent: "#7c3aed",
  green: "#2e9e57",
  red: "#d0463b",
  yellow: "#b7791f",
  blue: "#2563eb",
};

export interface Appearance {
  mode: ThemeMode;
  custom: Partial<Record<ThemeVar, string>>;
  scale: number;
  iconTheme: IconTheme;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  custom: {},
  scale: 1,
  iconTheme: "lucide",
};

/** Resolve "system" to a concrete palette using the OS preference. */
export function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    const m =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: light)").matches
        : false;
    return m ? "light" : "dark";
  }
  return mode;
}

export function basePalette(mode: ThemeMode): Record<ThemeVar, string> {
  return resolveMode(mode) === "light" ? LIGHT : DARK;
}

/** Write the resolved palette + interface scale onto the document. */
export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const base = basePalette(a.mode);
  for (const v of THEME_VARS) {
    root.style.setProperty(`--${v}`, a.custom[v] || base[v]);
  }
  root.dataset.theme = resolveMode(a.mode);
  // webkit honours `zoom`, scaling the whole px-based UI in one shot.
  document.body.style.zoom = String(a.scale);
}
