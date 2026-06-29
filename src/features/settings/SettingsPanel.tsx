import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import { useT } from "../../i18n/useT";
import { LANGS } from "../../i18n/dict";
import { THEME_VARS, THEME_VAR_LABELS, basePalette, type ThemeMode } from "../../theme";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/**
 * Unified settings (SPEC §M7 / UX consolidation): language, commit signing and
 * a launcher for the keyboard-shortcuts editor. Centralises what used to be
 * scattered across the toolbar and sidebar.
 */
export function SettingsPanel() {
  const t = useT();
  const open = useRepos((s) => s.settingsOpen);
  const setSettings = useRepos((s) => s.setSettings);
  const lang = useRepos((s) => s.lang);
  const setLang = useRepos((s) => s.setLang);
  const signing = useRepos((s) => s.signing);
  const saveSigning = useRepos((s) => s.saveSigning);
  const setShortcuts = useRepos((s) => s.setShortcuts);
  const setProfilesOpen = useRepos((s) => s.setProfilesOpen);
  const appearance = useRepos((s) => s.appearance);
  const setThemeMode = useRepos((s) => s.setThemeMode);
  const setUiScale = useRepos((s) => s.setUiScale);
  const setIconTheme = useRepos((s) => s.setIconTheme);
  const setThemeVar = useRepos((s) => s.setThemeVar);
  const resetTheme = useRepos((s) => s.resetTheme);
  const busy = useRepos((s) => s.busy);

  const themeBase = basePalette(appearance.mode);
  const themeModes: { code: ThemeMode; key: string }[] = [
    { code: "system", key: "theme.system" },
    { code: "dark", key: "theme.dark" },
    { code: "light", key: "theme.light" },
  ];

  const [signEnabled, setSignEnabled] = useState(false);
  const [signFormat, setSignFormat] = useState("openpgp");
  const [signKey, setSignKey] = useState("");

  // Seed the signing form from config whenever the panel opens.
  useEffect(() => {
    if (open && signing) {
      setSignEnabled(signing.sign);
      setSignFormat(signing.format || "openpgp");
      setSignKey(signing.key);
    }
  }, [open, signing]);

  if (!open) return null;

  return (
    <div className="palette-backdrop" onClick={() => setSettings(false)}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings__head">
          <span className="settings__title">{t("settings.title")}</span>
          <button className="diff-close" onClick={() => setSettings(false)} title={t("settings.title")}>
            ✕
          </button>
        </div>
        <div className="settings__body">
          <section className="settings__group">
            <h4>{t("settings.appearance")}</h4>
            <div className="settings__row">
              <span className="sign-label">{t("settings.theme")}</span>
              <div className="seg">
                {themeModes.map((m) => (
                  <button
                    key={m.code}
                    className={"seg__btn" + (appearance.mode === m.code ? " seg__btn--on" : "")}
                    onClick={() => setThemeMode(m.code)}
                  >
                    {t(m.key)}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings__row">
              <span className="sign-label">{t("settings.iconStyle")}</span>
              <div className="seg">
                <button
                  className={"seg__btn" + (appearance.iconTheme === "lucide" ? " seg__btn--on" : "")}
                  onClick={() => setIconTheme("lucide")}
                >
                  {t("icon.lucide")}
                </button>
                <button
                  className={"seg__btn" + (appearance.iconTheme === "fantasy" ? " seg__btn--on" : "")}
                  onClick={() => setIconTheme("fantasy")}
                >
                  {t("icon.fantasy")}
                </button>
              </div>
            </div>
            <div className="settings__row">
              <span className="sign-label">{t("settings.scale")}</span>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.05}
                value={appearance.scale}
                onChange={(e) => setUiScale(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span className="settings__scale-val">{Math.round(appearance.scale * 100)}%</span>
            </div>
            <details className="settings__customize">
              <summary>{t("settings.customize")}</summary>
              <div className="theme-grid">
                {THEME_VARS.map((v) => (
                  <label key={v} className="theme-swatch" title={v}>
                    <input
                      type="color"
                      value={appearance.custom[v] || themeBase[v]}
                      onChange={(e) => setThemeVar(v, e.target.value)}
                    />
                    <span>{THEME_VAR_LABELS[v]}</span>
                  </label>
                ))}
              </div>
              <button className="tbtn" onClick={() => resetTheme()}>
                {t("settings.resetTheme")}
              </button>
            </details>
          </section>

          <section className="settings__group">
            <h4>{t("settings.language")}</h4>
            <div className="seg">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  className={"seg__btn" + (lang === l.code ? " seg__btn--on" : "")}
                  onClick={() => setLang(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings__group">
            <h4>{t("settings.signing")}</h4>
            <label className="sign-check">
              <input
                type="checkbox"
                checked={signEnabled}
                onChange={(e) => setSignEnabled(e.target.checked)}
              />
              {t("settings.sign.enable")}
            </label>
            <div className="settings__row">
              <span className="sign-label">{t("settings.sign.format")}</span>
              <select
                className="sign-select"
                value={signFormat}
                onChange={(e) => setSignFormat(e.target.value)}
              >
                <option value="openpgp">GPG (openpgp)</option>
                <option value="ssh">SSH</option>
              </select>
            </div>
            <input
              className="new-branch__input settings__input"
              {...inputProps}
              placeholder={signFormat === "ssh" ? t("settings.sign.keySsh") : t("settings.sign.keyGpg")}
              value={signKey}
              onChange={(e) => setSignKey(e.target.value)}
            />
            <button
              className="tbtn tbtn--primary"
              disabled={!!busy}
              onClick={() => saveSigning(signEnabled, signFormat, signKey.trim())}
            >
              {t("settings.sign.save")}
            </button>
          </section>

          <section className="settings__group">
            <h4>{t("settings.profiles")}</h4>
            <button
              className="tbtn"
              onClick={() => {
                setSettings(false);
                setProfilesOpen(true);
              }}
            >
              {t("settings.profiles.open")}
            </button>
          </section>

          <section className="settings__group">
            <h4>{t("settings.shortcuts")}</h4>
            <button
              className="tbtn"
              onClick={() => {
                setSettings(false);
                setShortcuts(true);
              }}
            >
              {t("settings.shortcuts.open")}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
