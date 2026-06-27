import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRepos } from "../../store/repos";
import { useT } from "../../i18n/useT";
import type { GraphRow } from "../../types/git";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { PromptModal } from "../PromptModal";
import { RebaseModal } from "../RebaseModal";

const ROW_H = 26;
const COL_W = 14;
const PAD_X = 12;
const DOT_R = 4.5;

// Lane palette — index must match the backend's color_of (col % 8).
const PALETTE = [
  "#8b5cf6", "#61afef", "#5ec27a", "#d6a35c",
  "#e06c75", "#56b6c2", "#c678dd", "#e5c07b",
];

const shortSha = (sha: string) => sha.slice(0, 7);

function relTime(epoch: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

function refKind(name: string): string {
  if (name.startsWith("tag:")) return "ref--tag";
  if (name.startsWith("HEAD")) return "ref--head";
  if (name.includes("/")) return "ref--remote";
  return "ref--local";
}

type RefKind = "tag" | "remote" | "local" | "head";

function parseRef(r: string): { kind: RefKind; name: string } {
  if (r.startsWith("tag:")) return { kind: "tag", name: r.slice(4).trim() };
  if (r.startsWith("HEAD ->")) return { kind: "local", name: r.slice(7).trim() };
  if (r === "HEAD") return { kind: "head", name: "HEAD" };
  if (r.includes("/")) return { kind: "remote", name: r };
  return { kind: "local", name: r };
}

export function CommitGraph() {
  const t = useT();
  const graph = useRepos((s) => s.graph);
  const graphLoading = useRepos((s) => s.graphLoading);
  const selectedSha = useRepos((s) => s.selectedSha);
  const selectNode = useRepos((s) => s.selectNode);
  const status = useRepos((s) => s.status);
  const error = useRepos((s) => s.error);
  const checkout = useRepos((s) => s.checkout);
  const merge = useRepos((s) => s.merge);
  const rebase = useRepos((s) => s.rebase);
  const cherryPick = useRepos((s) => s.cherryPick);
  const revert = useRepos((s) => s.revert);
  const reset = useRepos((s) => s.reset);
  const createBranchAt = useRepos((s) => s.createBranchAt);
  const branchDelete = useRepos((s) => s.branchDelete);
  const branchRename = useRepos((s) => s.branchRename);
  const tagCreate = useRepos((s) => s.tagCreate);
  const tagDelete = useRepos((s) => s.tagDelete);
  const repoPath = useRepos((s) => s.selected?.path ?? "");
  const currentBranch = status?.branch ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const rafRef = useRef<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [prompt, setPrompt] = useState<{
    title: string;
    placeholder?: string;
    initial?: string;
    submitLabel?: string;
    onSubmit: (v: string) => void;
  } | null>(null);
  const [rebaseBase, setRebaseBase] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);

  // Commit search: indices of rows matching summary / author / sha. Does not
  // alter the lane layout — just highlights and scrolls to matches.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const out: number[] = [];
    graph.forEach((r, i) => {
      if (r.wip) return;
      if (
        r.summary.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        r.sha.toLowerCase().includes(q)
      ) {
        out.push(i);
      }
    });
    return out;
  }, [graph, query]);

  useEffect(() => setMatchPos(0), [query]);

  const currentMatch = matches.length ? matches[Math.min(matchPos, matches.length - 1)] : -1;

  // Scroll the current match into view and select it.
  useEffect(() => {
    if (currentMatch < 0) return;
    const el = scrollRef.current;
    if (el) {
      const target = currentMatch * ROW_H - el.clientHeight / 2 + ROW_H / 2;
      el.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }
    const sha = graph[currentMatch]?.sha;
    if (sha) selectNode(sha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch]);

  const stepMatch = (d: number) => {
    if (matches.length === 0) return;
    setMatchPos((p) => (p + d + matches.length) % matches.length);
  };

  function commitMenu(e: MouseEvent, row: GraphRow) {
    e.preventDefault();
    e.stopPropagation();
    const sha = row.sha;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Create branch here…",
          onClick: () =>
            setPrompt({
              title: "New branch",
              placeholder: "branch name",
              submitLabel: "Create",
              onSubmit: (n) => createBranchAt(n, sha, true),
            }),
        },
        {
          label: "Create tag here…",
          onClick: () =>
            setPrompt({
              title: "New tag",
              placeholder: "tag name",
              submitLabel: "Create",
              onSubmit: (n) => tagCreate(n, sha),
            }),
        },
        { label: "Checkout commit", onClick: () => checkout(sha) },
        { label: "Cherry-pick commit", onClick: () => cherryPick(sha) },
        { label: "Revert commit", onClick: () => revert(sha) },
        { label: "Interactive rebase from here…", onClick: () => setRebaseBase(sha) },
        { label: `Reset ${currentBranch ?? "branch"} here (soft)`, onClick: () => reset(sha, "soft") },
        { label: `Reset ${currentBranch ?? "branch"} here (mixed)`, onClick: () => reset(sha, "mixed") },
        {
          label: `Reset ${currentBranch ?? "branch"} here (hard)`,
          danger: true,
          onClick: () => reset(sha, "hard"),
        },
        { label: "Copy SHA", onClick: () => navigator.clipboard?.writeText(sha) },
      ],
    });
  }

  function refMenu(e: MouseEvent, refString: string) {
    e.preventDefault();
    e.stopPropagation();
    const { kind, name } = parseRef(refString);
    const items: MenuItem[] = [];
    if (kind === "local") {
      items.push({ label: `Checkout ${name}`, onClick: () => checkout(name) });
      if (name !== currentBranch) {
        items.push({ label: `Merge into ${currentBranch ?? "current"}`, onClick: () => merge(name) });
        items.push({
          label: `Rebase ${currentBranch ?? "current"} onto ${name}`,
          onClick: () => rebase(name),
        });
      }
      items.push({
        label: "Rename…",
        onClick: () =>
          setPrompt({
            title: "Rename branch",
            initial: name,
            submitLabel: "Rename",
            onSubmit: (nn) => branchRename(name, nn),
          }),
      });
      items.push({ label: "Delete branch", danger: true, onClick: () => branchDelete(name, false) });
    } else if (kind === "remote") {
      const short = name.split("/").slice(1).join("/");
      items.push({ label: `Checkout ${short}`, onClick: () => checkout(short) });
      items.push({ label: `Merge into ${currentBranch ?? "current"}`, onClick: () => merge(name) });
      items.push({
        label: `Rebase ${currentBranch ?? "current"} onto ${name}`,
        onClick: () => rebase(name),
      });
    } else if (kind === "tag") {
      items.push({ label: "Delete tag", danger: true, onClick: () => tagDelete(name) });
    } else {
      return;
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  const changeCount = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportH(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [graphLoading, graph.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el || rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setScrollTop(el.scrollTop);
    });
  }

  let maxCol = 1;
  for (const r of graph) {
    if (r.column > maxCol) maxCol = r.column;
    for (const e of r.edges) maxCol = Math.max(maxCol, e.from, e.to);
  }
  const graphW = PAD_X * 2 + (maxCol + 1) * COL_W;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewportH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = graphW * dpr;
    canvas.height = viewportH * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, graphW, viewportH);
    if (graph.length === 0) return;

    const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 1);
    const last = Math.min(graph.length - 1, Math.ceil((scrollTop + viewportH) / ROW_H) + 1);
    const x = (col: number) => PAD_X + col * COL_W + COL_W / 2;
    const yc = (i: number) => i * ROW_H - scrollTop + ROW_H / 2;

    ctx.lineWidth = 1.6;
    for (let i = first; i <= last; i++) {
      const row = graph[i];
      const y0 = yc(i);
      const y1 = yc(i + 1);
      for (const e of row.edges) {
        ctx.strokeStyle = PALETTE[e.color % PALETTE.length];
        const x0 = x(e.from);
        const x1 = x(e.to);
        ctx.beginPath();
        if (e.from === e.to) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0, y1);
        } else {
          const ym = (y0 + y1) / 2;
          ctx.moveTo(x0, y0);
          ctx.bezierCurveTo(x0, ym, x1, ym, x1, y1);
        }
        ctx.stroke();
      }
    }

    for (let i = first; i <= last; i++) {
      const row = graph[i];
      const cx = x(row.column);
      const cy = yc(i);
      const active = row.sha === selectedSha;
      ctx.beginPath();
      ctx.arc(cx, cy, active ? DOT_R + 1.5 : DOT_R, 0, Math.PI * 2);
      if (row.wip) {
        // Hollow dashed node for uncommitted changes.
        ctx.fillStyle = "#16181d";
        ctx.fill();
        ctx.setLineDash([2, 2]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#8b5cf6";
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = PALETTE[row.color % PALETTE.length];
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#16181d";
        ctx.stroke();
      }
    }
  }, [graph, scrollTop, viewportH, graphW, selectedSha]);

  if (graphLoading && graph.length === 0) return <div className="graph-msg">{t("graph.loading")}</div>;
  if (error && graph.length === 0) return <div className="graph-msg error">{error}</div>;
  if (graph.length === 0) return <div className="graph-msg">{t("graph.empty")}</div>;

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - 1);
  const last = Math.min(graph.length - 1, Math.ceil((scrollTop + viewportH) / ROW_H) + 1);
  const visibleIdx: number[] = [];
  for (let i = first; i <= last; i++) visibleIdx.push(i);
  const matchesSet = new Set(matches);

  return (
    <div className="graph-wrap">
      <div className="graph-search">
        <input
          className="graph-search__input"
          placeholder={t("graph.search")}
          value={query}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              stepMatch(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              setQuery("");
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {query && (
          <span className="graph-search__count">
            {matches.length ? `${matchPos + 1}/${matches.length}` : "0"}
          </span>
        )}
      </div>
      <div className="graph-scroll" ref={scrollRef} onScroll={onScroll}>
      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ top: scrollTop, width: graphW, height: viewportH }}
      />
      <div className="graph-sizer" style={{ height: graph.length * ROW_H }}>
        {visibleIdx.map((i) => {
          const row = graph[i];
          const active = row.sha === selectedSha;
          if (row.wip) {
            return (
              <div
                key="wip"
                className={"commit-row commit-row--wip" + (active ? " commit-row--active" : "")}
                style={{ top: i * ROW_H, left: graphW, height: ROW_H }}
                onClick={() => selectNode(row.sha)}
              >
                <span className="wip-label">// WIP — uncommitted changes</span>
                {changeCount > 0 && <span className="wip-count">{changeCount}</span>}
              </div>
            );
          }
          const isMatch = matches.length > 0 && query && currentMatch !== i && matchesSet.has(i);
          const isCurrent = i === currentMatch && !!query;
          return (
            <div
              key={row.sha}
              className={
                "commit-row" +
                (active ? " commit-row--active" : "") +
                (isMatch ? " commit-row--match" : "") +
                (isCurrent ? " commit-row--match-current" : "")
              }
              style={{ top: i * ROW_H, left: graphW, height: ROW_H }}
              onClick={() => selectNode(row.sha)}
              onContextMenu={(e) => commitMenu(e, row)}
            >
              <div className="commit-row__main">
                {row.refs.map((r) => (
                  <span
                    key={r}
                    className={"ref " + refKind(r)}
                    onContextMenu={(e) => refMenu(e, r)}
                  >
                    {r.replace("tag: ", "").replace("HEAD -> ", "")}
                  </span>
                ))}
                <span className="commit-row__summary">{row.summary}</span>
              </div>
              <span className="commit-row__author">{row.author}</span>
              <span className="commit-row__sha">{shortSha(row.sha)}</span>
              <span className="commit-row__time">{relTime(row.time)}</span>
            </div>
          );
        })}
      </div>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      )}
      {prompt && (
        <PromptModal
          title={prompt.title}
          placeholder={prompt.placeholder}
          initial={prompt.initial}
          submitLabel={prompt.submitLabel}
          onSubmit={(v) => {
            prompt.onSubmit(v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
      {rebaseBase && (
        <RebaseModal repoPath={repoPath} base={rebaseBase} onClose={() => setRebaseBase(null)} />
      )}
    </div>
  );
}
