import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import { useT } from "../../i18n/useT";
import { LANGS } from "../../i18n/dict";

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
  const busy = useRepos((s) => s.busy);

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
