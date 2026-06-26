import { useRepos } from "../store/repos";
import { translate } from "./dict";

/**
 * Returns a `t(key, vars?)` bound to the current language. Subscribes to the
 * `lang` slice so components re-render when the language changes.
 */
export function useT() {
  const lang = useRepos((s) => s.lang);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
