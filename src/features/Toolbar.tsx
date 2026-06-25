import { useState } from "react";
import { useRepos } from "../store/repos";

export function Toolbar() {
  const status = useRepos((s) => s.status);
  const branches = useRepos((s) => s.branches);
  const busy = useRepos((s) => s.busy);
  const error = useRepos((s) => s.error);
  const checkout = useRepos((s) => s.checkout);
  const createBranch = useRepos((s) => s.createBranch);
  const fetch = useRepos((s) => s.fetch);
  const pull = useRepos((s) => s.pull);
  const push = useRepos((s) => s.push);
  const stashes = useRepos((s) => s.stashes);
  const stashSave = useRepos((s) => s.stashSave);
  const stashApply = useRepos((s) => s.stashApply);
  const stashPop = useRepos((s) => s.stashPop);
  const stashDrop = useRepos((s) => s.stashDrop);
  const worktrees = useRepos((s) => s.worktrees);
  const addWorktree = useRepos((s) => s.addWorktree);
  const removeWorktree = useRepos((s) => s.removeWorktree);
  const submodules = useRepos((s) => s.submodules);
  const updateSubmodule = useRepos((s) => s.updateSubmodule);
  const syncSubmodules = useRepos((s) => s.syncSubmodules);
  const showTerminal = useRepos((s) => s.showTerminal);
  const toggleTerminal = useRepos((s) => s.toggleTerminal);
  const setPalette = useRepos((s) => s.setPalette);

  const [open, setOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [smOpen, setSmOpen] = useState(false);
  const [wtOpen, setWtOpen] = useState(false);
  const [wtName, setWtName] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  async function createWorktree() {
    const n = wtName.trim();
    if (!n) return;
    setWtName("");
    setWtOpen(false);
    await addWorktree(n, true);
  }

  const current = status?.branch ?? "—";

  async function doCreate() {
    const n = name.trim();
    if (!n) return;
    setCreating(false);
    setName("");
    await createBranch(n, true);
  }

  return (
    <div className="toolbar">
      <div className="branch-picker">
        <button className="branch-btn" onClick={() => setOpen((o) => !o)} disabled={!!busy}>
          <span className="branch-name">{current}</span>
          <span className="caret">▾</span>
        </button>
        {open && (
          <>
            <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
            <ul className="dropdown">
              {branches.length === 0 && <li className="dropdown__empty">No branches</li>}
              {branches.map((b) => (
                <li
                  key={b}
                  className={"dropdown__item" + (b === current ? " dropdown__item--on" : "")}
                  onClick={() => {
                    setOpen(false);
                    if (b !== current) checkout(b);
                  }}
                >
                  {b}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {creating ? (
        <div className="new-branch">
          <input
            autoFocus
            className="new-branch__input"
            placeholder="new branch name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") doCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setName("");
              }
            }}
          />
          <button className="tbtn tbtn--primary" onClick={doCreate}>
            Create
          </button>
          <button
            className="link-btn"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button className="tbtn" onClick={() => setCreating(true)} disabled={!!busy}>
          + Branch
        </button>
      )}

      <button className="tbtn" onClick={() => stashSave(null, false)} disabled={!!busy}>
        Stash
      </button>

      <div className="branch-picker">
        <button
          className="tbtn"
          onClick={() => setStashOpen((o) => !o)}
          disabled={!!busy || stashes.length === 0}
        >
          Stashes{stashes.length > 0 ? ` ${stashes.length}` : ""} ▾
        </button>
        {stashOpen && stashes.length > 0 && (
          <>
            <div className="dropdown-backdrop" onClick={() => setStashOpen(false)} />
            <ul className="dropdown dropdown--wide">
              {stashes.map((s) => (
                <li key={s.id} className="stash-row">
                  <span className="stash-msg" title={s.message}>
                    {s.message}
                  </span>
                  <span className="stash-actions">
                    <button className="link-btn" onClick={() => stashApply(s.id)}>
                      Apply
                    </button>
                    <button
                      className="link-btn"
                      onClick={() => {
                        setStashOpen(false);
                        stashPop(s.id);
                      }}
                    >
                      Pop
                    </button>
                    <button
                      className="link-btn link-btn--danger"
                      onClick={() => stashDrop(s.id)}
                    >
                      Drop
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="branch-picker">
        <button className="tbtn" onClick={() => setWtOpen((o) => !o)} disabled={!!busy}>
          Worktrees {worktrees.length} ▾
        </button>
        {wtOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setWtOpen(false)} />
            <ul className="dropdown dropdown--wide">
              <li className="wt-new">
                <input
                  autoFocus
                  className="new-branch__input"
                  placeholder="new branch → worktree"
                  value={wtName}
                  onChange={(e) => setWtName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createWorktree();
                    if (e.key === "Escape") setWtOpen(false);
                  }}
                />
                <button className="tbtn tbtn--primary" onClick={createWorktree}>
                  Create
                </button>
              </li>
              {worktrees.map((w) => (
                <li key={w.path} className="wt-row" title={w.path}>
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
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {submodules.length > 0 && (
        <div className="branch-picker">
          <button className="tbtn" onClick={() => setSmOpen((o) => !o)} disabled={!!busy}>
            Submodules {submodules.length} ▾
          </button>
          {smOpen && (
            <>
              <div className="dropdown-backdrop" onClick={() => setSmOpen(false)} />
              <ul className="dropdown dropdown--wide">
                <li className="sm-head">
                  <button
                    className="link-btn"
                    onClick={() => updateSubmodule(null, true)}
                    title="git submodule update --init (all)"
                  >
                    Update all
                  </button>
                  <button
                    className="link-btn"
                    onClick={() => syncSubmodules()}
                    title="git submodule sync (refresh remote URLs)"
                  >
                    Sync
                  </button>
                </li>
                {submodules.map((sm) => (
                  <li key={sm.path} className="sm-row" title={`${sm.sha} ${sm.describe}`}>
                    <span className={"sm-dot sm-dot--" + sm.status} />
                    <span className="sm-path">{sm.path}</span>
                    <span className="sm-desc">{sm.describe || sm.sha.slice(0, 7)}</span>
                    <span className="sm-actions">
                      <button
                        className="link-btn"
                        onClick={() => updateSubmodule(sm.path, sm.status === "uninitialized")}
                        title={
                          sm.status === "uninitialized"
                            ? "git submodule update --init <path>"
                            : "git submodule update <path>"
                        }
                      >
                        {sm.status === "uninitialized" ? "Init" : "Update"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="toolbar__spacer" />

      {busy && <span className="toolbar__busy">{busy}</span>}
      {!busy && error && (
        <span className="toolbar__err" title={error}>
          {error.split("\n")[0]}
        </span>
      )}

      <button
        className="tbtn"
        onClick={() => setPalette(true)}
        title="Command palette (⌘K)"
      >
        ⌘K
      </button>

      <button
        className={"tbtn" + (showTerminal ? " tbtn--on" : "")}
        onClick={toggleTerminal}
        title="Toggle embedded terminal"
      >
        Terminal
      </button>

      <button className="tbtn" onClick={() => fetch()} disabled={!!busy}>
        Fetch
      </button>
      <button className="tbtn" onClick={() => pull()} disabled={!!busy}>
        Pull{status && status.behind > 0 ? ` ${status.behind}` : ""}
      </button>
      <button className="tbtn" onClick={() => push()} disabled={!!busy}>
        Push{status && status.ahead > 0 ? ` ${status.ahead}` : ""}
      </button>
    </div>
  );
}
