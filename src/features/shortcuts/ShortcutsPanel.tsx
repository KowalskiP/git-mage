import { useEffect, useMemo, useRef, useState } from "react";
import { useRepos } from "../../store/repos";
import {
  effectiveBindings,
  eventBinding,
  formatBinding,
  KEYMAP_ACTIONS,
  type KeymapAction,
} from "../../lib/keymap";
import { useT } from "../../i18n/useT";

/**
 * Keyboard-shortcuts reference + editor (SPEC §M5). Lists every bindable action
 * grouped by area, shows its current chord, and lets the user rebind by pressing
 * keys (Backspace clears, Esc cancels). Overrides persist via the store.
 */
export function ShortcutsPanel() {
  const t = useT();
  const open = useRepos((s) => s.shortcutsOpen);
  const setShortcuts = useRepos((s) => s.setShortcuts);
  const keymap = useRepos((s) => s.keymap);
  const setBinding = useRepos((s) => s.setBinding);
  const resetBinding = useRepos((s) => s.resetBinding);
  const resetAll = useRepos((s) => s.resetAllBindings);

  const [capturing, setCapturing] = useState<string | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);

  // Localize an action/group name, falling back to the registry's English text
  // if a locale hasn't got a key for it yet (translate() echoes unknown keys).
  const tr = (key: string, fallback: string) => {
    const s = t(key);
    return s === key ? fallback : s;
  };

  const eff = useMemo(() => effectiveBindings(keymap), [keymap]);
  const groups = useMemo(() => {
    const m = new Map<string, KeymapAction[]>();
    for (const a of KEYMAP_ACTIONS) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return [...m.entries()];
  }, []);

  useEffect(() => {
    if (!open) setCapturing(null);
  }, [open]);

  useEffect(() => {
    if (capturing) captureRef.current?.focus();
  }, [capturing]);

  if (!open) return null;

  const onCapture = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!capturing) return;
    if (e.key === "Escape") {
      setCapturing(null);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      void setBinding(capturing, ""); // unbind
      setCapturing(null);
      return;
    }
    const chord = eventBinding(e.nativeEvent);
    if (!chord) return; // modifier-only — keep waiting
    void setBinding(capturing, chord);
    setCapturing(null);
  };

  return (
    <div className="palette-backdrop" onClick={() => setShortcuts(false)}>
      <div
        className="shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts__head">
          <span className="shortcuts__title">{t("settings.shortcuts")}</span>
          <div className="shortcuts__head-actions">
            <button className="link-btn" onClick={() => resetAll()}>
              {t("shortcuts.resetAll")}
            </button>
            <button className="diff-close" onClick={() => setShortcuts(false)} title="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="shortcuts__body">
          {groups.map(([group, actions]) => (
            <section key={group} className="shortcuts__group">
              <h4>{tr(`keymap.group.${group.toLowerCase()}`, group)}</h4>
              {actions.map((a) => {
                const overridden = a.id in keymap;
                return (
                  <div key={a.id} className="shortcut-row">
                    <span className="shortcut-label">{tr(`keymap.action.${a.id}`, a.label)}</span>
                    {overridden && (
                      <button
                        className="link-btn shortcut-reset"
                        title="Reset to default"
                        onClick={() => resetBinding(a.id)}
                      >
                        {t("shortcuts.reset")}
                      </button>
                    )}
                    {capturing === a.id ? (
                      <div
                        ref={captureRef}
                        className="shortcut-capture"
                        tabIndex={0}
                        data-capturing="true"
                        onKeyDown={onCapture}
                        onBlur={() => setCapturing(null)}
                      >
                        {t("shortcuts.capture")}
                      </div>
                    ) : (
                      <button
                        className="shortcut-chord"
                        title="Click to rebind"
                        onClick={() => setCapturing(a.id)}
                      >
                        <kbd>{formatBinding(eff[a.id])}</kbd>
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
