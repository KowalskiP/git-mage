import { useEffect, useState } from "react";
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
  const lfs = useRepos((s) => s.lfs);
  const lfsPull = useRepos((s) => s.lfsPull);
  const lfsTrack = useRepos((s) => s.lfsTrack);
  const lfsLock = useRepos((s) => s.lfsLock);
  const signing = useRepos((s) => s.signing);
  const saveSigning = useRepos((s) => s.saveSigning);
  const gitflow = useRepos((s) => s.gitflow);
  const gitflowInit = useRepos((s) => s.gitflowInit);
  const gitflowStart = useRepos((s) => s.gitflowStart);
  const gitflowFinish = useRepos((s) => s.gitflowFinish);
  const showTerminal = useRepos((s) => s.showTerminal);
  const toggleTerminal = useRepos((s) => s.toggleTerminal);
  const setPalette = useRepos((s) => s.setPalette);
  const setShortcuts = useRepos((s) => s.setShortcuts);
  const forge = useRepos((s) => s.forge);
  const toggleForge = useRepos((s) => s.toggleForge);

  const [open, setOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [smOpen, setSmOpen] = useState(false);
  const [lfsOpen, setLfsOpen] = useState(false);
  const [lfsPattern, setLfsPattern] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [signEnabled, setSignEnabled] = useState(false);
  const [signFormat, setSignFormat] = useState("openpgp");
  const [signKey, setSignKey] = useState("");
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowKind, setFlowKind] = useState("feature");
  const [flowName, setFlowName] = useState("");
  const [wtOpen, setWtOpen] = useState(false);
  const [wtName, setWtName] = useState("");

  async function startFlow() {
    const n = flowName.trim();
    if (!n) return;
    setFlowName("");
    setFlowOpen(false);
    await gitflowStart(flowKind, n);
  }

  // Seed the signing form from config whenever the dropdown opens.
  useEffect(() => {
    if (signOpen && signing) {
      setSignEnabled(signing.sign);
      setSignFormat(signing.format || "openpgp");
      setSignKey(signing.key);
    }
  }, [signOpen, signing]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  // Branch names, LFS patterns and signing keys are case/format-sensitive —
  // suppress the webview's auto-capitalize/correct so typed text is verbatim.
  const inputProps = {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
  } as const;

  async function createWorktree() {
    const n = wtName.trim();
    if (!n) return;
    setWtName("");
    setWtOpen(false);
    await addWorktree(n, true);
  }

  async function trackPattern() {
    const p = lfsPattern.trim();
    if (!p) return;
    setLfsPattern("");
    await lfsTrack(p);
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
            className="new-branch__input" {...inputProps}
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
                  className="new-branch__input" {...inputProps}
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

      {lfs?.used && (
        <div className="branch-picker">
          <button className="tbtn" onClick={() => setLfsOpen((o) => !o)} disabled={!!busy}>
            LFS {lfs.files.length} ▾
          </button>
          {lfsOpen && (
            <>
              <div className="dropdown-backdrop" onClick={() => setLfsOpen(false)} />
              <ul className="dropdown dropdown--wide">
                <li className="lfs-head">
                  <span className="lfs-ver" title={lfs.version}>
                    {lfs.version.split(" ")[0] || "git-lfs"}
                  </span>
                  <button className="link-btn" onClick={() => lfsPull()} title="git lfs pull">
                    Pull
                  </button>
                </li>
                <li className="lfs-track">
                  <input
                    className="new-branch__input" {...inputProps}
                    placeholder="track pattern, e.g. *.psd"
                    value={lfsPattern}
                    onChange={(e) => setLfsPattern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") trackPattern();
                      if (e.key === "Escape") setLfsOpen(false);
                    }}
                  />
                  <button className="tbtn tbtn--primary" onClick={trackPattern}>
                    Track
                  </button>
                </li>
                {lfs.patterns.length > 0 && (
                  <li className="lfs-patterns">
                    {lfs.patterns.map((p) => (
                      <span key={p} className="lfs-pat">
                        {p}
                      </span>
                    ))}
                  </li>
                )}
                {lfs.files.length === 0 && <li className="dropdown__empty">No LFS files</li>}
                {lfs.files.map((f) => (
                  <li key={f.path} className="lfs-row" title={f.oid}>
                    <span
                      className={"lfs-dot " + (f.downloaded ? "lfs-dot--ok" : "lfs-dot--pointer")}
                      title={f.downloaded ? "downloaded" : "pointer only (run Pull)"}
                    />
                    <span className="lfs-path">{f.path}</span>
                    {f.lockOwner && <span className="lfs-lock">🔒 {f.lockOwner}</span>}
                    <span className="lfs-actions">
                      <button
                        className="link-btn"
                        onClick={() => lfsLock(f.path, !f.lockOwner)}
                        title={f.lockOwner ? "git lfs unlock" : "git lfs lock"}
                      >
                        {f.lockOwner ? "Unlock" : "Lock"}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="branch-picker">
        <button
          className={"tbtn" + (signing?.sign ? " tbtn--on" : "")}
          onClick={() => setSignOpen((o) => !o)}
          disabled={!!busy}
          title="Commit signing"
        >
          {signing?.sign ? "Signing ✓" : "Sign"} ▾
        </button>
        {signOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setSignOpen(false)} />
            <ul className="dropdown dropdown--wide">
              <li className="sign-row">
                <label className="sign-check">
                  <input
                    type="checkbox"
                    checked={signEnabled}
                    onChange={(e) => setSignEnabled(e.target.checked)}
                  />
                  Sign commits by default
                </label>
              </li>
              <li className="sign-row">
                <span className="sign-label">Format</span>
                <select
                  className="sign-select"
                  value={signFormat}
                  onChange={(e) => setSignFormat(e.target.value)}
                >
                  <option value="openpgp">GPG (openpgp)</option>
                  <option value="ssh">SSH</option>
                </select>
              </li>
              <li className="sign-row">
                <input
                  className="new-branch__input" {...inputProps}
                  placeholder={signFormat === "ssh" ? "~/.ssh/id_ed25519.pub" : "GPG key id"}
                  value={signKey}
                  onChange={(e) => setSignKey(e.target.value)}
                />
              </li>
              <li className="sign-row sign-row--end">
                <button
                  className="tbtn tbtn--primary"
                  onClick={() => {
                    setSignOpen(false);
                    saveSigning(signEnabled, signFormat, signKey.trim());
                  }}
                >
                  Save
                </button>
              </li>
            </ul>
          </>
        )}
      </div>

      <div className="branch-picker">
        <button
          className={"tbtn" + (gitflow?.currentKind ? " tbtn--on" : "")}
          onClick={() => setFlowOpen((o) => !o)}
          disabled={!!busy}
          title="Gitflow"
        >
          Gitflow ▾
        </button>
        {flowOpen && (
          <>
            <div className="dropdown-backdrop" onClick={() => setFlowOpen(false)} />
            <ul className="dropdown dropdown--wide">
              {!gitflow?.initialized ? (
                <li className="flow-init">
                  <span className="flow-hint">
                    No <code>develop</code> branch yet. Initialize gitflow to create it from{" "}
                    <code>{gitflow?.main ?? "main"}</code>.
                  </span>
                  <button className="tbtn tbtn--primary" onClick={() => gitflowInit()}>
                    Initialize
                  </button>
                </li>
              ) : (
                <>
                  <li className="flow-bases">
                    <span className="ref ref--local">{gitflow.main}</span>
                    <span className="ref ref--local">{gitflow.develop}</span>
                  </li>
                  {gitflow.currentKind && (
                    <li className="flow-current">
                      <span className="flow-hint">
                        On {gitflow.currentKind} <b>{gitflow.currentName}</b>
                      </span>
                      <button
                        className="tbtn tbtn--primary"
                        onClick={() => {
                          setFlowOpen(false);
                          gitflowFinish(gitflow.currentKind, gitflow.currentName);
                        }}
                        title="Merge into target branch(es), tag release/hotfix, delete branch"
                      >
                        Finish
                      </button>
                    </li>
                  )}
                  <li className="flow-start">
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
                      className="new-branch__input" {...inputProps}
                      placeholder="name"
                      value={flowName}
                      onChange={(e) => setFlowName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") startFlow();
                        if (e.key === "Escape") setFlowOpen(false);
                      }}
                    />
                    <button className="tbtn tbtn--primary" onClick={startFlow}>
                      Start
                    </button>
                  </li>
                </>
              )}
            </ul>
          </>
        )}
      </div>

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
        className="tbtn"
        onClick={() => setShortcuts(true)}
        title="Keyboard shortcuts (⌘/)"
      >
        ⌘/
      </button>

      {forge?.provider && (
        <button
          className={"tbtn" + (forge.hasToken ? " tbtn--on" : "")}
          onClick={() => toggleForge(true)}
          title={`Pull requests & issues (${forge.provider})`}
        >
          PRs
        </button>
      )}

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
