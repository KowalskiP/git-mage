import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "../store/repos";
import { useT } from "../i18n/useT";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/** Derive the repo folder name from a clone URL (strip trailing slash + .git). */
export function nameFromUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const seg = u.split(/[/:]/).pop() ?? "";
  return seg;
}

/** Clone dialog opened from File ▸ Clone… (native menu). */
export function CloneModal() {
  const t = useT();
  const cloneOpen = useRepos((s) => s.cloneOpen);
  const setClone = useRepos((s) => s.setClone);
  const cloneRepo = useRepos((s) => s.cloneRepo);
  const busy = useRepos((s) => s.busy);
  const [url, setUrl] = useState("");
  const [parent, setParent] = useState("");

  if (!cloneOpen) return null;

  const name = nameFromUrl(url);
  const target = parent && name ? `${parent}/${name}` : "";
  const canClone = !!url.trim() && !!target && !busy;

  async function pickParent() {
    const dir = await open({ directory: true, multiple: false, title: "Choose parent folder" });
    if (typeof dir === "string") setParent(dir);
  }

  return (
    <div className="modal-backdrop" onClick={() => setClone(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t("clone.title")}</h3>
        <input
          className="modal-input"
          autoFocus
          placeholder={t("clone.url")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canClone) cloneRepo(url.trim(), target);
            if (e.key === "Escape") setClone(false);
          }}
          {...inputProps}
        />
        <div className="clone-dest">
          <button className="tbtn" onClick={pickParent}>
            {t("clone.choose")}
          </button>
          <span className="clone-dest__path" title={target || undefined}>
            {target || t("clone.noFolder")}
          </span>
        </div>
        <div className="modal-actions">
          <button className="tbtn" onClick={() => setClone(false)}>
            {t("common.cancel")}
          </button>
          <button
            className="tbtn tbtn--primary"
            disabled={!canClone}
            onClick={() => cloneRepo(url.trim(), target)}
          >
            {busy ? "Cloning…" : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
}
