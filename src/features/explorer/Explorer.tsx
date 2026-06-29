import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useRepos } from "../../store/repos";
import { getSetting, setSetting, openExternal } from "../../ipc/commands";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { PromptModal } from "../PromptModal";
import { Icon, type IconName } from "../Icon";
import { AgentsPanel } from "../agents/AgentsPanel";
import { buildTree, type TreeNode } from "./tree";
import type { LocalBranch } from "../../types/git";

const LAYOUT_SETTING = "explorer.layout";
const DEFAULT_H = 200;
const DEFAULT_OPEN = new Set(["local", "remote", "pulls"]);

const SECTION_ICON: Record<string, IconName> = {
  local: "branch",
  remote: "remote",
  pulls: "pr",
  stashes: "stash",
  worktrees: "worktree",
  submodules: "submodule",
  agents: "agent",
  gitflow: "gitflow",
  lfs: "lfs",
};

type Conf = { open: boolean; h: number };
type Layout = Record<string, Conf>;

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

const SM_GLYPH: Record<string, string> = {
  ok: "✓",
  modified: "±",
  uninitialized: "○",
  conflict: "⚠",
};

interface PromptState {
  title: string;
  placeholder?: string;
  initial?: string;
  submitLabel?: string;
  onSubmit: (v: string) => void;
}

/**
 * GitKraken-style repository explorer: collapsible, individually resizable
 * sections for local/remote branches, pull requests, stashes, worktrees,
 * submodules, agents, gitflow and LFS. Replaces the former "Repo ▾" toolbar
 * menu and folds the branch picker / agents tab into one panel.
 */
export function Explorer() {
  const selected = useRepos((s) => s.selected)!;
  const status = useRepos((s) => s.status);
  const branchTree = useRepos((s) => s.branchTree);
  const remotes = useRepos((s) => s.remotes);
  const stashes = useRepos((s) => s.stashes);
  const worktrees = useRepos((s) => s.worktrees);
  const submodules = useRepos((s) => s.submodules);
  const lfs = useRepos((s) => s.lfs);
  const gitflow = useRepos((s) => s.gitflow);
  const forge = useRepos((s) => s.forge);
  const pulls = useRepos((s) => s.pulls);
  const forgeLoading = useRepos((s) => s.forgeLoading);
  const sessions = useRepos((s) => s.sessions);
  const reposDrawerOpen = useRepos((s) => s.reposDrawerOpen);
  const toggleReposDrawer = useRepos((s) => s.toggleReposDrawer);
  const closeRepo = useRepos((s) => s.closeRepo);

  const checkout = useRepos((s) => s.checkout);
  const merge = useRepos((s) => s.merge);
  const rebase = useRepos((s) => s.rebase);
  const createBranch = useRepos((s) => s.createBranch);
  const branchDelete = useRepos((s) => s.branchDelete);
  const branchRename = useRepos((s) => s.branchRename);
  const addRemote = useRepos((s) => s.addRemote);
  const removeRemote = useRepos((s) => s.removeRemote);
  const renameRemote = useRepos((s) => s.renameRemote);
  const setRemoteUrl = useRepos((s) => s.setRemoteUrl);
  const stashApply = useRepos((s) => s.stashApply);
  const stashPop = useRepos((s) => s.stashPop);
  const stashDrop = useRepos((s) => s.stashDrop);
  const addWorktree = useRepos((s) => s.addWorktree);
  const removeWorktree = useRepos((s) => s.removeWorktree);
  const updateSubmodule = useRepos((s) => s.updateSubmodule);
  const syncSubmodules = useRepos((s) => s.syncSubmodules);
  const lfsPull = useRepos((s) => s.lfsPull);
  const lfsTrack = useRepos((s) => s.lfsTrack);
  const lfsLock = useRepos((s) => s.lfsLock);
  const gitflowInit = useRepos((s) => s.gitflowInit);
  const gitflowStart = useRepos((s) => s.gitflowStart);
  const gitflowFinish = useRepos((s) => s.gitflowFinish);
  const toggleForge = useRepos((s) => s.toggleForge);
  const loadPulls = useRepos((s) => s.loadPulls);

  const [layout, setLayout] = useState<Layout>({});
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);

  // Per-section open/height layout persists across runs.
  useEffect(() => {
    getSetting(LAYOUT_SETTING)
      .then((raw) => {
        if (raw) setLayout(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  // Lazily load PRs once a token is connected (the section is only shown then).
  useEffect(() => {
    if (forge?.hasToken && pulls.length === 0 && !forgeLoading) void loadPulls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forge?.hasToken]);

  const conf = (id: string): Conf => layout[id] ?? { open: DEFAULT_OPEN.has(id), h: DEFAULT_H };
  const toggleSec = (id: string) => {
    const c = conf(id);
    const next = { ...layoutRef.current, [id]: { ...c, open: !c.open } };
    setLayout(next);
    setSetting(LAYOUT_SETTING, JSON.stringify(next)).catch(() => {});
  };
  const startResize = (id: string, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = conf(id).h;
    let raf = 0;
    const onMove = (ev: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = Math.max(60, Math.min(800, startH + (ev.clientY - startY)));
        setLayout((prev) => ({ ...prev, [id]: { open: true, h } }));
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setSetting(LAYOUT_SETTING, JSON.stringify(layoutRef.current)).catch(() => {});
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const folderOpen = (key: string) => !collapsed.has(key);
  const toggleFolder = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const current = status?.branch ?? null;
  const closeMenu = () => setMenu(null);

  // ---- branch trees -------------------------------------------------------
  const localTree = useMemo(
    () =>
      buildTree<LocalBranch>(
        branchTree.local.map((b) => ({ segments: b.name.split("/"), data: b })),
      ),
    [branchTree.local],
  );

  const remoteGroups = useMemo(() => {
    const map = new Map<string, TreeNode<string>[]>();
    const raw = new Map<string, { segments: string[]; data: string }[]>();
    for (const full of branchTree.remote) {
      const slash = full.indexOf("/");
      if (slash < 0) continue;
      const name = full.slice(0, slash);
      const sub = full.slice(slash + 1);
      if (!raw.has(name)) raw.set(name, []);
      raw.get(name)!.push({ segments: sub.split("/"), data: full });
    }
    for (const [name, items] of raw) map.set(name, buildTree(items));
    return map;
  }, [branchTree.remote]);

  const remoteNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of remotes) set.add(r.name);
    for (const k of remoteGroups.keys()) set.add(k);
    return [...set].sort();
  }, [remotes, remoteGroups]);

  // ---- context menus ------------------------------------------------------
  function localMenu(e: ReactMouseEvent, name: string, b: LocalBranch) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [];
    if (!b.current) items.push({ label: `Checkout ${name}`, onClick: () => checkout(name) });
    if (!b.current && current) {
      items.push({ label: `Merge into ${current}`, onClick: () => merge(name) });
      items.push({ label: `Rebase ${current} onto ${name}`, onClick: () => rebase(name) });
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
    if (!b.current)
      items.push({ label: "Delete branch", danger: true, onClick: () => branchDelete(name, false) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function remoteBranchMenu(e: ReactMouseEvent, full: string, short: string) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      { label: `Checkout ${short}`, onClick: () => checkout(short) },
    ];
    if (current) {
      items.push({ label: `Merge into ${current}`, onClick: () => merge(full) });
      items.push({ label: `Rebase ${current} onto ${full}`, onClick: () => rebase(full) });
    }
    setMenu({ x: e.clientX, y: e.clientY, items });
  }

  function remoteMenu(e: ReactMouseEvent, name: string) {
    e.preventDefault();
    e.stopPropagation();
    const r = remotes.find((x) => x.name === name);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Set URL…",
          onClick: () =>
            setPrompt({
              title: `Set ${name} URL`,
              initial: r?.url,
              submitLabel: "Save",
              onSubmit: (u) => setRemoteUrl(name, u),
            }),
        },
        {
          label: "Rename…",
          onClick: () =>
            setPrompt({
              title: "Rename remote",
              initial: name,
              submitLabel: "Rename",
              onSubmit: (nn) => renameRemote(name, nn),
            }),
        },
        { label: "Remove remote", danger: true, onClick: () => removeRemote(name) },
      ],
    });
  }

  function addRemoteFlow() {
    setPrompt({
      title: "New remote — name",
      placeholder: "origin",
      submitLabel: "Next",
      onSubmit: (name) =>
        setPrompt({
          title: `New remote — URL for "${name}"`,
          placeholder: "https://… or git@…",
          submitLabel: "Add",
          onSubmit: (url) => addRemote(name, url),
        }),
    });
  }

  // ---- tree row renderers -------------------------------------------------
  function renderTree<T>(
    nodes: TreeNode<T>[],
    depth: number,
    keyPrefix: string,
    leaf: (data: T, node: TreeNode<T>, depth: number) => ReactNode,
  ): ReactNode {
    return nodes.map((n) => {
      const pad = 10 + depth * 13;
      const isFolder = n.children.length > 0;
      if (!isFolder && n.leaf !== undefined) return <Fragment key={n.path}>{leaf(n.leaf, n, depth)}</Fragment>;
      const key = `${keyPrefix}:${n.path}`;
      const open = folderOpen(key);
      return (
        <Fragment key={n.path}>
          <div className="exp-folder" style={{ paddingLeft: pad }} onClick={() => toggleFolder(key)}>
            <span className="exp-caret">{open ? "▾" : "▸"}</span>
            <span className="exp-folder__name">{n.name}</span>
          </div>
          {n.leaf !== undefined && leaf(n.leaf, n, depth)}
          {open && renderTree(n.children, depth + 1, keyPrefix, leaf)}
        </Fragment>
      );
    });
  }

  const localLeaf = (b: LocalBranch, node: TreeNode<LocalBranch>, depth: number) => (
    <div
      className={"exp-branch" + (b.current ? " exp-branch--current" : "")}
      style={{ paddingLeft: 10 + depth * 13 }}
      title={node.path}
      onDoubleClick={() => !b.current && checkout(node.path)}
      onContextMenu={(e) => localMenu(e, node.path, b)}
    >
      <span className="exp-branch__dot">{b.current ? "●" : ""}</span>
      <span className="exp-branch__name">{node.name}</span>
      <span className="exp-branch__track">
        {b.ahead > 0 && <span className="trk trk--ahead">↑{b.ahead}</span>}
        {b.behind > 0 && <span className="trk trk--behind">↓{b.behind}</span>}
      </span>
    </div>
  );

  const remoteLeaf = (full: string, node: TreeNode<string>, depth: number) => (
    <div
      className="exp-branch"
      style={{ paddingLeft: 10 + depth * 13 }}
      title={full}
      onDoubleClick={() => checkout(node.path)}
      onContextMenu={(e) => remoteBranchMenu(e, full, node.path)}
    >
      <span className="exp-branch__dot" />
      <span className="exp-branch__name">{node.name}</span>
    </div>
  );

  // ---- sections -----------------------------------------------------------
  const sec = (
    id: string,
    title: string,
    body: ReactNode,
    opts: { count?: number; actions?: ReactNode } = {},
  ) => {
    const c = conf(id);
    return (
      <div className="exp-sec">
        <div className="exp-sec__head" onClick={() => toggleSec(id)}>
          <span className="exp-caret">{c.open ? "▾" : "▸"}</span>
          {SECTION_ICON[id] && (
            <span className="exp-sec__icon">
              <Icon name={SECTION_ICON[id]} size={13} />
            </span>
          )}
          <span className="exp-sec__title">{title}</span>
          {opts.count != null && opts.count > 0 && (
            <span className="exp-sec__count">{opts.count}</span>
          )}
          <span className="exp-sec__spacer" />
          {opts.actions && (
            <span className="exp-sec__actions" onClick={(e) => e.stopPropagation()}>
              {opts.actions}
            </span>
          )}
        </div>
        {c.open && (
          <div className="exp-sec__wrap">
            <div className="exp-sec__body" style={{ height: c.h }}>
              {body}
            </div>
            <div className="exp-sec__resize" onMouseDown={(e) => startResize(id, e)} />
          </div>
        )}
      </div>
    );
  };

  const plus = (label: string, onClick: () => void) => (
    <button className="exp-add" title={label} aria-label={label} onClick={onClick}>
      <Icon name="add" size={14} />
    </button>
  );

  return (
    <aside className="explorer">
      <div className="exp-head">
        <button
          className="exp-drawer-toggle"
          title={reposDrawerOpen ? "Hide repositories" : "Show repositories"}
          aria-label={reposDrawerOpen ? "Hide repositories" : "Show repositories"}
          onClick={() => toggleReposDrawer()}
        >
          <Icon name={reposDrawerOpen ? "drawerOpen" : "drawerClosed"} size={16} />
        </button>
        <div className="exp-head__main">
          <span className="exp-head__name" title={selected.path}>
            {selected.alias ?? selected.name}
          </span>
          <span className="exp-head__branch">{current ?? "—"}</span>
        </div>
        {forge?.provider && !forge.hasToken && (
          <button className="link-btn" onClick={() => toggleForge(true)} title="Connect access token">
            Connect
          </button>
        )}
        <button
          className="exp-drawer-toggle"
          title="Close repository"
          aria-label="Close repository"
          onClick={() => closeRepo()}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="exp-sections">
        {sec(
          "local",
          "LOCAL",
          branchTree.local.length === 0 ? (
            <div className="exp-empty">No branches</div>
          ) : (
            <div className="exp-tree">{renderTree(localTree, 0, "local", localLeaf)}</div>
          ),
          {
            count: branchTree.local.length,
            actions: plus("New branch", () =>
              setPrompt({
                title: "New branch",
                placeholder: "branch name",
                submitLabel: "Create",
                onSubmit: (n) => createBranch(n, true),
              }),
            ),
          },
        )}

        {sec(
          "remote",
          "REMOTE",
          remoteNames.length === 0 ? (
            <div className="exp-empty">No remotes</div>
          ) : (
            <div className="exp-tree">
              {remoteNames.map((rn) => {
                const r = remotes.find((x) => x.name === rn);
                const tree = remoteGroups.get(rn) ?? [];
                const key = `remoteg:${rn}`;
                const open = folderOpen(key);
                return (
                  <Fragment key={rn}>
                    <div
                      className="exp-folder exp-folder--remote"
                      style={{ paddingLeft: 10 }}
                      onClick={() => toggleFolder(key)}
                      onContextMenu={(e) => remoteMenu(e, rn)}
                      title={r?.url}
                    >
                      <span className="exp-caret">{open ? "▾" : "▸"}</span>
                      <span className="exp-folder__name">{rn}</span>
                    </div>
                    {open && renderTree(tree, 1, "remote", remoteLeaf)}
                  </Fragment>
                );
              })}
            </div>
          ),
          { count: remoteNames.length, actions: plus("Add remote", addRemoteFlow) },
        )}

        {forge?.hasToken &&
          sec(
            "pulls",
            "PULL REQUESTS",
            forgeLoading && pulls.length === 0 ? (
              <div className="exp-empty">Loading…</div>
            ) : pulls.length === 0 ? (
              <div className="exp-empty">No open pull requests</div>
            ) : (
              <div className="exp-tree">
                {pulls.map((p) => (
                  <div
                    key={p.number}
                    className="exp-pr"
                    title={`${p.source} → ${p.target} · ${p.author}`}
                    onClick={() => openExternal(p.url)}
                  >
                    <span className={"forge-state forge-state--" + (p.draft ? "draft" : p.state)}>
                      {p.draft ? "draft" : p.state}
                    </span>
                    <span className="exp-pr__num">#{p.number}</span>
                    <span className="exp-pr__title">{p.title}</span>
                  </div>
                ))}
              </div>
            ),
            { count: pulls.length },
          )}

        {sec(
          "stashes",
          "STASHES",
          stashes.length === 0 ? (
            <div className="exp-empty">No stashes</div>
          ) : (
            stashes.map((s) => (
              <div key={s.id} className="exp-row" title={s.message}>
                <span className="exp-row__main">{s.message}</span>
                <span className="exp-row__actions">
                  <button className="link-btn" onClick={() => stashApply(s.id)}>
                    Apply
                  </button>
                  <button className="link-btn" onClick={() => stashPop(s.id)}>
                    Pop
                  </button>
                  <button className="link-btn link-btn--danger" onClick={() => stashDrop(s.id)}>
                    Drop
                  </button>
                </span>
              </div>
            ))
          ),
          { count: stashes.length },
        )}

        {sec(
          "worktrees",
          "WORKTREES",
          <>
            {worktrees.map((w) => (
              <div key={w.path} className="exp-row" title={w.path}>
                <span className="exp-row__main">
                  {w.branch ?? w.head.slice(0, 7)}
                  {w.isMain && <span className="wt-tag">main</span>}
                  {w.locked && <span className="wt-tag">🔒</span>}
                </span>
                {!w.isMain && (
                  <span className="exp-row__actions">
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
              </div>
            ))}
          </>,
          {
            count: worktrees.length,
            actions: plus("New worktree", () =>
              setPrompt({
                title: "New worktree",
                placeholder: "new branch → worktree",
                submitLabel: "Create",
                onSubmit: (n) => addWorktree(n, true),
              }),
            ),
          },
        )}

        {submodules.length > 0 &&
          sec(
            "submodules",
            "SUBMODULES",
            <>
              <div className="exp-subhead">
                <button className="link-btn" onClick={() => updateSubmodule(null, true)}>
                  Update all
                </button>
                <button className="link-btn" onClick={() => syncSubmodules()}>
                  Sync
                </button>
              </div>
              {submodules.map((sm) => (
                <div key={sm.path} className="exp-row" title={`${sm.status} · ${sm.sha} ${sm.describe}`}>
                  <span className={"gmark gmark--" + sm.status}>{SM_GLYPH[sm.status] ?? "•"}</span>
                  <span className="exp-row__main">{sm.path}</span>
                  <span className="exp-row__actions">
                    <button
                      className="link-btn"
                      onClick={() => updateSubmodule(sm.path, sm.status === "uninitialized")}
                    >
                      {sm.status === "uninitialized" ? "Init" : "Update"}
                    </button>
                  </span>
                </div>
              ))}
            </>,
            { count: submodules.length },
          )}

        {sec("agents", "AGENTS", <AgentsPanel />, { count: sessions.length })}

        {sec(
          "gitflow",
          "GITFLOW",
          !gitflow?.initialized ? (
            <div className="exp-pad">
              <div className="exp-empty">
                No <code>develop</code> branch. Initialize gitflow to create it from{" "}
                <code>{gitflow?.main ?? "main"}</code>.
              </div>
              <button className="tbtn tbtn--primary" onClick={() => gitflowInit()}>
                Initialize
              </button>
            </div>
          ) : (
            <div className="exp-pad">
              <div className="flow-bases">
                <span className="ref ref--local">{gitflow.main}</span>
                <span className="ref ref--local">{gitflow.develop}</span>
              </div>
              {gitflow.currentKind && (
                <div className="exp-row">
                  <span className="exp-row__main">
                    On {gitflow.currentKind} <b>{gitflow.currentName}</b>
                  </span>
                  <button
                    className="tbtn tbtn--primary"
                    onClick={() => gitflowFinish(gitflow.currentKind, gitflow.currentName)}
                  >
                    Finish
                  </button>
                </div>
              )}
              <FlowStart onStart={gitflowStart} />
            </div>
          ),
        )}

        {lfs?.used &&
          sec(
            "lfs",
            "LFS",
            <>
              <div className="exp-subhead">
                <span className="lfs-ver" title={lfs.version}>
                  {lfs.version.split(" ")[0] || "git-lfs"}
                </span>
                <button className="link-btn" onClick={() => lfsPull()}>
                  Pull
                </button>
              </div>
              <LfsTrack onTrack={lfsTrack} />
              {lfs.patterns.length > 0 && (
                <div className="lfs-patterns">
                  {lfs.patterns.map((p) => (
                    <span key={p} className="lfs-pat">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {lfs.files.length === 0 && <div className="exp-empty">No LFS files</div>}
              {lfs.files.map((f) => (
                <div key={f.path} className="exp-row" title={f.oid}>
                  <span className={"gmark " + (f.downloaded ? "gmark--ok" : "gmark--pointer")}>
                    {f.downloaded ? "●" : "○"}
                  </span>
                  <span className="exp-row__main">{f.path}</span>
                  {f.lockOwner && <span className="lfs-lock">🔒 {f.lockOwner}</span>}
                  <span className="exp-row__actions">
                    <button className="link-btn" onClick={() => lfsLock(f.path, !f.lockOwner)}>
                      {f.lockOwner ? "Unlock" : "Lock"}
                    </button>
                  </span>
                </div>
              ))}
            </>,
            { count: lfs.files.length },
          )}
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
      {prompt && (
        <PromptModal
          title={prompt.title}
          placeholder={prompt.placeholder}
          initial={prompt.initial}
          submitLabel={prompt.submitLabel}
          onSubmit={(v) => {
            const fn = prompt.onSubmit;
            setPrompt(null);
            fn(v);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </aside>
  );
}

function FlowStart({ onStart }: { onStart: (kind: string, name: string) => void }) {
  const [kind, setKind] = useState("feature");
  const [name, setName] = useState("");
  const go = () => {
    const n = name.trim();
    if (!n) return;
    setName("");
    onStart(kind, n);
  };
  return (
    <div className="flow-start">
      <select className="sign-select" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="feature">feature</option>
        <option value="release">release</option>
        <option value="hotfix">hotfix</option>
      </select>
      <input
        className="new-branch__input"
        {...inputProps}
        placeholder="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
      />
      <button className="tbtn tbtn--primary" onClick={go}>
        Start
      </button>
    </div>
  );
}

function LfsTrack({ onTrack }: { onTrack: (pattern: string) => void }) {
  const [pat, setPat] = useState("");
  const go = () => {
    const p = pat.trim();
    if (!p) return;
    setPat("");
    onTrack(p);
  };
  return (
    <div className="lfs-track">
      <input
        className="new-branch__input"
        {...inputProps}
        placeholder="track pattern, e.g. *.psd"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
      />
      <button className="tbtn tbtn--primary" onClick={go}>
        Track
      </button>
    </div>
  );
}
