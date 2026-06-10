use anyhow::Result;
use std::path::Path;
use tokio::process::Command;

#[derive(Debug, Default)]
pub struct CleanupReport {
    pub worktrees_deleted: usize,
    pub sessions_deleted: usize,
    pub branch_deleted: bool,
    pub errors: Vec<String>,
}

/// 清理 Job 相关的所有工作区资源
pub async fn cleanup_job_workspace(
    job_id: i64,
    workspace_dir: &Path,
    pi_session_dir: &Path,
    project_path: &Path,
    feature_branch: Option<&str>,
) -> Result<CleanupReport> {
    let mut report = CleanupReport::default();

    // 1. 删除所有 node worktrees
    let worktrees_dir = workspace_dir
        .join("worktrees")
        .join(format!("job-{job_id}"));
    if worktrees_dir.exists() {
        match tokio::fs::remove_dir_all(&worktrees_dir).await {
            Ok(()) => {
                report.worktrees_deleted += 1;
            }
            Err(e) => {
                report.errors.push(format!(
                    "删除 worktrees 目录失败: {}: {}",
                    worktrees_dir.display(),
                    e
                ));
            }
        }
    }

    // 2. 删除 worker session 目录
    let worker_session_dir = pi_session_dir.join("workers").join(format!("job-{job_id}"));
    if worker_session_dir.exists() {
        match tokio::fs::remove_dir_all(&worker_session_dir).await {
            Ok(()) => {
                report.sessions_deleted += 1;
            }
            Err(e) => {
                report.errors.push(format!(
                    "删除 worker session 目录失败: {}: {}",
                    worker_session_dir.display(),
                    e
                ));
            }
        }
    }

    // 3. 删除本地 feature 分支（如果存在）
    if let Some(branch) = feature_branch {
        // 先切换到目标分支（main 或其他）
        let checkout = Command::new("git")
            .args(["checkout", "main"])
            .current_dir(project_path)
            .output()
            .await;

        if let Err(e) = checkout {
            report.errors.push(format!("切换到 main 分支失败: {}", e));
        }

        // 删除本地分支
        let delete = Command::new("git")
            .args(["branch", "-D", branch])
            .current_dir(project_path)
            .output()
            .await;

        match delete {
            Ok(output) if output.status.success() => {
                report.branch_deleted = true;
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // 分支不存在不是错误
                if !stderr.contains("not found") {
                    report
                        .errors
                        .push(format!("删除本地分支失败: {}", stderr.trim()));
                }
            }
            Err(e) => {
                report.errors.push(format!("删除本地分支失败: {}", e));
            }
        }

        // 4. 删除远程分支（静默处理，不阻断）
        let _ = Command::new("git")
            .args(["push", "origin", "--delete", branch])
            .current_dir(project_path)
            .output()
            .await;
    }

    Ok(report)
}
