// Mirrors the serde structs in src-tauri/src/model.rs

export interface RepoMeta {
  id: number;
  path: string;
  name: string;
  alias: string | null;
  favorite: boolean;
  lastOpened: number;
}

export interface FileEntry {
  path: string;
  /** Short git status code, e.g. "M", "A", "D", "R", "??". */
  status: string;
  staged: boolean;
}

export interface RepoStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: FileEntry[];
  conflicted: FileEntry[];
  mergeInProgress: boolean;
  rebaseInProgress: boolean;
}

export interface GraphEdge {
  from: number;
  to: number;
  color: number;
}

export interface GraphRow {
  sha: string;
  summary: string;
  author: string;
  /** Author time, unix epoch seconds. */
  time: number;
  refs: string[];
  column: number;
  color: number;
  edges: GraphEdge[];
  /** True for the synthetic working-directory node at the top of the graph. */
  wip: boolean;
}

export interface StashEntry {
  id: string;
  message: string;
}

export interface RebaseCommit {
  sha: string;
  subject: string;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string;
  locked: boolean;
  isMain: boolean;
  ahead: number;
  behind: number;
  changes: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  command: string;
  available: boolean;
  path: string | null;
}

export interface AgentSession {
  id: string;
  agentId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  status: string; // "running" | "exited"
}

export interface Hunk {
  header: string;
  lines: string[];
  patch: string;
}

export interface DiffSides {
  oldText: string;
  newText: string;
  binary: boolean;
}

export interface CommitDetail {
  sha: string;
  summary: string;
  body: string;
  author: string;
  email: string;
  time: number;
  parents: string[];
  files: FileEntry[];
}

/** Sentinel sha of the working-directory (WIP) node; matches the Rust backend. */
export const WIP_SHA = "0000000000000000000000000000000000000000";
