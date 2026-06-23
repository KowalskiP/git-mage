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
  staged: FileEntry[];
  unstaged: FileEntry[];
  untracked: FileEntry[];
}
