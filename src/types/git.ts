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
  /** In-progress sequencer op: "cherry-pick" | "revert" | "" (none). */
  sequencer: string;
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

export interface Remote {
  name: string;
  url: string;
}

export interface LocalBranch {
  name: string;
  current: boolean;
  ahead: number;
  behind: number;
}

export interface BranchList {
  local: LocalBranch[];
  /** Remote-tracking branches, full short names like "origin/main". */
  remote: string[];
}

export interface Submodule {
  path: string;
  sha: string;
  status: string; // ok | modified | uninitialized | conflict
  describe: string;
}

export interface LfsFile {
  path: string;
  oid: string;
  downloaded: boolean;
  lockOwner: string;
}

export interface LfsStatus {
  installed: boolean;
  version: string;
  used: boolean;
  patterns: string[];
  files: LfsFile[];
}

export interface ForgeInfo {
  provider: string; // "github" | "gitlab" | "bitbucket" | "" (unknown)
  host: string;
  owner: string;
  repo: string;
  hasToken: boolean;
}

export interface ForgePull {
  number: number;
  title: string;
  author: string;
  state: string;
  draft: boolean;
  url: string;
  source: string;
  target: string;
  updated: string;
}

export interface ForgeIssue {
  number: number;
  title: string;
  author: string;
  state: string;
  url: string;
  comments: number;
  updated: string;
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

export interface TermSession {
  id: string;
  cwd: string;
  title: string;
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
  /** "good" | "bad" | "unknown" | "expired" | "revoked" | "" (unsigned). */
  signature: string;
  signer: string;
}

export interface SigningConfig {
  sign: boolean;
  format: string; // "openpgp" | "ssh"
  key: string;
}

export interface Profile {
  /** 0 for an unsaved profile; assigned on save. */
  id: number;
  name: string;
  userName: string;
  userEmail: string;
  signingKey: string;
  signingFormat: string; // "openpgp" | "ssh" | ""
  sshKeyPath: string;
}

export interface GitflowConfig {
  initialized: boolean;
  main: string;
  develop: string;
  featurePrefix: string;
  releasePrefix: string;
  hotfixPrefix: string;
  current: string;
  currentKind: string; // "feature" | "release" | "hotfix" | ""
  currentName: string;
}

/** Sentinel sha of the working-directory (WIP) node; matches the Rust backend. */
export const WIP_SHA = "0000000000000000000000000000000000000000";
