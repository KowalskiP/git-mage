import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "../../store/repos";
import { AgentsPanel } from "../agents/AgentsPanel";
import { useT } from "../../i18n/useT";
import { LANGS } from "../../i18n/dict";

export function RepoSidebar() {
  const { repos, selected, openRepo, select, remove, toggleFavorite, loading } = useRepos();
  const lang = useRepos((s) => s.lang);
  const setLang = useRepos((s) => s.setLang);
  const t = useT();
  const [nav, setNav] = useState<"repos" | "agents">("repos");

  async function pickRepo() {
    const dir = await open({ directory: true, multiple: false, title: t("sidebar.openRepo") });
    if (typeof dir === "string") await openRepo(dir);
  }

  const sorted = [...repos].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpened - a.lastOpened,
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="brand">GitMage</span>
        <div className="lang-switch" title={t("lang.label")}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={"lang-btn" + (lang === l.code ? " lang-btn--on" : "")}
              onClick={() => setLang(l.code)}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
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
        <ul className="repo-list">
        {sorted.map((repo) => (
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
            <span className="repo-item__name">{repo.alias ?? repo.name}</span>
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
        ))}
          {repos.length === 0 && <li className="repo-list__empty">{t("sidebar.noRepos")}</li>}
        </ul>
      )}
    </aside>
  );
}
