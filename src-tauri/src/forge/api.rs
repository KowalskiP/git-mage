//! Forge REST clients (SPEC §M6). Fetches open pull/merge requests and issues
//! from GitHub, GitLab and Bitbucket. JSON→model mapping is factored into pure
//! functions so it can be unit-tested without the network.

use reqwest::RequestBuilder;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::forge::{Provider, RepoRef};
use crate::model::{ForgeIssue, ForgePull};

fn client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent("GitMage")
        .build()
        .map_err(|e| AppError::Msg(format!("http: {e}")))
}

async fn get_json(req: RequestBuilder) -> AppResult<Value> {
    let resp = req.send().await.map_err(|e| AppError::Msg(format!("request: {e}")))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| AppError::Msg(format!("read: {e}")))?;
    if !status.is_success() {
        let msg = match status.as_u16() {
            401 | 403 => "unauthorized — check your access token and its scopes".to_string(),
            404 => "not found — repo missing, private, or feature disabled".to_string(),
            _ => format!("{status} — {}", text.chars().take(200).collect::<String>()),
        };
        return Err(AppError::Msg(msg));
    }
    serde_json::from_str(&text).map_err(|e| AppError::Msg(format!("parse: {e}")))
}

// ---- small Value accessors ----

fn s(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}
fn i(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(Value::as_i64).unwrap_or(0)
}
fn b(v: &Value, key: &str) -> bool {
    v.get(key).and_then(Value::as_bool).unwrap_or(false)
}
/// Nested string lookup, e.g. path(v, &["author", "login"]).
fn path(v: &Value, keys: &[&str]) -> String {
    let mut cur = v;
    for k in keys {
        match cur.get(k) {
            Some(next) => cur = next,
            None => return String::new(),
        }
    }
    cur.as_str().unwrap_or("").to_string()
}

fn as_array(v: &Value) -> Vec<Value> {
    v.as_array().cloned().unwrap_or_default()
}
/// Bitbucket/GitLab paginate under a "values" key; GitHub returns a bare array.
fn list(v: &Value) -> Vec<Value> {
    if let Some(values) = v.get("values") {
        as_array(values)
    } else {
        as_array(v)
    }
}

// ---- GitHub ----

fn gh_pull(v: &Value) -> ForgePull {
    ForgePull {
        number: i(v, "number"),
        title: s(v, "title"),
        author: path(v, &["user", "login"]),
        state: if v.get("merged_at").map(|m| !m.is_null()).unwrap_or(false) {
            "merged".into()
        } else {
            s(v, "state")
        },
        draft: b(v, "draft"),
        url: s(v, "html_url"),
        source: path(v, &["head", "ref"]),
        target: path(v, &["base", "ref"]),
        updated: s(v, "updated_at"),
    }
}

fn gh_issue(v: &Value) -> ForgeIssue {
    ForgeIssue {
        number: i(v, "number"),
        title: s(v, "title"),
        author: path(v, &["user", "login"]),
        state: s(v, "state"),
        url: s(v, "html_url"),
        comments: i(v, "comments"),
        updated: s(v, "updated_at"),
    }
}

// ---- GitLab ----

fn gl_state(raw: &str) -> String {
    match raw {
        "opened" => "open".into(),
        other => other.into(),
    }
}

fn gl_pull(v: &Value) -> ForgePull {
    ForgePull {
        number: i(v, "iid"),
        title: s(v, "title"),
        author: path(v, &["author", "username"]),
        state: gl_state(&s(v, "state")),
        draft: b(v, "draft"),
        url: s(v, "web_url"),
        source: s(v, "source_branch"),
        target: s(v, "target_branch"),
        updated: s(v, "updated_at"),
    }
}

fn gl_issue(v: &Value) -> ForgeIssue {
    ForgeIssue {
        number: i(v, "iid"),
        title: s(v, "title"),
        author: path(v, &["author", "username"]),
        state: gl_state(&s(v, "state")),
        url: s(v, "web_url"),
        comments: i(v, "user_notes_count"),
        updated: s(v, "updated_at"),
    }
}

// ---- Bitbucket ----

fn bb_state(raw: &str) -> String {
    match raw {
        "OPEN" => "open".into(),
        "MERGED" => "merged".into(),
        "DECLINED" => "declined".into(),
        "SUPERSEDED" => "closed".into(),
        "new" | "open" => "open".into(),
        "resolved" | "closed" => "closed".into(),
        other => other.to_lowercase(),
    }
}

fn bb_pull(v: &Value) -> ForgePull {
    ForgePull {
        number: i(v, "id"),
        title: s(v, "title"),
        author: path(v, &["author", "display_name"]),
        state: bb_state(&s(v, "state")),
        draft: b(v, "draft"),
        url: path(v, &["links", "html", "href"]),
        source: path(v, &["source", "branch", "name"]),
        target: path(v, &["destination", "branch", "name"]),
        updated: s(v, "updated_on"),
    }
}

fn bb_issue(v: &Value) -> ForgeIssue {
    ForgeIssue {
        number: i(v, "id"),
        title: s(v, "title"),
        author: path(v, &["reporter", "display_name"]),
        state: bb_state(&s(v, "state")),
        url: path(v, &["links", "html", "href"]),
        comments: 0,
        updated: s(v, "updated_on"),
    }
}

// ---- dispatch ----

/// Open pull/merge requests for the repo.
pub async fn fetch_pulls(rr: &RepoRef, token: &str) -> AppResult<Vec<ForgePull>> {
    let c = client()?;
    let json = match rr.provider {
        Provider::GitHub => {
            let url = format!("https://api.github.com/repos/{}/pulls?state=open&per_page=50", rr.full_path());
            get_json(c.get(url).bearer_auth(token).header("Accept", "application/vnd.github+json")).await?
        }
        Provider::GitLab => {
            let url = format!(
                "https://{}/api/v4/projects/{}/merge_requests?state=opened&per_page=50",
                rr.host,
                urlencode(&rr.full_path())
            );
            get_json(c.get(url).bearer_auth(token)).await?
        }
        Provider::Bitbucket => {
            let url = format!(
                "https://api.bitbucket.org/2.0/repositories/{}/pullrequests?state=OPEN&pagelen=50",
                rr.full_path()
            );
            get_json(c.get(url).bearer_auth(token)).await?
        }
    };
    let map = match rr.provider {
        Provider::GitHub => gh_pull,
        Provider::GitLab => gl_pull,
        Provider::Bitbucket => bb_pull,
    };
    Ok(list(&json).iter().map(map).collect())
}

/// Open issues for the repo.
pub async fn fetch_issues(rr: &RepoRef, token: &str) -> AppResult<Vec<ForgeIssue>> {
    let c = client()?;
    match rr.provider {
        Provider::GitHub => {
            let url = format!("https://api.github.com/repos/{}/issues?state=open&per_page=50", rr.full_path());
            let json = get_json(c.get(url).bearer_auth(token).header("Accept", "application/vnd.github+json")).await?;
            // GitHub's issues endpoint includes PRs; drop those.
            Ok(list(&json)
                .iter()
                .filter(|v| v.get("pull_request").is_none())
                .map(gh_issue)
                .collect())
        }
        Provider::GitLab => {
            let url = format!(
                "https://{}/api/v4/projects/{}/issues?state=opened&per_page=50",
                rr.host,
                urlencode(&rr.full_path())
            );
            let json = get_json(c.get(url).bearer_auth(token)).await?;
            Ok(list(&json).iter().map(gl_issue).collect())
        }
        Provider::Bitbucket => {
            let url = format!(
                "https://api.bitbucket.org/2.0/repositories/{}/issues?pagelen=50",
                rr.full_path()
            );
            let json = get_json(c.get(url).bearer_auth(token)).await?;
            Ok(list(&json).iter().map(bb_issue).collect())
        }
    }
}

/// Minimal percent-encoding for a GitLab project path ("/" → "%2F").
fn urlencode(s: &str) -> String {
    s.replace('/', "%2F")
}

// ---- create pull/merge request ----

/// Endpoint + JSON body for creating a PR/MR — pure so it's unit-testable.
pub struct PullSpec {
    pub url: String,
    pub body: Value,
}

/// Build the create-PR request for `rr` (source → target branch).
pub fn pull_request_spec(
    rr: &RepoRef,
    title: &str,
    body: &str,
    source: &str,
    target: &str,
) -> PullSpec {
    match rr.provider {
        Provider::GitHub => PullSpec {
            url: format!("https://api.github.com/repos/{}/pulls", rr.full_path()),
            body: serde_json::json!({ "title": title, "head": source, "base": target, "body": body }),
        },
        Provider::GitLab => PullSpec {
            url: format!(
                "https://{}/api/v4/projects/{}/merge_requests",
                rr.host,
                urlencode(&rr.full_path())
            ),
            body: serde_json::json!({
                "source_branch": source, "target_branch": target,
                "title": title, "description": body
            }),
        },
        Provider::Bitbucket => PullSpec {
            url: format!(
                "https://api.bitbucket.org/2.0/repositories/{}/pullrequests",
                rr.full_path()
            ),
            body: serde_json::json!({
                "title": title, "description": body,
                "source": { "branch": { "name": source } },
                "destination": { "branch": { "name": target } }
            }),
        },
    }
}

/// Web URL of the created PR from the provider's JSON response.
fn created_pull_url(provider: Provider, v: &Value) -> String {
    match provider {
        Provider::GitHub => s(v, "html_url"),
        Provider::GitLab => s(v, "web_url"),
        Provider::Bitbucket => path(v, &["links", "html", "href"]),
    }
}

/// Create a PR/MR and return its web URL.
pub async fn create_pull(
    rr: &RepoRef,
    token: &str,
    title: &str,
    body: &str,
    source: &str,
    target: &str,
) -> AppResult<String> {
    let c = client()?;
    let spec = pull_request_spec(rr, title, body, source, target);
    let mut req = c.post(&spec.url).bearer_auth(token).json(&spec.body);
    if rr.provider == Provider::GitHub {
        req = req.header("Accept", "application/vnd.github+json");
    }
    // get_json accepts any 2xx (POST create returns 201).
    let json = get_json(req).await?;
    Ok(created_pull_url(rr.provider, &json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_github_pull_and_marks_merged() {
        let open = json!({
            "number": 7, "title": "Add feature", "state": "open", "draft": true,
            "html_url": "https://github.com/o/r/pull/7", "updated_at": "2026-01-02T03:04:05Z",
            "user": {"login": "alice"}, "head": {"ref": "feat"}, "base": {"ref": "main"},
            "merged_at": null
        });
        let p = gh_pull(&open);
        assert_eq!(p.number, 7);
        assert_eq!(p.author, "alice");
        assert_eq!(p.state, "open");
        assert!(p.draft);
        assert_eq!(p.source, "feat");
        assert_eq!(p.target, "main");

        let merged = json!({"number": 8, "state": "closed", "merged_at": "2026-01-03T00:00:00Z"});
        assert_eq!(gh_pull(&merged).state, "merged");
    }

    #[test]
    fn github_issues_exclude_prs() {
        let payload = json!([
            {"number": 1, "title": "bug", "user": {"login": "bob"}, "state": "open", "comments": 2},
            {"number": 2, "title": "a pr", "user": {"login": "x"}, "pull_request": {"url": "..."}}
        ]);
        let issues: Vec<_> = list(&payload)
            .iter()
            .filter(|v| v.get("pull_request").is_none())
            .map(gh_issue)
            .collect();
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].number, 1);
        assert_eq!(issues[0].comments, 2);
    }

    #[test]
    fn maps_gitlab_mr_state_and_iid() {
        let v = json!({
            "iid": 12, "title": "MR", "state": "opened", "draft": false,
            "web_url": "https://gitlab.com/g/p/-/merge_requests/12",
            "author": {"username": "carol"}, "source_branch": "x", "target_branch": "main",
            "updated_at": "2026-01-01T00:00:00Z"
        });
        let p = gl_pull(&v);
        assert_eq!(p.number, 12);
        assert_eq!(p.state, "open", "opened normalised to open");
        assert_eq!(p.author, "carol");
    }

    #[test]
    fn maps_bitbucket_pull_nested_links() {
        let v = json!({
            "id": 3, "title": "BB PR", "state": "MERGED",
            "author": {"display_name": "Dave"},
            "links": {"html": {"href": "https://bitbucket.org/w/r/pull-requests/3"}},
            "source": {"branch": {"name": "feature"}},
            "destination": {"branch": {"name": "develop"}},
            "updated_on": "2026-01-04T00:00:00Z"
        });
        let p = bb_pull(&v);
        assert_eq!(p.number, 3);
        assert_eq!(p.state, "merged");
        assert_eq!(p.author, "Dave");
        assert_eq!(p.url, "https://bitbucket.org/w/r/pull-requests/3");
        assert_eq!(p.source, "feature");
        assert_eq!(p.target, "develop");
    }

    #[test]
    fn list_handles_values_wrapper_and_bare_array() {
        assert_eq!(list(&json!({"values": [1, 2, 3]})).len(), 3);
        assert_eq!(list(&json!([1, 2])).len(), 2);
        assert_eq!(list(&json!({})).len(), 0);
    }

    #[test]
    fn gitlab_path_is_percent_encoded() {
        assert_eq!(urlencode("group/sub/project"), "group%2Fsub%2Fproject");
    }

    fn rr(provider: Provider) -> RepoRef {
        RepoRef {
            provider,
            host: "gitlab.com".into(),
            owner: "grp".into(),
            repo: "proj".into(),
        }
    }

    #[test]
    fn github_pull_spec_uses_head_base() {
        let spec = pull_request_spec(&rr(Provider::GitHub), "T", "B", "feat", "main");
        assert_eq!(spec.url, "https://api.github.com/repos/grp/proj/pulls");
        assert_eq!(spec.body["head"], "feat");
        assert_eq!(spec.body["base"], "main");
        assert_eq!(spec.body["title"], "T");
    }

    #[test]
    fn gitlab_mr_spec_encodes_path_and_uses_branch_fields() {
        let spec = pull_request_spec(&rr(Provider::GitLab), "T", "B", "feat", "main");
        assert_eq!(spec.url, "https://gitlab.com/api/v4/projects/grp%2Fproj/merge_requests");
        assert_eq!(spec.body["source_branch"], "feat");
        assert_eq!(spec.body["target_branch"], "main");
    }

    #[test]
    fn bitbucket_pr_spec_nests_branches() {
        let spec = pull_request_spec(&rr(Provider::Bitbucket), "T", "B", "feat", "main");
        assert!(spec.url.ends_with("/repositories/grp/proj/pullrequests"));
        assert_eq!(spec.body["source"]["branch"]["name"], "feat");
        assert_eq!(spec.body["destination"]["branch"]["name"], "main");
    }

    #[test]
    fn created_pull_url_per_provider() {
        assert_eq!(
            created_pull_url(Provider::GitHub, &json!({"html_url": "https://gh/pr/1"})),
            "https://gh/pr/1"
        );
        assert_eq!(
            created_pull_url(Provider::GitLab, &json!({"web_url": "https://gl/mr/1"})),
            "https://gl/mr/1"
        );
        assert_eq!(
            created_pull_url(
                Provider::Bitbucket,
                &json!({"links": {"html": {"href": "https://bb/pr/1"}}})
            ),
            "https://bb/pr/1"
        );
    }
}
