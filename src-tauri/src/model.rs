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
    pub staged: Vec<FileEntry>,
    pub unstaged: Vec<FileEntry>,
    pub untracked: Vec<FileEntry>,
}
