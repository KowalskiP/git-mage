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

      <div className="toolbar__spacer" />

      {busy && <span className="toolbar__busy">{busy}</span>}
      {!busy && error && (
        <span className="toolbar__err" title={error}>
          {error.split("\n")[0]}
        </span>
      )}

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
