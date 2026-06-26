import { useState } from "react";
import { useRepos } from "../../store/repos";
import { openExternal } from "../../ipc/commands";

const PROVIDER_NAME: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
};

const TOKEN_HINT: Record<string, string> = {
  github: "Personal access token with the `repo` scope.",
  gitlab: "Personal access token with the `api` (or `read_api`) scope.",
  bitbucket: "Repository or workspace access token (used as a Bearer token).",
};

/**
 * Forge panel (SPEC §M6): connect a provider with a keychain-stored token and
 * browse open pull/merge requests and issues for the current repo.
 */
export function ForgePanel() {
  const show = useRepos((s) => s.showForge);
  const toggleForge = useRepos((s) => s.toggleForge);
  const forge = useRepos((s) => s.forge);
  const pulls = useRepos((s) => s.pulls);
  const issues = useRepos((s) => s.issues);
  const loading = useRepos((s) => s.forgeLoading);
  const busy = useRepos((s) => s.busy);
  const error = useRepos((s) => s.error);
  const setForgeToken = useRepos((s) => s.setForgeToken);
  const clearForgeToken = useRepos((s) => s.clearForgeToken);
  const loadPulls = useRepos((s) => s.loadPulls);
  const loadIssues = useRepos((s) => s.loadIssues);

  const [tab, setTab] = useState<"pulls" | "issues">("pulls");
  const [token, setToken] = useState("");

  if (!show) return null;

  const provider = forge?.provider ?? "";
  const name = PROVIDER_NAME[provider] ?? "";

  const refresh = () => (tab === "pulls" ? loadPulls() : loadIssues());

  const body = () => {
    if (!provider) {
      return (
        <div className="forge-empty">
          No supported forge remote for this repo.
          {forge?.host ? ` (remote host: ${forge.host})` : ""}
          <div className="forge-hint">GitMage detects GitHub, GitLab and Bitbucket remotes.</div>
        </div>
      );
    }
    if (!forge?.hasToken) {
      return (
        <div className="forge-connect">
          <div className="forge-hint">{TOKEN_HINT[provider]}</div>
          <input
            className="new-branch__input"
            type="password"
            placeholder={`${name} access token`}
            value={token}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && token.trim()) {
                setForgeToken(token.trim());
                setToken("");
              }
            }}
          />
          <button
            className="tbtn tbtn--primary"
            disabled={!token.trim() || !!busy}
            onClick={() => {
              setForgeToken(token.trim());
              setToken("");
            }}
          >
            Connect
          </button>
          <div className="forge-hint forge-hint--dim">
            The token is stored in your system keychain, never in the app database.
          </div>
        </div>
      );
    }

    const rows =
      tab === "pulls"
        ? pulls.map((p) => (
            <li key={p.number} className="forge-row" onClick={() => openExternal(p.url)}>
              <span className={"forge-state forge-state--" + (p.draft ? "draft" : p.state)}>
                {p.draft ? "draft" : p.state}
              </span>
              <span className="forge-num">#{p.number}</span>
              <span className="forge-title" title={p.title}>
                {p.title}
              </span>
              <span className="forge-meta">
                {p.author} · {p.source} → {p.target}
              </span>
            </li>
          ))
        : issues.map((it) => (
            <li key={it.number} className="forge-row" onClick={() => openExternal(it.url)}>
              <span className={"forge-state forge-state--" + it.state}>{it.state}</span>
              <span className="forge-num">#{it.number}</span>
              <span className="forge-title" title={it.title}>
                {it.title}
              </span>
              <span className="forge-meta">
                {it.author}
                {it.comments > 0 ? ` · 💬 ${it.comments}` : ""}
              </span>
            </li>
          ));

    const empty = tab === "pulls" ? pulls.length === 0 : issues.length === 0;

    return (
      <>
        <div className="forge-tabs">
          <button
            className={"seg__btn" + (tab === "pulls" ? " seg__btn--on" : "")}
            onClick={() => setTab("pulls")}
          >
            Pull requests {pulls.length > 0 ? pulls.length : ""}
          </button>
          <button
            className={"seg__btn" + (tab === "issues" ? " seg__btn--on" : "")}
            onClick={() => setTab("issues")}
          >
            Issues {issues.length > 0 ? issues.length : ""}
          </button>
          <div className="forge-tabs__spacer" />
          <button className="link-btn" onClick={refresh} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="link-btn link-btn--danger" onClick={() => clearForgeToken()}>
            Disconnect
          </button>
        </div>
        <ul className="forge-list">
          {loading && <li className="forge-empty">Loading…</li>}
          {!loading && empty && (
            <li className="forge-empty">No open {tab === "pulls" ? "pull requests" : "issues"}.</li>
          )}
          {!loading && rows}
        </ul>
      </>
    );
  };

  return (
    <div className="palette-backdrop" onClick={() => toggleForge(false)}>
      <div
        className="forge"
        role="dialog"
        aria-modal="true"
        aria-label="Pull requests & issues"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="forge-head">
          <span className="forge-title-bar">
            {name || "Forge"}
            {forge?.owner && (
              <span className="forge-repo">
                {" "}
                · {forge.owner}/{forge.repo}
              </span>
            )}
          </span>
          <button className="diff-close" onClick={() => toggleForge(false)} title="Close">
            ✕
          </button>
        </div>
        {error && <div className="forge-err">{error.split("\n")[0]}</div>}
        <div className="forge-body">{body()}</div>
      </div>
    </div>
  );
}
