use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoMeta {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub alias: Option<String>,
    pub favorite: bool,
    pub last_opened: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct FileEntry {
    pub path: String,
    /// Short git status code: "M", "A", "D", "R", "??", …
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<FileEntry>,
    pub conflicted: Vec<FileEntry>,
    /// True when a merge is in progress (MERGE_HEAD present).
    pub merge_in_progress: bool,
    /// True when a rebase is in progress (rebase-merge/rebase-apply present).
    pub rebase_in_progress: bool,
}

/// One line segment in the commit graph, drawn from this row toward the next.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: u32,
    pub to: u32,
    pub color: u32,
}

/// One commit, with its computed lane/column position and outgoing edges.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    pub sha: String,
    pub summary: String,
    pub author: String,
    /// Author time, unix epoch seconds.
    pub time: i64,
    /// Decoration names pointing at this commit (branches, tags, HEAD).
    pub refs: Vec<String>,
    pub column: u32,
    pub color: u32,
    pub edges: Vec<GraphEdge>,
    /// True for the synthetic "working directory" node at the top of the graph.
    pub wip: bool,
}

/// A git worktree (the base unit for agent sessions, SPEC §6.7 / §10).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    /// Short branch name, or None when detached.
    pub branch: Option<String>,
    pub head: String,
    pub locked: bool,
    /// The primary worktree (the original repo checkout).
    pub is_main: bool,
}

/// One commit in a rebase todo range (base..HEAD), oldest first.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RebaseCommit {
    pub sha: String,
    pub subject: String,
}

/// One stash entry.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    /// Stash ref, e.g. "stash@{0}".
    pub id: String,
    pub message: String,
}

/// One hunk of a file's diff, plus a self-contained patch that stages/unstages it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    /// The `@@ -a,b +c,d @@ …` header line.
    pub header: String,
    /// Body lines (each prefixed with ` `, `+`, or `-`).
    pub lines: Vec<String>,
    /// Full applyable patch (file header + this hunk) for `git apply --cached`.
    pub patch: String,
}

/// Old and new contents of a file, for a side-by-side diff view.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffSides {
    pub old_text: String,
    pub new_text: String,
    pub binary: bool,
}

/// Full detail of a single commit, for the detail sidebar.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub sha: String,
    pub summary: String,
    pub body: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub parents: Vec<String>,
    pub files: Vec<FileEntry>,
}
