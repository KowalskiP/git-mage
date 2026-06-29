//! Commit-graph data + lane layout (SPEC §9, killer feature).
//!
//! M1: commit data is sourced from `git log` (robust, fast). The lane-assignment
//! algorithm — the real engineering value — is git-engine-agnostic and lives here.
//! A later step swaps the data source to `gix` revwalk without touching the layout.

use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::model::{GraphEdge, GraphRow};

const US: char = '\u{1f}'; // unit separator between fields
const RS: char = '\u{1e}'; // record separator between commits

/// Sentinel sha for the synthetic working-directory (WIP) node.
pub const WIP_SHA: &str = "0000000000000000000000000000000000000000";

struct Commit {
    sha: String,
    parents: Vec<String>,
    author: String,
    time: i64,
    refs: Vec<String>,
    summary: String,
}

/// Load up to `limit` commits across all refs and compute their graph layout.
pub fn graph(path: &str, limit: usize) -> AppResult<Vec<GraphRow>> {
    // Prefer gix (no process spawn); fall back to the git CLI on any gix error.
    let mut commits = match collect_commits_gix(path, limit) {
        Ok(c) => c,
        Err(_) => collect_commits_cli(path, limit)?,
    };

    // Prepend a synthetic working-directory node when the tree is dirty, so the
    // graph shows uncommitted changes as a node off HEAD (GitKraken-style).
    if let Some(wip) = working_dir_node(path) {
        commits.insert(0, wip);
    }

    Ok(layout(commits))
}

/// Commit data via `gix` revwalk across all refs (no process spawn).
fn collect_commits_gix(path: &str, limit: usize) -> AppResult<Vec<Commit>> {
    use std::collections::HashMap;

    let repo = gix::open(path).map_err(|e| AppError::Git(format!("gix open: {e}")))?;

    // Decorations (ref names per commit) and the set of tips to walk from.
    let mut decorations: HashMap<gix::ObjectId, Vec<String>> = HashMap::new();
    let mut tips: Vec<gix::ObjectId> = Vec::new();
    let platform = repo
        .references()
        .map_err(|e| AppError::Git(format!("gix refs: {e}")))?;
    for r in platform
        .all()
        .map_err(|e| AppError::Git(format!("gix refs: {e}")))?
    {
        let mut r = r.map_err(|e| AppError::Git(format!("gix ref: {e}")))?;
        let name = r.name().shorten().to_string();
        if let Ok(id) = r.peel_to_id() {
            let oid = id.detach();
            decorations.entry(oid).or_default().push(name);
            tips.push(oid);
        }
    }
    if let Ok(head) = repo.head() {
        if let Some(id) = head.id() {
            decorations.entry(id.detach()).or_default().insert(0, "HEAD".to_string());
        }
    }

    let walk = repo
        .rev_walk(tips)
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            gix::traverse::commit::simple::CommitTimeOrder::NewestFirst,
        ))
        .all()
        .map_err(|e| AppError::Git(format!("gix revwalk: {e}")))?;

    let mut commits = Vec::new();
    for info in walk {
        if commits.len() >= limit {
            break;
        }
        let info = info.map_err(|e| AppError::Git(format!("gix walk: {e}")))?;
        let oid = info.id;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| AppError::Git(format!("gix commit: {e}")))?;
        let parents: Vec<String> = commit.parent_ids().map(|p| p.detach().to_string()).collect();
        let author = commit
            .author()
            .map_err(|e| AppError::Git(format!("gix author: {e}")))?;
        let time = author.time().map(|t| t.seconds).unwrap_or(0);
        let summary = commit
            .message()
            .map(|m| m.summary().to_string())
            .unwrap_or_default();
        commits.push(Commit {
            sha: oid.to_string(),
            parents,
            author: author.name.to_string(),
            time,
            refs: decorations.get(&oid).cloned().unwrap_or_default(),
            summary,
        });
    }
    Ok(commits)
}

/// Commit data via the git CLI (`git log --all`) — fallback for `collect_commits_gix`.
fn collect_commits_cli(path: &str, limit: usize) -> AppResult<Vec<Commit>> {
    let fmt = format!("{US}%H{US}%P{US}%an{US}%at{US}%D{US}%s{RS}");
    let out = Command::new("git")
        .current_dir(path)
        .args([
            "-c",
            "log.showSignature=false",
            "log",
            "--all",
            "--date-order",
            &format!("--max-count={limit}"),
            &format!("--format={fmt}"),
        ])
        .output()
        .map_err(|e| AppError::Git(format!("git log: {e}")))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        // Fresh repo with no commits yet -> empty graph rather than an error.
        if err.contains("does not have any commits")
            || err.contains("bad default revision")
            || err.contains("bad revision")
        {
            return Ok(vec![]);
        }
        return Err(AppError::Git(err.trim().to_string()));
    }

    Ok(parse(&String::from_utf8_lossy(&out.stdout)))
}

/// A WIP commit (parent = HEAD) when the working tree has changes, else None.
fn working_dir_node(path: &str) -> Option<Commit> {
    let status = Command::new("git")
        .current_dir(path)
        .args(["status", "--porcelain"])
        .output()
        .ok()?;
    if !status.status.success() || status.stdout.is_empty() {
        return None;
    }
    let head = Command::new("git")
        .current_dir(path)
        .args(["rev-parse", "--verify", "HEAD"])
        .output()
        .ok()?;
    let parents = if head.status.success() {
        vec![String::from_utf8_lossy(&head.stdout).trim().to_string()]
    } else {
        vec![] // unborn branch
    };
    Some(Commit {
        sha: WIP_SHA.to_string(),
        parents,
        author: String::new(),
        time: 0,
        refs: vec![],
        summary: String::new(),
    })
}

fn parse(text: &str) -> Vec<Commit> {
    let mut commits = Vec::new();
    for rec in text.split(RS) {
        let rec = rec.trim_matches(['\n', '\r']);
        if rec.is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.split(US).collect();
        // Leading US yields an empty f[0]; fields follow: H, P, an, at, D, s.
        if f.len() < 7 {
            continue;
        }
        let refs = if f[5].is_empty() {
            vec![]
        } else {
            f[5].split(", ").map(|s| s.trim().to_string()).collect()
        };
        commits.push(Commit {
            sha: f[1].to_string(),
            parents: f[2].split_whitespace().map(str::to_string).collect(),
            author: f[3].to_string(),
            time: f[4].parse().unwrap_or(0),
            refs,
            summary: f[6..].join(&US.to_string()),
        });
    }
    commits
}

fn color_of(col: usize) -> u32 {
    (col % 8) as u32
}

/// Lane-assignment sweep. `lanes[c]` holds the sha each column is currently
/// routing toward (the next commit expected in that column).
fn layout(commits: Vec<Commit>) -> Vec<GraphRow> {
    let mut lanes: Vec<Option<String>> = Vec::new();
    let mut rows = Vec::with_capacity(commits.len());

    for c in &commits {
        // Columns whose lane was waiting for this commit (a child routed here).
        let merge_cols: Vec<usize> = lanes
            .iter()
            .enumerate()
            .filter(|(_, l)| l.as_deref() == Some(c.sha.as_str()))
            .map(|(i, _)| i)
            .collect();

        // Node column: leftmost waiting lane, or a fresh lane for a branch tip.
        let node_col = match merge_cols.first() {
            Some(&m) => m,
            None => {
                let slot = lanes.iter().position(Option::is_none).unwrap_or(lanes.len());
                if slot == lanes.len() {
                    lanes.push(None);
                }
                slot
            }
        };

        // Next-row lane state: clear everything that pointed at this commit.
        let mut next = lanes.clone();
        for l in next.iter_mut() {
            if l.as_deref() == Some(c.sha.as_str()) {
                *l = None;
            }
        }
        if node_col < next.len() {
            next[node_col] = None;
        }

        // Route parents: first parent prefers the node's column; extra parents
        // (merges) open new lanes; a parent already routed-to is merged into.
        let mut parent_cols = Vec::new();
        for (pi, p) in c.parents.iter().enumerate() {
            if let Some(existing) = next.iter().position(|l| l.as_deref() == Some(p.as_str())) {
                parent_cols.push(existing);
            } else if pi == 0 {
                if node_col >= next.len() {
                    next.resize(node_col + 1, None);
                }
                next[node_col] = Some(p.clone());
                parent_cols.push(node_col);
            } else {
                let slot = next.iter().position(Option::is_none).unwrap_or(next.len());
                if slot == next.len() {
                    next.push(None);
                }
                next[slot] = Some(p.clone());
                parent_cols.push(slot);
            }
        }

        // Edges from this row down to the next.
        let mut edges = Vec::new();
        // Passthrough lanes (continue straight down).
        for (j, l) in lanes.iter().enumerate() {
            if let Some(s) = l {
                if s != &c.sha {
                    edges.push(GraphEdge { from: j as u32, to: j as u32, color: color_of(j) });
                }
            }
        }
        // Merge lanes converging into the node.
        for &m in &merge_cols {
            if m != node_col {
                edges.push(GraphEdge { from: m as u32, to: node_col as u32, color: color_of(m) });
            }
        }
        // Node out to each parent's lane.
        for &pc in &parent_cols {
            edges.push(GraphEdge {
                from: node_col as u32,
                to: pc as u32,
                color: color_of(pc),
            });
        }

        rows.push(GraphRow {
            sha: c.sha.clone(),
            summary: c.summary.clone(),
            author: c.author.clone(),
            time: c.time,
            refs: c.refs.clone(),
            column: node_col as u32,
            color: color_of(node_col),
            edges,
            wip: c.sha == WIP_SHA,
        });

        // Keep the lane vector tight by dropping trailing empty lanes.
        while matches!(next.last(), Some(None)) {
            next.pop();
        }
        lanes = next;
    }

    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(sha: &str, parents: &[&str]) -> Commit {
        Commit {
            sha: sha.into(),
            parents: parents.iter().map(|p| p.to_string()).collect(),
            author: "a".into(),
            time: 0,
            refs: vec![],
            summary: "s".into(),
        }
    }

    #[test]
    fn linear_history_stays_in_one_column() {
        // newest first: c3 -> c2 -> c1
        let rows = layout(vec![c("c3", &["c2"]), c("c2", &["c1"]), c("c1", &[])]);
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().all(|r| r.column == 0), "all commits share lane 0");
        // c1 is a root: no outgoing parent edge.
        assert!(rows[2].edges.is_empty());
    }

    #[test]
    fn gix_matches_cli_on_real_repo() {
        // Only runs on a machine that has this repo checked out.
        let r = "/Users/kowalski/Projects/done-it-ai";
        if !std::path::Path::new(r).join(".git").exists() {
            return;
        }
        let mut g: Vec<String> = collect_commits_gix(r, 5000)
            .unwrap()
            .into_iter()
            .map(|c| c.sha)
            .collect();
        let mut c: Vec<String> = collect_commits_cli(r, 5000)
            .unwrap()
            .into_iter()
            .map(|c| c.sha)
            .collect();
        assert!(!g.is_empty(), "gix returned no commits");
        g.sort();
        c.sort();
        assert_eq!(g, c, "gix and cli commit sets differ");
    }

    #[test]
    fn merge_opens_a_second_lane_then_converges() {
        // m (merge of a,b); a and b both fork from base. newest first: m, a, b, base
        let rows = layout(vec![
            c("m", &["a", "b"]),
            c("a", &["base"]),
            c("b", &["base"]),
            c("base", &[]),
        ]);
        let cols: Vec<u32> = rows.iter().map(|r| r.column).collect();
        // The merge spawns a second lane, so some commit lands in column 1.
        assert!(cols.contains(&1), "merge should use a 2nd lane: {cols:?}");
        // The merge commit has two outgoing edges (to both parents).
        assert_eq!(rows[0].edges.len(), 2);
        // History reconverges: base is back in column 0.
        assert_eq!(rows.last().unwrap().column, 0);
    }
}
