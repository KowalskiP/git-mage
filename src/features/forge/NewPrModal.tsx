import { useState } from "react";
import { useRepos } from "../../store/repos";
import { useT } from "../../i18n/useT";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/** Create a pull/merge request from the current branch (File-menu-free flow). */
export function NewPrModal() {
  const t = useT();
  const prOpen = useRepos((s) => s.prOpen);
  const setPrOpen = useRepos((s) => s.setPrOpen);
  const createPull = useRepos((s) => s.createPull);
  const busy = useRepos((s) => s.busy);
  const currentBranch = useRepos((s) => s.status?.branch ?? "");

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("main");
  const [body, setBody] = useState("");

  // Seed source from the checked-out branch each time the modal opens.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (prOpen && seededFor !== currentBranch) {
    setSeededFor(currentBranch);
    setSource(currentBranch);
    if (!title) setTitle(currentBranch);
  }

  if (!prOpen) return null;

  const canCreate = !!title.trim() && !!source.trim() && !!target.trim() && !busy;
  const submit = () => canCreate && createPull(title.trim(), body, source.trim(), target.trim());

  return (
    <div className="modal-backdrop" onClick={() => setPrOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{t("pr.title")}</h3>
        <input
          className="modal-input"
          autoFocus
          placeholder={t("pr.titlePh")}
          value={title}
          {...inputProps}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="pr-branches">
          <input
            className="modal-input"
            placeholder={t("pr.source")}
            value={source}
            {...inputProps}
            onChange={(e) => setSource(e.target.value)}
          />
          <span className="pr-arrow">→</span>
          <input
            className="modal-input"
            placeholder={t("pr.target")}
            value={target}
            {...inputProps}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <textarea
          className="commit-msg pr-body"
          placeholder={t("pr.desc")}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="modal-actions">
          <button className="tbtn" onClick={() => setPrOpen(false)}>
            {t("common.cancel")}
          </button>
          <button className="tbtn tbtn--primary" disabled={!canCreate} onClick={submit}>
            {busy ? t("common.loading") : t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
