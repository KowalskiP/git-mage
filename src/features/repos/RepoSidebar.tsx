import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "../../store/repos";
import { AgentsPanel } from "../agents/AgentsPanel";

export function RepoSidebar() {
  const { repos, selected, openRepo, select, remove, toggleFavorite, loading } = useRepos();
  const [nav, setNav] = useState<"repos" | "agents">("repos");

  async function pickRepo() {
    const dir = await open({ directory: true, multiple: false, title: "Open repository" });
    if (typeof dir === "string") await openRepo(dir);
  }

  const sorted = [...repos].sort(
    (a, b) => Number(b.favorite) - Number(a.favorite) || b.lastOpened - a.lastOpened,
  );

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <span className="brand">GitMage</span>
        <button className="btn" onClick={pickRepo} disabled={loading}>
          {loading ? "…" : "Open"}
        </button>
      </div>

      <div className="sidebar-nav">
        <button
          className={"navbtn" + (nav === "repos" ? " navbtn--on" : "")}
          onClick={() => setNav("repos")}
        >
          Repos
        </button>
        <button
          className={"navbtn" + (nav === "agents" ? " navbtn--on" : "")}
          onClick={() => setNav("agents")}
        >
          Agents
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
              title={repo.favorite ? "Unfavorite" : "Favorite"}
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
              title="Remove from list"
              onClick={(e) => {
                e.stopPropagation();
                remove(repo.id);
              }}
            >
              ✕
            </button>
          </li>
        ))}
          {repos.length === 0 && <li className="repo-list__empty">No repositories yet.</li>}
        </ul>
      )}
    </aside>
  );
}
