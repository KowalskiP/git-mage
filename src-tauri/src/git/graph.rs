//! Commit-graph data + lane layout (SPEC §9, killer feature).
//!
//! M1: commit data is sourced from `git log` (robust, fast). The lane-assignment
//! algorithm — the real engineering value — is git-engine-agnostic and lives here.
//! A later step swaps the data source to `gix` revwalk without touching the layout.

use std::process::Command;
use crate::git::cmd::HideConsole;

use crate::error::{AppError, AppResult};
use crate::model::{GraphEdge, GraphPage, GraphRow};

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

/// Load the first page of the commit graph (up to `limit` commits) and lay it
/// out from scratch. Prepends the working-directory (WIP) node when dirty.
///
/// `refs` narrows the graph to a chosen set of branches (GitKraken-style
/// solo/pin) — `None` walks every ref (`--all`).
pub fn graph(path: &str, limit: usize, refs: Option<Vec<String>>) -> AppResult<GraphPage> {
    graph_page(path, 0, limit, Vec::new(), refs)
}

/// Load a later page: `skip` real commits in, up to `limit` more, resuming the
/// lane layout from `lanes` (the cursor returned by the previous page). No WIP
/// node — that only belongs at the very top (`skip == 0`, via `graph`).
pub fn graph_more(
    path: &str,
    skip: usize,
    limit: usize,
    lanes: Vec<Option<String>>,
    refs: Option<Vec<String>>,
) -> AppResult<GraphPage> {
    graph_page(path, skip, limit, lanes, refs)
}

/// Shared paging core: collect the window `[skip, skip + limit)` of commits and
/// continue the lane sweep from `lanes_in`. The WIP node is prepended only on
/// the first page so it never re-appears mid-history.
fn graph_page(
    path: &str,
    skip: usize,
    limit: usize,
    lanes_in: Vec<Option<String>>,
    refs: Option<Vec<String>>,
) -> AppResult<GraphPage> {
    // `git log --topo-order` keeps each branch's commits contiguous so lanes open
    // and close quickly instead of running down as a "wall" of parallel lines
    // when a repo has many branches (issue #2). Topo order needs the CLI (gix's
    // rev-walk only offers breadth-first / commit-time), and one collector keeps
    // page ordering consistent for the resumable lane cursor.
    let mut commits = collect_commits_cli(path, skip, limit, refs.as_deref())?;
    // Fewer commits than the cap → the history is exhausted after this page.
    let at_end = commits.len() < limit;

    // Prepend a synthetic working-directory node when the tree is dirty, so the
    // graph shows uncommitted changes as a node off HEAD (GitKraken-style).
    if skip == 0 {
        if let Some(wip) = working_dir_node(path) {
            commits.insert(0, wip);
        }
    }

    let Layout { rows, lanes } = layout_from(commits, lanes_in);
    Ok(GraphPage { rows, lanes, at_end })
}

#[cfg(any())] // retired: gix rev-walk can't produce `--topo-order` (see graph_page)
fn collect_commits_gix(path: &str, skip: usize, limit: usize) -> AppResult<Vec<Commit>> {
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
    let mut skipped = 0usize;
    for info in walk {
        if commits.len() >= limit {
            break;
        }
        let info = info.map_err(|e| AppError::Git(format!("gix walk: {e}")))?;
        if skipped < skip {
            skipped += 1;
            continue;
        }
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

/// Commit data via `git log --topo-order`. `refs` (branch/tag names) narrows the
/// walk to a chosen set of branches; `None`/empty walks everything (`--all`).
fn collect_commits_cli(
    path: &str,
    skip: usize,
    limit: usize,
    refs: Option<&[String]>,
) -> AppResult<Vec<Commit>> {
    let fmt = format!("{US}%H{US}%P{US}%an{US}%at{US}%D{US}%s{RS}");
    let skip_arg = format!("--skip={skip}");
    let max_arg = format!("--max-count={limit}");
    let fmt_arg = format!("--format={fmt}");
    let mut cmd = Command::new("git");
    cmd.hide_console().current_dir(path).args([
        "-c",
        "log.showSignature=false",
        "log",
        "--topo-order",
        &skip_arg,
        &max_arg,
        &fmt_arg,
    ]);
    match refs {
        // Solo/pin: walk only the chosen refs, always anchoring HEAD so the
        // current position (and the WIP node's parent) stays in the graph.
        // `--ignore-missing` tolerates a pinned branch that was since deleted
        // (skip it instead of erroring); trailing `--` disambiguates refs/paths.
        Some(list) if !list.is_empty() => {
            cmd.arg("--ignore-missing");
            cmd.arg("HEAD");
            cmd.args(list);
            cmd.arg("--");
        }
        _ => {
            cmd.arg("--all");
        }
    }
    let out = cmd
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
    let status = Command::new("git").hide_console()
        .current_dir(path)
        .args(["status", "--porcelain"])
        .output()
        .ok()?;
    if !status.status.success() || status.stdout.is_empty() {
        return None;
    }
    let head = Command::new("git").hide_console()
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

/// A laid-out page: the rows plus the terminal lane state (the cursor a later
/// page resumes from). See [`GraphPage`] for the wire form.
struct Layout {
    rows: Vec<GraphRow>,
    lanes: Vec<Option<String>>,
}

/// Lane-assignment sweep. `lanes[c]` holds the sha each column is currently
/// routing toward (the next commit expected in that column). `lanes_in` seeds
/// the sweep so a later page continues exactly where the previous one stopped;
/// pass an empty vec for the first page. Returns the rows and the final lane
/// vector to hand to the next page.
fn layout_from(commits: Vec<Commit>, lanes_in: Vec<Option<String>>) -> Layout {
    let mut lanes: Vec<Option<String>> = lanes_in;
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

    Layout { rows, lanes }
}

/// Lay out a page from scratch (empty seed lanes). Kept for the unit tests.
#[cfg(test)]
fn layout(commits: Vec<Commit>) -> Vec<GraphRow> {
    layout_from(commits, Vec::new()).rows
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
    fn graph_respects_the_limit() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("gitmage-graphlimit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        let git = |args: &[&str]| {
            assert!(
                Command::new("git").hide_console().current_dir(&dir).args(args).output().unwrap().status.success(),
                "git {args:?}"
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        for i in 0..12 {
            std::fs::write(dir.join("f.txt"), format!("{i}\n")).unwrap();
            git(&["add", "."]);
            git(&["commit", "-q", "-m", &format!("c{i}")]);
        }
        let page = graph(p, 5, None).unwrap();
        let commits = page.rows.iter().filter(|r| !r.wip).count();
        assert_eq!(commits, 5, "graph must cap at the requested limit");
        assert!(!page.at_end, "12 commits, limit 5 → more pages remain");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn ref_filter_narrows_the_graph_to_chosen_branches() {
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("gitmage-graphfilter-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        let git = |args: &[&str]| {
            assert!(
                Command::new("git").hide_console().current_dir(&dir).args(args).output().unwrap().status.success(),
                "git {args:?}"
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        let commit = |git: &dyn Fn(&[&str]), file: &str, msg: &str| {
            std::fs::write(dir.join(file), msg).unwrap();
            git(&["add", "."]);
            git(&["commit", "-q", "-m", msg]);
        };
        // main: c0..c1, branch feature at c1, feature: f0..f1, then main diverges: c2.
        commit(&git, "f.txt", "c0");
        commit(&git, "f.txt", "c1");
        git(&["checkout", "-q", "-b", "feature"]);
        commit(&git, "g.txt", "f0");
        commit(&git, "g.txt", "f1");
        git(&["checkout", "-q", "main"]);
        commit(&git, "f.txt", "c2");
        // Currently on `main`; solo `feature` → HEAD(main) is anchored, so we see
        // main's tip too, but the filter must exclude nothing feature can reach.
        // Solo `main` (while on main) must exclude feature's unique commits.
        let solo_main = graph(p, 100, Some(vec!["main".to_string()])).unwrap();
        assert!(solo_main.rows.iter().any(|r| r.summary == "c2"), "main tip present");
        assert!(
            !solo_main.rows.iter().any(|r| r.summary == "f1"),
            "feature's unique commits must be filtered out of a main-only graph"
        );
        // Unfiltered walks everything.
        let all = graph(p, 100, None).unwrap();
        assert!(all.rows.iter().any(|r| r.summary == "f1"), "all-refs graph includes feature");
        assert!(all.rows.iter().any(|r| r.summary == "c2"), "all-refs graph includes main");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn paging_reassembles_the_full_graph() {
        // Appending pages (resuming the lane cursor) must produce byte-for-byte
        // the same rows as one full load — the core append-only invariant.
        use std::process::Command;
        let dir = std::env::temp_dir().join(format!("gitmage-graphpage-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.to_str().unwrap();
        let git = |args: &[&str]| {
            assert!(
                Command::new("git").hide_console().current_dir(&dir).args(args).output().unwrap().status.success(),
                "git {args:?}"
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&["config", "user.email", "t@t"]);
        git(&["config", "user.name", "t"]);
        // Build some branching history so lanes span the page seams.
        for i in 0..8 {
            std::fs::write(dir.join("f.txt"), format!("{i}\n")).unwrap();
            git(&["add", "."]);
            git(&["commit", "-q", "-m", &format!("c{i}")]);
        }
        git(&["checkout", "-q", "-b", "side", "HEAD~4"]);
        for i in 0..4 {
            std::fs::write(dir.join("s.txt"), format!("{i}\n")).unwrap();
            git(&["add", "."]);
            git(&["commit", "-q", "-m", &format!("s{i}")]);
        }
        git(&["checkout", "-q", "main"]);
        git(&["merge", "-q", "--no-ff", "-m", "merge side", "side"]);

        // Clean tree so neither path grows a WIP node (keeps the comparison exact).
        let full = graph(p, 1000, None).unwrap();
        let total = full.rows.len();
        assert!(total >= 13, "expected the merged history, got {total}");
        assert!(full.at_end);

        // Reassemble via small pages, carrying the lane cursor across each seam.
        let mut paged: Vec<GraphRow> = Vec::new();
        let mut lanes: Vec<Option<String>> = Vec::new();
        let mut skip = 0usize;
        loop {
            let page = graph_more(p, skip, 3, lanes.clone(), None).unwrap();
            skip += page.rows.len();
            lanes = page.lanes;
            let done = page.at_end;
            paged.extend(page.rows);
            if done {
                break;
            }
        }

        assert_eq!(paged.len(), total, "paged row count must match full load");
        for (a, b) in full.rows.iter().zip(paged.iter()) {
            assert_eq!(a.sha, b.sha, "row order diverged");
            assert_eq!(a.column, b.column, "column diverged at {}", a.sha);
            assert_eq!(a.color, b.color, "color diverged at {}", a.sha);
            assert_eq!(a.edges.len(), b.edges.len(), "edge count diverged at {}", a.sha);
            for (ea, eb) in a.edges.iter().zip(b.edges.iter()) {
                assert_eq!((ea.from, ea.to, ea.color), (eb.from, eb.to, eb.color));
            }
        }
        let _ = std::fs::remove_dir_all(&dir);
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
