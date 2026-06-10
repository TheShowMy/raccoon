use anyhow::{Context, Result};
use std::path::Path;
use tokio::process::Command;

const GH_BIN: &str = "gh";
const CURL_BIN: &str = "curl";

#[derive(Debug)]
pub struct PrResult {
    pub pr_url: String,
    pub pr_number: u64,
}

// ===== 分支操作 =====

/// 基于目标分支创建 feature 分支
pub async fn create_feature_branch(
    project_path: &Path,
    job_id: i64,
    base_branch: &str,
) -> Result<String> {
    let branch = format!("raccoon/job-{}", job_id);

    // 先 checkout 到目标分支并拉取最新代码
    let checkout = Command::new("git")
        .args(["checkout", base_branch])
        .current_dir(project_path)
        .output()
        .await
        .context("git checkout 目标分支失败")?;
    if !checkout.status.success() {
        anyhow::bail!(
            "checkout {} 失败: {}",
            base_branch,
            String::from_utf8_lossy(&checkout.stderr).trim()
        );
    }

    let pull = Command::new("git")
        .args(["pull", "origin", base_branch])
        .current_dir(project_path)
        .output()
        .await
        .context("git pull 目标分支失败")?;
    // pull 失败不一定是错误（可能没有远程或网络问题），记录但不阻断
    if !pull.status.success() {
        tracing::warn!(
            "git pull 失败: {}",
            String::from_utf8_lossy(&pull.stderr).trim()
        );
    }

    // 创建并切换到新分支
    let output = Command::new("git")
        .args(["checkout", "-b", &branch])
        .current_dir(project_path)
        .output()
        .await
        .context("创建 feature 分支失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "创建分支 {} 失败: {}",
            branch,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    Ok(branch)
}

// ===== Diff 与提交 =====

/// 将 diff 应用到当前分支
/// 先尝试 --3way（处理修改的文件），失败后尝试普通 apply（处理新文件）
pub async fn apply_diff_to_branch(project_path: &Path, _branch: &str, diff: &str) -> Result<()> {
    async fn run_git_apply(
        project_path: &Path,
        diff: &str,
        extra_args: &[&str],
    ) -> Result<std::process::Output> {
        let mut child = Command::new("git")
            .args(["apply"])
            .args(extra_args)
            .arg("-")
            .current_dir(project_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("启动 git apply 失败")?;

        if let Some(stdin) = child.stdin.take() {
            let mut stdin = stdin;
            tokio::io::AsyncWriteExt::write_all(&mut stdin, diff.as_bytes())
                .await
                .context("写入 diff 失败")?;
        }

        child
            .wait_with_output()
            .await
            .context("等待 git apply 失败")
    }

    // 先尝试 --3way（对已有文件的修改更友好）
    match run_git_apply(project_path, diff, &["--3way"]).await {
        Ok(output) if output.status.success() => return Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if stderr.contains("does not exist in index")
                || stderr.contains("cannot read the current contents")
            {
                tracing::info!("--3way 对新文件失败，回退到普通 git apply");
            } else {
                anyhow::bail!("git apply --3way 失败: {}", stderr.trim());
            }
        }
        Err(e) => return Err(e),
    }

    // 回退到普通 apply（支持新文件）
    let output = run_git_apply(project_path, diff, &[]).await?;
    if !output.status.success() {
        anyhow::bail!(
            "git apply 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

/// 提交所有变更
pub async fn commit_changes(project_path: &Path, _branch: &str, message: &str) -> Result<()> {
    // 配置 git user（如果未配置）
    let _ = Command::new("git")
        .args(["config", "user.email"])
        .current_dir(project_path)
        .output()
        .await;

    // 添加所有变更
    let add = Command::new("git")
        .args(["add", "-A"])
        .current_dir(project_path)
        .output()
        .await
        .context("git add 失败")?;
    if !add.status.success() {
        anyhow::bail!(
            "git add 失败: {}",
            String::from_utf8_lossy(&add.stderr).trim()
        );
    }

    // 提交
    let output = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(project_path)
        .output()
        .await
        .context("git commit 失败")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // 如果没有变更要提交，不是错误
        if stderr.contains("nothing to commit") || stderr.contains("nothing added") {
            return Ok(());
        }
        anyhow::bail!("git commit 失败: {}", stderr.trim());
    }
    Ok(())
}

// ===== 推送 =====

/// 推送分支到远程
pub async fn push_branch(project_path: &Path, branch: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["push", "-u", "origin", branch])
        .current_dir(project_path)
        .output()
        .await
        .context("git push 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "git push 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

// ===== PR 操作 =====

/// 创建 PR
pub async fn create_pull_request(
    project_path: &Path,
    branch: &str,
    base_branch: &str,
    title: &str,
    body: &str,
    github_token: Option<&str>,
) -> Result<PrResult> {
    // 优先使用 gh CLI
    if gh_available().await {
        return create_pr_via_gh(project_path, branch, base_branch, title, body).await;
    }

    // 回退到 GitHub API
    create_pr_via_api(project_path, branch, base_branch, title, body, github_token).await
}

async fn create_pr_via_gh(
    project_path: &Path,
    branch: &str,
    base_branch: &str,
    title: &str,
    body: &str,
) -> Result<PrResult> {
    let output = Command::new(GH_BIN)
        .args([
            "pr",
            "create",
            "--title",
            title,
            "--body",
            body,
            "--base",
            base_branch,
            "--head",
            branch,
            "--json",
            "url,number",
        ])
        .current_dir(project_path)
        .output()
        .await
        .context("gh pr create 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "创建 PR 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let (url, number) = parse_gh_pr_output(&stdout)?;

    Ok(PrResult {
        pr_url: url,
        pr_number: number,
    })
}

async fn create_pr_via_api(
    project_path: &Path,
    branch: &str,
    base_branch: &str,
    title: &str,
    body: &str,
    github_token: Option<&str>,
) -> Result<PrResult> {
    let token = github_token.context("创建 PR 需要 GitHub Token（gh CLI 未安装）")?;
    let (owner, repo) = parse_repo_from_remote(project_path).await?;

    let payload = serde_json::json!({
        "title": title,
        "body": body,
        "head": branch,
        "base": base_branch,
    });

    let output = Command::new(CURL_BIN)
        .args([
            "-s",
            "-X",
            "POST",
            "-H",
            &format!("Authorization: Bearer {}", token),
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "X-GitHub-Api-Version: 2022-11-28",
            &format!("https://api.github.com/repos/{}/{}/pulls", owner, repo),
            "-d",
            &payload.to_string(),
        ])
        .output()
        .await
        .context("curl 调用 GitHub API 失败")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || stdout.contains("\"message\"") {
        anyhow::bail!("GitHub API 创建 PR 失败: {}", stdout.trim());
    }

    let resp: serde_json::Value = serde_json::from_str(&stdout)
        .with_context(|| format!("解析 GitHub API 响应失败: {}", stdout))?;

    let url = resp["html_url"]
        .as_str()
        .context("GitHub API 响应缺少 html_url")?
        .to_string();
    let number = resp["number"]
        .as_u64()
        .context("GitHub API 响应缺少 number")?;

    Ok(PrResult {
        pr_url: url,
        pr_number: number,
    })
}

/// 合并 PR
pub async fn merge_pull_request(
    project_path: &Path,
    pr_number: u64,
    merge_strategy: &str,
    github_token: Option<&str>,
) -> Result<String> {
    if gh_available().await {
        return merge_pr_via_gh(project_path, pr_number, merge_strategy).await;
    }

    merge_pr_via_api(project_path, pr_number, merge_strategy, github_token).await
}

async fn merge_pr_via_gh(
    project_path: &Path,
    pr_number: u64,
    merge_strategy: &str,
) -> Result<String> {
    let method = match merge_strategy {
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => "--squash",
    };

    let output = Command::new(GH_BIN)
        .args([
            "pr",
            "merge",
            &pr_number.to_string(),
            method,
            "--delete-branch",
            "--auto",
        ])
        .current_dir(project_path)
        .output()
        .await
        .context("gh pr merge 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "合并 PR #{} 失败: {}",
            pr_number,
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    // 获取 merge commit
    let log = Command::new("git")
        .args(["log", "-1", "--format=%H"])
        .current_dir(project_path)
        .output()
        .await
        .context("获取 merge commit 失败")?;

    Ok(String::from_utf8_lossy(&log.stdout).trim().to_string())
}

async fn merge_pr_via_api(
    project_path: &Path,
    pr_number: u64,
    merge_strategy: &str,
    github_token: Option<&str>,
) -> Result<String> {
    let token = github_token.context("合并 PR 需要 GitHub Token（gh CLI 未安装）")?;
    let (owner, repo) = parse_repo_from_remote(project_path).await?;

    let method = match merge_strategy {
        "merge" => "merge",
        "rebase" => "rebase",
        _ => "squash",
    };

    let payload = serde_json::json!({
        "merge_method": method,
    });

    let output = Command::new(CURL_BIN)
        .args([
            "-s",
            "-X",
            "PUT",
            "-H",
            &format!("Authorization: Bearer {}", token),
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "X-GitHub-Api-Version: 2022-11-28",
            &format!(
                "https://api.github.com/repos/{}/{}/pulls/{}/merge",
                owner, repo, pr_number
            ),
            "-d",
            &payload.to_string(),
        ])
        .output()
        .await
        .context("curl 调用 GitHub API 合并失败")?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || stdout.contains("\"message\"") {
        anyhow::bail!("GitHub API 合并 PR 失败: {}", stdout.trim());
    }

    let resp: serde_json::Value = serde_json::from_str(&stdout)
        .with_context(|| format!("解析 GitHub API 响应失败: {}", stdout))?;

    let sha = resp["sha"]
        .as_str()
        .context("GitHub API 响应缺少 merge commit sha")?
        .to_string();

    // 删除远程分支
    let _ = Command::new("git")
        .args([
            "push",
            "origin",
            "--delete",
            &format!("raccoon/job-{}", pr_number),
        ])
        .current_dir(project_path)
        .output()
        .await;

    Ok(sha)
}

// ===== 工具函数 =====

/// 检查 gh CLI 是否可用
async fn gh_available() -> bool {
    Command::new(GH_BIN)
        .args(["--version"])
        .output()
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// 解析远程仓库 owner/repo
pub async fn parse_repo_from_remote(project_path: &Path) -> Result<(String, String)> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(project_path)
        .output()
        .await
        .context("获取 remote url 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "获取 remote url 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    parse_repo_from_url(&url)
}

fn parse_repo_from_url(url: &str) -> Result<(String, String)> {
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    if let Some(ssh_part) = url.strip_prefix("git@github.com:") {
        let rest = ssh_part.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    if let Some(host_part) = url.strip_prefix("https://github.com/") {
        let rest = host_part.trim_end_matches(".git");
        let parts: Vec<&str> = rest.splitn(2, '/').collect();
        if parts.len() == 2 {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
    }

    anyhow::bail!("无法解析远程仓库 URL: {}", url)
}

fn parse_gh_pr_output(stdout: &str) -> Result<(String, u64)> {
    let val: serde_json::Value = serde_json::from_str(stdout)
        .with_context(|| format!("解析 gh pr create 输出失败: {}", stdout))?;

    let url = val["url"]
        .as_str()
        .context("gh pr create 输出缺少 url")?
        .to_string();
    // gh 返回的 url 是 API URL，转换为 web URL
    let web_url = url
        .replace("https://api.github.com/repos/", "https://github.com/")
        .replace("/pulls/", "/pull/");

    let number = val["number"]
        .as_u64()
        .context("gh pr create 输出缺少 number")?;

    Ok((web_url, number))
}

/// 清理本地分支
pub async fn cleanup_branch(project_path: &Path, branch: &str) -> Result<()> {
    // 先切到 main
    let _ = Command::new("git")
        .args(["checkout", "main"])
        .current_dir(project_path)
        .output()
        .await;

    // 删除本地分支
    let _ = Command::new("git")
        .args(["branch", "-D", branch])
        .current_dir(project_path)
        .output()
        .await;

    // 删除远程分支
    let _ = Command::new("git")
        .args(["push", "origin", "--delete", branch])
        .current_dir(project_path)
        .output()
        .await;

    Ok(())
}
