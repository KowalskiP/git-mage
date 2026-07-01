import { useEffect, useMemo, useRef, useState } from "react";
import { useRepos } from "../../store/repos";
import { useT } from "../../i18n/useT";
import { fuzzyScore } from "../../lib/fuzzy";

interface Cmd {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

/**
 * Fuzzy command palette (SPEC §M5). Opened with ⌘K / ⌘P; surfaces repo
 * actions, branch checkouts, stashes, submodule ops and repo switching in one
 * keyboard-driven list.
 */
export function CommandPalette() {
  const t = useT();
  const open = useRepos((s) => s.paletteOpen);
  const setPalette = useRepos((s) => s.setPalette);

  const selected = useRepos((s) => s.selected);
  const repos = useRepos((s) => s.repos);
  const branches = useRepos((s) => s.branches);
  const stashes = useRepos((s) => s.stashes);
  const submodules = useRepos((s) => s.submodules);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Build the command set from current state. Store actions are stable, so we
  // read them lazily via getState() inside each handler.
  const commands = useMemo<Cmd[]>(() => {
    const s = useRepos.getState();
    const close = () => setPalette(false);
    const wrap = (fn: () => void) => () => {
      close();
      fn();
    };
    const cmds: Cmd[] = [
      {
        id: "shortcuts",
        title: "Keyboard shortcuts",
        hint: "help",
        run: wrap(() => s.setShortcuts(true)),
      },
    ];

    if (selected) {
      const repo = selected.name;
      cmds.push(
        { id: "fetch", title: "Fetch", hint: repo, run: wrap(() => s.fetch()) },
        { id: "pull", title: "Pull", hint: repo, run: wrap(() => s.pull()) },
        { id: "push", title: "Push", hint: repo, run: wrap(() => s.push()) },
        { id: "stash", title: "Stash changes", hint: repo, run: wrap(() => s.stashSave(null, false)) },
        { id: "undo", title: "Undo last action", hint: "commit / checkout", run: wrap(() => s.undo()) },
        { id: "stage-all", title: "Stage all", hint: repo, run: wrap(() => s.stageAll()) },
        { id: "unstage-all", title: "Unstage all", hint: repo, run: wrap(() => s.unstageAll()) },
        {
          id: "toggle-term",
          title: s.showTerminal ? "Hide terminal" : "Show terminal",
          hint: "view",
          run: wrap(() => s.toggleTerminal()),
        },
        {
          id: "refresh",
          title: "Refresh",
          hint: repo,
          run: wrap(() => {
            s.refreshStatus();
            s.loadGraph();
          }),
        },
      );

      if (submodules.length > 0) {
        cmds.push(
          {
            id: "sub-update-all",
            title: "Submodules: update all",
            hint: "submodule",
            run: wrap(() => s.updateSubmodule(null, true)),
          },
          {
            id: "sub-sync",
            title: "Submodules: sync",
            hint: "submodule",
            run: wrap(() => s.syncSubmodules()),
          },
        );
      }

      const current = s.status?.branch ?? null;
      for (const b of branches) {
        if (b === current) continue;
        cmds.push({
          id: `checkout:${b}`,
          title: `Checkout ${b}`,
          hint: "branch",
          run: wrap(() => s.checkout(b)),
        });
      }

      for (const st of stashes) {
        cmds.push({
          id: `stash-apply:${st.id}`,
          title: `Apply stash — ${st.message}`,
          hint: st.id,
          run: wrap(() => s.stashApply(st.id)),
        });
      }
    }

    for (const r of repos) {
      if (selected && r.path === selected.path) continue;
      cmds.push({
        id: `open:${r.path}`,
        title: `Open repo: ${r.alias ?? r.name}`,
        hint: "repo",
        run: wrap(() => s.select(r)),
      });
    }

    return cmds;
  }, [selected, repos, branches, stashes, submodules, setPalette]);

  const results = useMemo(() => {
    return commands
      .map((c) => ({ c, score: fuzzyScore(query, c.title + " " + (c.hint ?? "")) }))
      .filter((r): r is { c: Cmd; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((r) => r.c);
  }, [commands, query]);

  // Reset on open/close and when the query changes.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Keep the active row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setPalette(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  };

  return (
    <div className="palette-backdrop" onClick={() => setPalette(false)}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <ul className="palette__list" ref={listRef}>
          {results.length === 0 && <li className="palette__empty">{t("palette.empty")}</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              className={"palette__item" + (i === active ? " palette__item--on" : "")}
              onMouseMove={() => setActive(i)}
              onClick={() => c.run()}
            >
              <span className="palette__title">{c.title}</span>
              {c.hint && <span className="palette__hint">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
