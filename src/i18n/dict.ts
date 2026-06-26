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
  "app.openCta": "Open repository",
  "graph.search": "Search commits…",
  "sidebar.open": "Open",
  "sidebar.openRepo": "Open repository",
  "sidebar.repos": "Repos",
  "sidebar.agents": "Agents",
  "sidebar.noRepos": "No repositories yet.",
  "sidebar.favorite": "Favorite",
  "sidebar.unfavorite": "Unfavorite",
  "sidebar.remove": "Remove from list",
  "sidebar.search": "Search repositories…",
  "sidebar.favorites": "Favorites",
  "sidebar.recent": "Recent",
  "sidebar.noMatch": "No matches.",
  "lang.label": "Language",
  "agents.intro": "Run a coding agent (Claude Code, Codex, …) in an isolated worktree — it works on its own branch and can't touch your main checkout.",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.signing": "Commit signing",
  "settings.sign.enable": "Sign commits by default",
  "settings.sign.format": "Format",
  "settings.sign.keyGpg": "GPG key id",
  "settings.sign.keySsh": "~/.ssh/id_ed25519.pub",
  "settings.sign.save": "Save",
  "settings.shortcuts": "Keyboard shortcuts",
  "settings.shortcuts.open": "Open shortcuts…",
  "toolbar.settings": "Settings",
};

const ru: Dict = {
  "app.tagline": "Откройте репозиторий, чтобы начать.",
  "app.openCta": "Открыть репозиторий",
  "graph.search": "Поиск commit…",
  "sidebar.open": "Открыть",
  "sidebar.openRepo": "Открыть репозиторий",
  "sidebar.repos": "Репозитории",
  "sidebar.agents": "Агенты",
  "sidebar.noRepos": "Пока нет репозиториев.",
  "sidebar.favorite": "В избранное",
  "sidebar.unfavorite": "Убрать из избранного",
  "sidebar.remove": "Убрать из списка",
  "sidebar.search": "Поиск репозиториев…",
  "sidebar.favorites": "Избранное",
  "sidebar.recent": "Недавние",
  "sidebar.noMatch": "Ничего не найдено.",
  "lang.label": "Язык",
  "agents.intro": "Запустите кодинг-агента (Claude Code, Codex, …) в изолированном worktree — он работает в своей branch и не трогает ваш основной checkout.",
  "settings.title": "Настройки",
  "settings.language": "Язык",
  "settings.signing": "Подпись commit",
  "settings.sign.enable": "Подписывать commit по умолчанию",
  "settings.sign.format": "Формат",
  "settings.sign.keyGpg": "ID GPG-ключа",
  "settings.sign.keySsh": "~/.ssh/id_ed25519.pub",
  "settings.sign.save": "Сохранить",
  "settings.shortcuts": "Горячие клавиши",
  "settings.shortcuts.open": "Открыть…",
  "toolbar.settings": "Настройки",
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
