/**
 * i18n dictionaries (SPEC §M7). Flat dotted keys; English is the source/
 * fallback. `t()` falls back to the English string, then the raw key, so a
 * missing translation degrades gracefully rather than blanking the UI.
 *
 * This is the foundation pass — core chrome is translated here; remaining
 * surfaces are migrated to `t()` incrementally.
 */
export type Lang = "en" | "ru";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
];

type Dict = Record<string, string>;

const en: Dict = {
  "app.tagline": "Open a repository to begin.",
  "sidebar.open": "Open",
  "sidebar.openRepo": "Open repository",
  "sidebar.repos": "Repos",
  "sidebar.agents": "Agents",
  "sidebar.noRepos": "No repositories yet.",
  "sidebar.favorite": "Favorite",
  "sidebar.unfavorite": "Unfavorite",
  "sidebar.remove": "Remove from list",
  "lang.label": "Language",
};

const ru: Dict = {
  "app.tagline": "Откройте репозиторий, чтобы начать.",
  "sidebar.open": "Открыть",
  "sidebar.openRepo": "Открыть репозиторий",
  "sidebar.repos": "Репозитории",
  "sidebar.agents": "Агенты",
  "sidebar.noRepos": "Пока нет репозиториев.",
  "sidebar.favorite": "В избранное",
  "sidebar.unfavorite": "Убрать из избранного",
  "sidebar.remove": "Убрать из списка",
  "lang.label": "Язык",
};

export const DICT: Record<Lang, Dict> = { en, ru };

/** Resolve a key for `lang`, falling back to English then the key itself. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICT[lang][key] ?? DICT.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
