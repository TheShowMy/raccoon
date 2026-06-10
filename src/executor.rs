use anyhow::{Context, Result};
use sqlx::{Pool, Sqlite};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

use crate::db::{self, DagEdge, DagNode, TaskArtifactSeed};
use crate::pi_rpc::PiRpcClient;

const WORKER_TIMEOUT: tokio::time::Duration = tokio::time::Duration::from_secs(600);

#[derive(Debug, Clone)]
pub struct NodeExecutionUpdate {
    pub node_id: i64,
    pub status: String,
    pub message: String,
}

pub async fn execute_dag<F>(
    pool: &Pool<Sqlite>,
    job_id: i64,
    project_path: &Path,
    workspace_dir: &Path,
    pi_session_dir: &Path,
    extension_path: Option<&Path>,
    mut on_update: F,
) -> Result<()>
where
    F: FnMut(NodeExecutionUpdate) + Send,
{
    db::mark_job_executing(pool, job_id).await?;
    let mut nodes = db::get_dag_nodes(pool, job_id).await?;
    let edges = db::get_dag_edges(pool, job_id).await?;
    let order = topo_order(&nodes, &edges)?;

    for node_id in order {
        let node = nodes
            .iter()
            .find(|node| node.id == node_id)
            .cloned()
            .context("DAG 节点不存在")?;

        // 跳过已成功的节点（恢复执行时）
        if node.status == "succeeded" {
            on_update(NodeExecutionUpdate {
                node_id: node.id,
                status: "succeeded".to_string(),
                message: format!("节点 {} 已执行完成，跳过", node.title),
            });
            continue;
        }

        db::update_dag_node_status(pool, node.id, "running", None, None).await?;
        on_update(NodeExecutionUpdate {
            node_id: node.id,
            status: "running".to_string(),
            message: format!("开始执行节点：{}", node.title),
        });

        match execute_node(
            pool,
            job_id,
            project_path,
            workspace_dir,
            pi_session_dir,
            extension_path,
            &node,
        )
        .await
        {
            Ok(summary) => {
                db::update_dag_node_status(pool, node.id, "succeeded", Some(&summary), None)
                    .await?;
                on_update(NodeExecutionUpdate {
                    node_id: node.id,
                    status: "succeeded".to_string(),
                    message: summary,
                });
            }
            Err(err) => {
                let message = err.to_string();
                db::update_dag_node_status(pool, node.id, "failed", None, Some(&message)).await?;
                db::mark_job_blocked(
                    pool,
                    job_id,
                    &format!("DAG 节点执行失败：{}。原因：{}", node.title, message),
                )
                .await?;
                on_update(NodeExecutionUpdate {
                    node_id: node.id,
                    status: "failed".to_string(),
                    message,
                });
                return Ok(());
            }
        }

        nodes = db::get_dag_nodes(pool, job_id).await?;
    }

    db::mark_job_completed(pool, job_id).await?;
    Ok(())
}

async fn execute_node(
    pool: &Pool<Sqlite>,
    job_id: i64,
    project_path: &Path,
    workspace_dir: &Path,
    pi_session_dir: &Path,
    extension_path: Option<&Path>,
    node: &DagNode,
) -> Result<String> {
    let worktree_path = workspace_dir
        .join("worktrees")
        .join(format!("job-{job_id}"))
        .join(format!("node-{}", node.id));
    create_worktree(project_path, &worktree_path).await?;
    db::set_dag_node_worktree(pool, node.id, &worktree_path.to_string_lossy()).await?;

    let note = format!(
        "# {}\n\n## 执行说明\n{}\n\n## 验收标准\n{}\n\n## 目标文件\n{}\n",
        node.title,
        node.instructions,
        node.acceptance_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n"),
        if node.target_files.is_empty() {
            "- 未限定，按节点说明判断".to_string()
        } else {
            node.target_files
                .iter()
                .map(|item| format!("- {item}"))
                .collect::<Vec<_>>()
                .join("\n")
        }
    );
    db::insert_task_artifact(
        pool,
        job_id,
        TaskArtifactSeed {
            node_id: node.id,
            artifact_type: "execution_note".to_string(),
            path: Some(format!("node-{}-instructions.md", node.id)),
            content: note,
        },
    )
    .await?;

    let Some(worker) = select_worker_model(pool, &node.worker_identity).await? else {
        return Ok(format!(
            "节点已完成执行准备：{}。未配置 {} worker tier，暂未自动调用 Pi Worker。",
            node.title, node.worker_identity
        ));
    };

    run_worker(
        pool,
        job_id,
        node,
        &worker,
        &worktree_path,
        pi_session_dir,
        extension_path,
    )
    .await?;
    let diff = git_diff(&worktree_path).await?;
    if diff.trim().is_empty() {
        return Ok(format!("节点执行完成但没有产生代码 diff：{}", node.title));
    }

    db::insert_task_artifact(
        pool,
        job_id,
        TaskArtifactSeed {
            node_id: node.id,
            artifact_type: "diff".to_string(),
            path: Some(format!("node-{}.diff", node.id)),
            content: diff.clone(),
        },
    )
    .await?;
    apply_diff(project_path, &diff).await?;

    Ok(format!("节点执行完成并已合入 diff：{}", node.title))
}

async fn select_worker_model(
    pool: &Pool<Sqlite>,
    identity: &str,
) -> Result<Option<db::WorkerModelTier>> {
    let tiers = db::get_worker_model_tiers(pool).await?;
    Ok(tiers
        .into_iter()
        .filter(|tier| tier.identity == identity)
        .min_by_key(|tier| tier.tier_level))
}

async fn run_worker(
    pool: &Pool<Sqlite>,
    job_id: i64,
    node: &DagNode,
    worker: &db::WorkerModelTier,
    worktree_path: &Path,
    pi_session_dir: &Path,
    extension_path: Option<&Path>,
) -> Result<()> {
    let session_dir = pi_session_dir
        .join("workers")
        .join(format!("job-{job_id}"))
        .join(format!("node-{}", node.id));
    let client = PiRpcClient::new_with_extension(&session_dir, extension_path, Some(worktree_path))
        .await
        .context("启动 Worker Pi Agent 失败")?;
    let created = client.new_session().await.context("创建 Worker 会话失败")?;
    if created.cancelled {
        anyhow::bail!("创建 Worker 会话被取消");
    }
    client
        .set_session_name(&format!("raccoon node: {}", node.title))
        .await?;
    client.set_model(&worker.provider, &worker.model).await?;
    let thinking = db::get_task_thinking_level(pool, "coding")
        .await
        .unwrap_or_else(|_| "medium".to_string());
    client.set_thinking_level(&thinking).await?;
    client.prompt(&build_worker_prompt(node)).await?;
    client
        .wait_for_agent_end_with_events(WORKER_TIMEOUT, &mut |_| {})
        .await
        .context("等待 Worker 执行失败")?;
    let _ = client.shutdown().await;
    Ok(())
}

fn build_worker_prompt(node: &DagNode) -> String {
    format!(
        r#"你是 raccoon 的 DAG Worker，当前工作目录是该节点独立 Git worktree。

请只完成当前节点，不要处理未声明的其他任务。
所有说明和总结使用简体中文。

## 节点

标题：{}
类型：{}

## 执行说明

{}

## 验收标准

{}

## 目标文件

{}

完成后请简短总结修改内容和验证方式。"#,
        node.title,
        node.kind,
        node.instructions,
        node.acceptance_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n"),
        if node.target_files.is_empty() {
            "- 未限定，按节点说明判断".to_string()
        } else {
            node.target_files
                .iter()
                .map(|item| format!("- {item}"))
                .collect::<Vec<_>>()
                .join("\n")
        }
    )
}

async fn create_worktree(project_path: &Path, worktree_path: &Path) -> Result<()> {
    if worktree_path.exists() {
        return Ok(());
    }
    if let Some(parent) = worktree_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let branch = format!(
        "raccoon-node-{}",
        worktree_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("task")
    );
    let output = Command::new("git")
        .arg("worktree")
        .arg("add")
        .arg("-B")
        .arg(branch)
        .arg(worktree_path)
        .current_dir(project_path)
        .output()
        .await
        .context("创建 Git worktree 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "创建 Git worktree 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

async fn git_diff(worktree_path: &Path) -> Result<String> {
    // 先将所有变更（含 untracked 新文件）加入 staging，再获取 diff
    // 这样 Pi Agent 创建的新文件也能被捕获
    let add = Command::new("git")
        .arg("add")
        .arg("-A")
        .current_dir(worktree_path)
        .output()
        .await
        .context("git add -A 失败")?;
    if !add.status.success() {
        anyhow::bail!(
            "git add -A 失败: {}",
            String::from_utf8_lossy(&add.stderr).trim()
        );
    }

    let output = Command::new("git")
        .arg("diff")
        .arg("--cached")
        .arg("--binary")
        .current_dir(worktree_path)
        .output()
        .await
        .context("读取 worktree diff 失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "读取 worktree diff 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

async fn apply_diff(project_path: &Path, diff: &str) -> Result<()> {
    let mut child = Command::new("git")
        .arg("apply")
        .arg("--3way")
        .arg("-")
        .current_dir(project_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .context("启动 git apply 失败")?;

    let mut stdin = child.stdin.take().context("打开 git apply stdin 失败")?;
    stdin.write_all(diff.as_bytes()).await?;
    drop(stdin);

    let output = child.wait_with_output().await?;
    if !output.status.success() {
        anyhow::bail!(
            "合入节点 diff 失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(())
}

fn topo_order(nodes: &[DagNode], edges: &[DagEdge]) -> Result<Vec<i64>> {
    let node_ids = nodes.iter().map(|node| node.id).collect::<HashSet<_>>();
    let mut indegree = nodes
        .iter()
        .map(|node| (node.id, 0usize))
        .collect::<HashMap<_, _>>();
    let mut outgoing: HashMap<i64, Vec<i64>> = HashMap::new();

    for edge in edges {
        if !node_ids.contains(&edge.from_node_id) || !node_ids.contains(&edge.to_node_id) {
            anyhow::bail!("DAG 边引用了不存在的节点");
        }
        *indegree.entry(edge.to_node_id).or_default() += 1;
        outgoing
            .entry(edge.from_node_id)
            .or_default()
            .push(edge.to_node_id);
    }

    let mut queue = nodes
        .iter()
        .filter(|node| indegree.get(&node.id).copied().unwrap_or(0) == 0)
        .map(|node| node.id)
        .collect::<Vec<_>>();
    let mut order = Vec::with_capacity(nodes.len());

    while let Some(id) = queue.pop() {
        order.push(id);
        if let Some(children) = outgoing.get(&id) {
            for child in children {
                let entry = indegree.entry(*child).or_default();
                *entry = entry.saturating_sub(1);
                if *entry == 0 {
                    queue.push(*child);
                }
            }
        }
    }

    if order.len() != nodes.len() {
        anyhow::bail!("DAG 不能包含环");
    }

    Ok(order)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: i64) -> DagNode {
        DagNode {
            id,
            job_id: 1,
            node_key: format!("node-{id}"),
            title: format!("节点 {id}"),
            kind: "backend".to_string(),
            worker_identity: "coder".to_string(),
            status: "pending".to_string(),
            instructions: "执行".to_string(),
            acceptance_criteria: vec!["通过".to_string()],
            target_files: Vec::new(),
            worktree_path: None,
            session_id: None,
            session_file: None,
            retry_count: 0,
            error_message: None,
            result_summary: None,
            started_at: None,
            finished_at: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn topo_order_respects_dependencies() {
        let nodes = vec![node(1), node(2)];
        let edges = vec![DagEdge {
            id: 1,
            job_id: 1,
            from_node_id: 1,
            to_node_id: 2,
            created_at: String::new(),
        }];

        assert_eq!(topo_order(&nodes, &edges).unwrap(), vec![1, 2]);
    }
}
