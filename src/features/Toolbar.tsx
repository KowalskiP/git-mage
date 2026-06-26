import { useState } from "react";
import { useRepos } from "../store/repos";
import { useT } from "../i18n/useT";
import { RepoMenu } from "./RepoMenu";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

export function Toolbar() {
  const t = useT();
  const status = useRepos((s) => s.status);
  const branches = useRepos((s) => s.branches);
  const busy = useRepos((s) => s.busy);
  const checkout = useRepos((s) => s.checkout);
  const createBranch = useRepos((s) => s.createBranch);
  const fetch = useRepos((s) => s.fetch);
  const pull = useRepos((s) => s.pull);
  const push = useRepos((s) => s.push);
  const stashSave = useRepos((s) => s.stashSave);
  const showTerminal = useRepos((s) => s.showTerminal);
  const toggleTerminal = useRepos((s) => s.toggleTerminal);
  const setPalette = useRepos((s) => s.setPalette);
  const setSettings = useRepos((s) => s.setSettings);
  const forge = useRepos((s) => s.forge);
  const toggleForge = useRepos((s) => s.toggleForge);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

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
            {...inputProps}
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

      <RepoMenu />

      <div className="toolbar__spacer" />

      {busy && <span className="toolbar__busy">{busy}</span>}

      <button className="tbtn" onClick={() => setPalette(true)} title="Command palette (⌘K)">
        ⌘K
      </button>

      <button className="tbtn" onClick={() => setSettings(true)} title={t("toolbar.settings")}>
        ⚙
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
