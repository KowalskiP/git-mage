import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "../../store/repos";
import { AgentsPanel } from "../agents/AgentsPanel";
import { useT } from "../../i18n/useT";
import type { RepoMeta } from "../../types/git";

/** Shortened path for the repo subtitle: last two segments. */
function shortPath(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts.length <= 2 ? path : "…/" + parts.slice(-2).join("/");
}

export function RepoSidebar() {
  const { repos, selected, openRepo, select, remove, toggleFavorite, loading } = useRepos();
  const t = useT();
  const [nav, setNav] = useState<"repos" | "agents">("repos");
  const [query, setQuery] = useState("");

  async function pickRepo() {
    const dir = await open({ directory: true, multiple: false, title: t("sidebar.openRepo") });
    if (typeof dir === "string") await openRepo(dir);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (r: RepoMeta) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      (r.alias ?? "").toLowerCase().includes(q) ||
      r.path.toLowerCase().includes(q);
    const list = repos.filter(match);
    const byRecent = (a: RepoMeta, b: RepoMeta) => b.lastOpened - a.lastOpened;
    return {
      favorites: list.filter((r) => r.favorite).sort(byRecent),
      recent: list.filter((r) => !r.favorite).sort(byRecent),
    };
  }, [repos, query]);

  const row = (repo: RepoMeta) => (
    <li
      key={repo.id}
      className={"repo-item" + (selected?.id === repo.id ? " repo-item--active" : "")}
      onClick={() => select(repo)}
    >
      <button
        className="star"
        title={repo.favorite ? t("sidebar.unfavorite") : t("sidebar.favorite")}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(repo);
        }}
      >
        {repo.favorite ? "★" : "☆"}
      </button>
      <span className="repo-item__main">
        <span className="repo-item__name">{repo.alias ?? repo.name}</span>
        <span className="repo-item__path" title={repo.path}>
          {shortPath(repo.path)}
        </span>
      </span>
      <button
        className="remove"
        title={t("sidebar.remove")}
        onClick={(e) => {
          e.stopPropagation();
          remove(repo.id);
        }}
      >
        ✕
      </button>
    </li>
  );

  const nothing = filtered.favorites.length === 0 && filtered.recent.length === 0;

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="brand">GitMage</span>
        <button className="btn" onClick={pickRepo} disabled={loading}>
          {loading ? "…" : t("sidebar.open")}
        </button>
      </div>

      <div className="sidebar-nav">
        <button
          className={"navbtn" + (nav === "repos" ? " navbtn--on" : "")}
          onClick={() => setNav("repos")}
        >
          {t("sidebar.repos")}
        </button>
        <button
          className={"navbtn" + (nav === "agents" ? " navbtn--on" : "")}
          onClick={() => setNav("agents")}
        >
          {t("sidebar.agents")}
        </button>
      </div>

      {nav === "agents" ? (
        <AgentsPanel />
      ) : (
        <>
          {repos.length > 0 && (
            <input
              className="repo-search"
              placeholder={t("sidebar.search")}
              value={query}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          <ul className="repo-list">
            {repos.length === 0 && <li className="repo-list__empty">{t("sidebar.noRepos")}</li>}
            {repos.length > 0 && nothing && (
              <li className="repo-list__empty">{t("sidebar.noMatch")}</li>
            )}
            {filtered.favorites.length > 0 && (
              <li className="repo-group">{t("sidebar.favorites")}</li>
            )}
            {filtered.favorites.map(row)}
            {filtered.recent.length > 0 && filtered.favorites.length > 0 && (
              <li className="repo-group">{t("sidebar.recent")}</li>
            )}
            {filtered.recent.map(row)}
          </ul>
        </>
      )}
    </aside>
  );
}
