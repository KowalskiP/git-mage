import { useState } from "react";
import { useRepos } from "../store/repos";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

// Shape-distinct glyphs so status isn't conveyed by colour alone (a11y).
const SM_GLYPH: Record<string, string> = {
  ok: "✓",
  modified: "±",
  uninitialized: "○",
  conflict: "⚠",
};

/**
 * Consolidated "Repo ▾" menu (UX): folds the former Stashes / Worktrees /
 * Submodules / LFS / Gitflow toolbar dropdowns into one accordion so the
 * toolbar stays uncluttered. Each section's body is the same content as before.
 */
export function RepoMenu() {
  const busy = useRepos((s) => s.busy);
  const stashes = useRepos((s) => s.stashes);
  const stashApply = useRepos((s) => s.stashApply);
  const stashPop = useRepos((s) => s.stashPop);
  const stashDrop = useRepos((s) => s.stashDrop);
  const worktrees = useRepos((s) => s.worktrees);
  const addWorktree = useRepos((s) => s.addWorktree);
  const removeWorktree = useRepos((s) => s.removeWorktree);
  const submodules = useRepos((s) => s.submodules);
  const updateSubmodule = useRepos((s) => s.updateSubmodule);
  const syncSubmodules = useRepos((s) => s.syncSubmodules);
  const lfs = useRepos((s) => s.lfs);
  const lfsPull = useRepos((s) => s.lfsPull);
  const lfsTrack = useRepos((s) => s.lfsTrack);
  const lfsLock = useRepos((s) => s.lfsLock);
  const gitflow = useRepos((s) => s.gitflow);
  const gitflowInit = useRepos((s) => s.gitflowInit);
  const gitflowStart = useRepos((s) => s.gitflowStart);
  const gitflowFinish = useRepos((s) => s.gitflowFinish);

  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [wtName, setWtName] = useState("");
  const [lfsPattern, setLfsPattern] = useState("");
  const [flowKind, setFlowKind] = useState("feature");
  const [flowName, setFlowName] = useState("");

  const toggle = (s: string) => setSection((cur) => (cur === s ? null : s));

  async function createWorktree() {
    const n = wtName.trim();
    if (!n) return;
    setWtName("");
    await addWorktree(n, true);
  }
  async function trackPattern() {
    const p = lfsPattern.trim();
    if (!p) return;
    setLfsPattern("");
    await lfsTrack(p);
  }
  async function startFlow() {
    const n = flowName.trim();
    if (!n) return;
    setFlowName("");
    await gitflowStart(flowKind, n);
  }

  const sections: { key: string; label: string; count?: number; show: boolean }[] = [
    { key: "stashes", label: "Stashes", count: stashes.length, show: true },
    { key: "worktrees", label: "Worktrees", count: worktrees.length, show: true },
    { key: "submodules", label: "Submodules", count: submodules.length, show: submodules.length > 0 },
    { key: "lfs", label: "LFS", count: lfs?.files.length, show: !!lfs?.used },
    { key: "gitflow", label: "Gitflow", show: true },
  ].filter((s) => s.show);

  return (
    <div className="branch-picker">
      <button className="tbtn" onClick={() => setOpen((o) => !o)} disabled={!!busy}>
        Repo ▾
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <ul className="dropdown dropdown--wide repo-menu">
            {sections.map((s) => (
              <li key={s.key} className="repo-sec">
                <button className="repo-sec__head" onClick={() => toggle(s.key)}>
                  <span className="repo-sec__caret">{section === s.key ? "▾" : "▸"}</span>
                  <span className="repo-sec__label">{s.label}</span>
                  {s.count !== undefined && s.count > 0 && (
                    <span className="repo-sec__count">{s.count}</span>
                  )}
                </button>
                {section === s.key && <div className="repo-sec__body">{renderBody(s.key)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  function renderBody(key: string) {
    if (key === "stashes") {
      if (stashes.length === 0) return <div className="dropdown__empty">No stashes</div>;
      return stashes.map((s) => (
        <div key={s.id} className="stash-row">
          <span className="stash-msg" title={s.message}>
            {s.message}
          </span>
          <span className="stash-actions">
            <button className="link-btn" onClick={() => stashApply(s.id)}>
              Apply
            </button>
            <button className="link-btn" onClick={() => stashPop(s.id)}>
              Pop
            </button>
            <button className="link-btn link-btn--danger" onClick={() => stashDrop(s.id)}>
              Drop
            </button>
          </span>
        </div>
      ));
    }

    if (key === "worktrees") {
      return (
        <>
          <div className="wt-new">
            <input
              className="new-branch__input"
              {...inputProps}
              placeholder="new branch → worktree"
              value={wtName}
              onChange={(e) => setWtName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createWorktree();
              }}
            />
            <button className="tbtn tbtn--primary" onClick={createWorktree}>
              Create
            </button>
          </div>
          {worktrees.map((w) => (
            <div key={w.path} className="wt-row" title={w.path}>
              <span className="wt-branch">
                {w.branch ?? w.head.slice(0, 7)}
                {w.isMain && <span className="wt-tag">main</span>}
                {w.locked && <span className="wt-tag">🔒</span>}
              </span>
              {!w.isMain && (
                <span className="wt-actions">
                  <button
                    className="link-btn link-btn--danger"
                    onClick={() => removeWorktree(w.path, true)}
                    title="Remove worktree (keep branch)"
                  >
                    Remove
                  </button>
                  {w.branch && (
                    <button
                      className="link-btn link-btn--danger"
                      onClick={() => removeWorktree(w.path, true, w.branch!)}
                      title="Remove worktree and delete its branch"
                    >
                      +branch
                    </button>
                  )}
                </span>
              )}
            </div>
          ))}
        </>
      );
    }

    if (key === "submodules") {
      return (
        <>
          <div className="sm-head">
            <button className="link-btn" onClick={() => updateSubmodule(null, true)}>
              Update all
            </button>
            <button className="link-btn" onClick={() => syncSubmodules()}>
              Sync
            </button>
          </div>
          {submodules.map((sm) => (
            <div key={sm.path} className="sm-row" title={`${sm.status} · ${sm.sha} ${sm.describe}`}>
              <span className={"gmark gmark--" + sm.status}>{SM_GLYPH[sm.status] ?? "•"}</span>
              <span className="sm-path">{sm.path}</span>
              <span className="sm-desc">{sm.describe || sm.sha.slice(0, 7)}</span>
              <span className="sm-actions">
                <button
                  className="link-btn"
                  onClick={() => updateSubmodule(sm.path, sm.status === "uninitialized")}
                >
                  {sm.status === "uninitialized" ? "Init" : "Update"}
                </button>
              </span>
            </div>
          ))}
        </>
      );
    }

    if (key === "lfs" && lfs) {
      return (
        <>
          <div className="lfs-head">
            <span className="lfs-ver" title={lfs.version}>
              {lfs.version.split(" ")[0] || "git-lfs"}
            </span>
            <button className="link-btn" onClick={() => lfsPull()} title="git lfs pull">
              Pull
            </button>
          </div>
          <div className="lfs-track">
            <input
              className="new-branch__input"
              {...inputProps}
              placeholder="track pattern, e.g. *.psd"
              value={lfsPattern}
              onChange={(e) => setLfsPattern(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") trackPattern();
              }}
            />
            <button className="tbtn tbtn--primary" onClick={trackPattern}>
              Track
            </button>
          </div>
          {lfs.patterns.length > 0 && (
            <div className="lfs-patterns">
              {lfs.patterns.map((p) => (
                <span key={p} className="lfs-pat">
                  {p}
                </span>
              ))}
            </div>
          )}
          {lfs.files.length === 0 && <div className="dropdown__empty">No LFS files</div>}
          {lfs.files.map((f) => (
            <div
              key={f.path}
              className="lfs-row"
              title={(f.downloaded ? "downloaded" : "pointer only") + " · " + f.oid}
            >
              <span className={"gmark " + (f.downloaded ? "gmark--ok" : "gmark--pointer")}>
                {f.downloaded ? "●" : "○"}
              </span>
              <span className="lfs-path">{f.path}</span>
              {f.lockOwner && <span className="lfs-lock">🔒 {f.lockOwner}</span>}
              <span className="lfs-actions">
                <button className="link-btn" onClick={() => lfsLock(f.path, !f.lockOwner)}>
                  {f.lockOwner ? "Unlock" : "Lock"}
                </button>
              </span>
            </div>
          ))}
        </>
      );
    }

    if (key === "gitflow") {
      if (!gitflow?.initialized) {
        return (
          <div className="flow-init">
            <span className="flow-hint">
              No <code>develop</code> branch yet. Initialize gitflow to create it from{" "}
              <code>{gitflow?.main ?? "main"}</code>.
            </span>
            <button className="tbtn tbtn--primary" onClick={() => gitflowInit()}>
              Initialize
            </button>
          </div>
        );
      }
      return (
        <>
          <div className="flow-bases">
            <span className="ref ref--local">{gitflow.main}</span>
            <span className="ref ref--local">{gitflow.develop}</span>
          </div>
          {gitflow.currentKind && (
            <div className="flow-current">
              <span className="flow-hint">
                On {gitflow.currentKind} <b>{gitflow.currentName}</b>
              </span>
              <button
                className="tbtn tbtn--primary"
                onClick={() => gitflowFinish(gitflow.currentKind, gitflow.currentName)}
                title="Merge into target branch(es), tag release/hotfix, delete branch"
              >
                Finish
              </button>
            </div>
          )}
          <div className="flow-start">
            <select
              className="sign-select"
              value={flowKind}
              onChange={(e) => setFlowKind(e.target.value)}
            >
              <option value="feature">feature</option>
              <option value="release">release</option>
              <option value="hotfix">hotfix</option>
            </select>
            <input
              className="new-branch__input"
              {...inputProps}
              placeholder="name"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startFlow();
              }}
            />
            <button className="tbtn tbtn--primary" onClick={startFlow}>
              Start
            </button>
          </div>
        </>
      );
    }
    return null;
  }
}
