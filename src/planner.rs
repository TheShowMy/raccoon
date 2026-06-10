use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use tokio::process::Command;

use crate::coordinator::ProjectContext;
use crate::db::{DagEdgeSeed, DagNodeSeed, SystemConfig, TaskDraft};
use crate::pi_rpc::PiRpcClient;

const PLANNING_TIMEOUT: tokio::time::Duration = tokio::time::Duration::from_secs(1500);

#[derive(Debug, Clone)]
pub struct DagPlan {
    pub nodes: Vec<DagNodeSeed>,
    pub edges: Vec<DagEdgeSeed>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDagPlan {
    nodes: Vec<RawDagNode>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDagNode {
    id: String,
    title: String,
    kind: String,
    worker_identity: String,
    instructions: String,
    #[serde(default)]
    acceptance_criteria: Vec<String>,
    #[serde(default)]
    target_files: Vec<String>,
    #[serde(default)]
    depends_on: Vec<String>,
}

pub async fn generate_dag_plan(
    pi_client: &PiRpcClient,
    system_config: &SystemConfig,
    thinking_level: &str,
    draft: &TaskDraft,
    project_context: Option<&ProjectContext>,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<DagPlan> {
    let _guard = pi_client.session_guard().await;
    let created = pi_client
        .new_session()
        .await
        .context("创建 DAG 规划会话失败")?;
    if created.cancelled {
        anyhow::bail!("创建 DAG 规划会话被取消");
    }
    pi_client
        .set_session_name(&format!("raccoon DAG: {}", draft.title))
        .await
        .context("设置 DAG 规划会话名称失败")?;
    pi_client
        .set_model(
            &system_config.coordinator_provider,
            &system_config.coordinator_model,
        )
        .await
        .context("设置 DAG 规划模型失败")?;
    pi_client
        .set_thinking_level(thinking_level)
        .await
        .context("设置 DAG 规划 thinking level 失败")?;
    let repo_summary = match project_context {
        Some(ctx) => build_repo_summary(Path::new(&ctx.local_path)).await.ok(),
        None => None,
    };
    pi_client
        .prompt(&build_dag_prompt(
            draft,
            project_context,
            repo_summary.as_deref(),
        ))
        .await
        .context("发送 DAG 规划 prompt 失败")?;
    pi_client
        .wait_for_agent_end_with_events(PLANNING_TIMEOUT, &mut *pi_event_sink)
        .await
        .context("等待 DAG 规划输出失败")?;

    try_parse_with_retry(pi_client, pi_event_sink).await
}

/// 尝试解析 DAG 规划，失败后通过 steer 自纠，最多重试 2 次。
async fn try_parse_with_retry(
    pi_client: &PiRpcClient,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<DagPlan> {
    // 第 0 次：初始尝试
    if let Some(plan) = try_parse_from_tool_result(pi_client).await? {
        return Ok(plan);
    }

    let text = pi_client
        .get_last_assistant_text()
        .await
        .context("读取 DAG 规划输出失败")?
        .context("DAG 规划未返回文本")?;

    match parse_dag_plan(&text) {
        Ok(plan) => Ok(plan),
        Err(initial_err) => {
            tracing::warn!("DAG 规划首次解析失败: {}", initial_err);

            // 第 1 次自纠
            let steer_msg = format!(
                "你的 DAG 输出格式有误：{}。请修正后严格只输出一个 JSON 对象，不要 Markdown 代码块，不要解释文字。",
                initial_err
            );
            pi_client
                .steer(&steer_msg)
                .await
                .context("发送第 1 次 steer 自纠指令失败")?;
            pi_client
                .wait_for_agent_end_with_events(PLANNING_TIMEOUT, &mut *pi_event_sink)
                .await
                .context("等待 DAG 规划第 1 次自纠输出失败")?;

            if let Some(plan) = try_parse_from_tool_result(pi_client).await? {
                return Ok(plan);
            }

            let text = pi_client
                .get_last_assistant_text()
                .await
                .context("读取 DAG 规划第 1 次自纠输出失败")?
                .context("DAG 规划第 1 次自纠未返回文本")?;

            match parse_dag_plan(&text) {
                Ok(plan) => Ok(plan),
                Err(first_retry_err) => {
                    tracing::warn!("DAG 规划第 1 次自纠后仍解析失败: {}", first_retry_err);

                    // 第 2 次自纠
                    let steer_msg = format!(
                        "修正后仍有问题：{}。请再次修正，严格只输出符合格式的 JSON，不要任何其他内容。",
                        first_retry_err
                    );
                    pi_client
                        .steer(&steer_msg)
                        .await
                        .context("发送第 2 次 steer 自纠指令失败")?;
                    pi_client
                        .wait_for_agent_end_with_events(PLANNING_TIMEOUT, &mut *pi_event_sink)
                        .await
                        .context("等待 DAG 规划第 2 次自纠输出失败")?;

                    if let Some(plan) = try_parse_from_tool_result(pi_client).await? {
                        return Ok(plan);
                    }

                    let text = pi_client
                        .get_last_assistant_text()
                        .await
                        .context("读取 DAG 规划第 2 次自纠输出失败")?
                        .context("DAG 规划第 2 次自纠未返回文本")?;

                    parse_dag_plan(&text).context("DAG 规划两次自纠后仍无法解析输出")
                }
            }
        }
    }
}

fn build_dag_prompt(
    draft: &TaskDraft,
    project_context: Option<&ProjectContext>,
    repo_summary: Option<&str>,
) -> String {
    let project_section = project_context
        .map(|p| {
            format!(
                r#"## 项目上下文

{}
"#,
                p.format_for_prompt()
            )
        })
        .unwrap_or_default();
    let repo_section = repo_summary
        .map(|summary| format!("## 仓库结构摘要\n\n{summary}\n"))
        .unwrap_or_default();
    let acceptance = draft
        .acceptance_criteria
        .iter()
        .map(|item| format!("- {item}"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"你是 raccoon 的 Coordinator，负责把已确认需求拆分为可执行 DAG。

如果 submit_dag_plan 工具可用，请优先调用该工具提交 DAG。
如果工具不可用，请只输出一个 JSON 对象，不要 Markdown。

## 规划规则

- 所有可展示文本必须使用简体中文。
- 不能把确认需求原文复制成节点，必须根据仓库结构做工程化拆分。
- DAG 必须无环，节点 id 必须唯一，只能使用小写字母、数字、下划线和短横线。
- 每个节点必须能被一个 Worker 独立执行，并有明确验收标准和具体 targetFiles。
- workerIdentity 只能是 coder、reviewer、browser、vision。
- kind 建议使用 backend、frontend、review、browser、vision、docs、test。
- 前端 UI 工作拆成 frontend 节点，后续由实现者使用本地 Kimi CLI 辅助开发和验收。
- 如果两个节点可能修改同一文件，必须用 dependsOn 串行化。
- instructions 必须包含目标、修改范围、依赖输入、验收步骤。
- acceptanceCriteria 至少包含一个可执行命令（如 cargo check、cargo test、npm run build、npm run lint）或明确人工检查步骤。

## 输出 JSON 结构

```json
{{
  "nodes": [
    {{
      "id": "frontend-dag-panel",
      "title": "实现 DAG 前端面板",
      "kind": "frontend",
      "workerIdentity": "coder",
      "instructions": "具体执行说明",
      "acceptanceCriteria": ["验收标准"],
      "targetFiles": ["frontend/src/components/..."],
      "dependsOn": ["backend-dag-api"]
    }}
  ]
}}
```

{project_section}
{repo_section}
## 已确认需求

标题：{}

摘要：{}

验收标准：
{}
"#,
        draft.title, draft.description, acceptance
    )
}

async fn build_repo_summary(project_path: &Path) -> Result<String> {
    let output = Command::new("git")
        .arg("ls-files")
        .current_dir(project_path)
        .output()
        .await
        .context("读取仓库文件列表失败")?;
    if !output.status.success() {
        anyhow::bail!(
            "读取仓库文件列表失败: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    let files = String::from_utf8_lossy(&output.stdout);
    let mut selected = files
        .lines()
        .filter(|file| {
            file.starts_with("src/")
                || file.starts_with("frontend/src/")
                || matches!(
                    *file,
                    "Cargo.toml" | "package.json" | "frontend/package.json" | "README.md"
                )
        })
        .take(120)
        .map(|file| format!("- {file}"))
        .collect::<Vec<_>>();
    if selected.is_empty() {
        selected.push("- 未能从 git ls-files 提取关键文件".to_string());
    }
    Ok(selected.join("\n"))
}

async fn try_parse_from_tool_result(pi_client: &PiRpcClient) -> Result<Option<DagPlan>> {
    let messages = pi_client.get_messages().await.context("获取会话消息失败")?;
    for msg in messages.iter().rev() {
        if msg.role == "toolResult" && msg.tool_name.as_deref() == Some("submit_dag_plan") {
            if let Some(details) = &msg.details {
                let raw: RawDagPlan =
                    serde_json::from_value(details.clone()).context("解析 DAG tool result 失败")?;
                return Ok(Some(normalize_plan(raw)?));
            }
        }
    }
    Ok(None)
}

pub fn parse_dag_plan(text: &str) -> Result<DagPlan> {
    let json_text = extract_json_object(text).context("DAG 输出中没有 JSON 对象")?;
    let raw: RawDagPlan = serde_json::from_str(&json_text).context("解析 DAG JSON 失败")?;
    normalize_plan(raw)
}

fn normalize_plan(raw: RawDagPlan) -> Result<DagPlan> {
    if raw.nodes.is_empty() {
        anyhow::bail!("DAG 至少需要一个节点");
    }

    let mut seen = HashSet::new();
    let mut nodes = Vec::with_capacity(raw.nodes.len());
    let mut edges = Vec::new();
    for node in raw.nodes {
        let node_key = node.id.trim().to_string();
        if node_key.is_empty() {
            anyhow::bail!("DAG 节点 id 不能为空");
        }
        if !node_key
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        {
            anyhow::bail!("DAG 节点 id 只能包含小写字母、数字、下划线和短横线: {node_key}");
        }
        if !seen.insert(node_key.clone()) {
            anyhow::bail!("DAG 节点 id 重复: {node_key}");
        }
        if !matches!(
            node.worker_identity.as_str(),
            "coder" | "reviewer" | "browser" | "vision"
        ) {
            anyhow::bail!("不支持的 workerIdentity: {}", node.worker_identity);
        }
        if node.title.trim().is_empty() || node.instructions.trim().is_empty() {
            anyhow::bail!("DAG 节点 title/instructions 不能为空");
        }
        if node.acceptance_criteria.is_empty() {
            anyhow::bail!("DAG 节点必须包含验收标准: {node_key}");
        }

        for dep in node.depends_on {
            edges.push(DagEdgeSeed {
                from_node_key: dep.trim().to_string(),
                to_node_key: node_key.clone(),
            });
        }

        nodes.push(DagNodeSeed {
            node_key,
            title: node.title.trim().to_string(),
            kind: node.kind.trim().to_string(),
            worker_identity: node.worker_identity,
            instructions: node.instructions.trim().to_string(),
            acceptance_criteria: node
                .acceptance_criteria
                .into_iter()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect(),
            target_files: node
                .target_files
                .into_iter()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .collect(),
        });
    }

    validate_edges(&nodes, &edges)?;
    validate_dag_quality(&nodes, &edges)?;
    Ok(DagPlan { nodes, edges })
}

fn validate_dag_quality(nodes: &[DagNodeSeed], edges: &[DagEdgeSeed]) -> Result<()> {
    for node in nodes {
        // review/browser/vision 类型节点允许 targetFiles 为空
        if node.target_files.is_empty()
            && !matches!(node.kind.as_str(), "review" | "browser" | "vision")
        {
            anyhow::bail!("DAG 节点必须包含明确 targetFiles: {}", node.node_key);
        }
        if node.instructions.chars().count() < 20 {
            anyhow::bail!(
                "DAG 节点 instructions 过短，疑似未做工程拆分: {}",
                node.node_key
            );
        }
        // 验收标准只需非空且每条有实质性内容（至少 4 个字符）
        if node
            .acceptance_criteria
            .iter()
            .any(|s| s.chars().count() < 4)
        {
            anyhow::bail!(
                "DAG 节点验收标准过短，请提供具体的验证步骤: {}",
                node.node_key
            );
        }
    }

    let mut owners: HashMap<&str, Vec<&str>> = HashMap::new();
    for node in nodes {
        for file in &node.target_files {
            owners
                .entry(file.as_str())
                .or_default()
                .push(node.node_key.as_str());
        }
    }
    for (file, node_keys) in owners {
        if node_keys.len() <= 1 {
            continue;
        }
        for i in 0..node_keys.len() {
            for j in (i + 1)..node_keys.len() {
                if !has_dependency_path(edges, node_keys[i], node_keys[j])
                    && !has_dependency_path(edges, node_keys[j], node_keys[i])
                {
                    anyhow::bail!(
                        "文件 {} 被多个 DAG 节点修改但未串行化: {}, {}",
                        file,
                        node_keys[i],
                        node_keys[j]
                    );
                }
            }
        }
    }

    Ok(())
}

fn has_dependency_path(edges: &[DagEdgeSeed], from: &str, to: &str) -> bool {
    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in edges {
        graph
            .entry(edge.from_node_key.as_str())
            .or_default()
            .push(edge.to_node_key.as_str());
    }
    let mut stack = vec![from];
    let mut seen = HashSet::new();
    while let Some(current) = stack.pop() {
        if current == to {
            return true;
        }
        if !seen.insert(current) {
            continue;
        }
        if let Some(next) = graph.get(current) {
            stack.extend(next.iter().copied());
        }
    }
    false
}

fn validate_edges(nodes: &[DagNodeSeed], edges: &[DagEdgeSeed]) -> Result<()> {
    let node_keys = nodes
        .iter()
        .map(|node| node.node_key.as_str())
        .collect::<HashSet<_>>();
    for edge in edges {
        if !node_keys.contains(edge.from_node_key.as_str()) {
            anyhow::bail!("DAG 依赖源节点不存在: {}", edge.from_node_key);
        }
        if !node_keys.contains(edge.to_node_key.as_str()) {
            anyhow::bail!("DAG 依赖目标节点不存在: {}", edge.to_node_key);
        }
    }

    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in edges {
        graph
            .entry(edge.from_node_key.as_str())
            .or_default()
            .push(edge.to_node_key.as_str());
    }
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    for key in node_keys {
        visit(key, &graph, &mut visiting, &mut visited)?;
    }
    Ok(())
}

fn visit<'a>(
    key: &'a str,
    graph: &HashMap<&'a str, Vec<&'a str>>,
    visiting: &mut HashSet<&'a str>,
    visited: &mut HashSet<&'a str>,
) -> Result<()> {
    if visited.contains(key) {
        return Ok(());
    }
    if !visiting.insert(key) {
        anyhow::bail!("DAG 不能包含环");
    }
    if let Some(next) = graph.get(key) {
        for child in next {
            visit(child, graph, visiting, visited)?;
        }
    }
    visiting.remove(key);
    visited.insert(key);
    Ok(())
}

fn extract_json_object(text: &str) -> Option<String> {
    let source = text.trim();
    let source = if let Some(start) = source.find("```") {
        let rest = &source[start + 3..];
        let rest = rest.strip_prefix("json").unwrap_or(rest).trim_start();
        if let Some(end) = rest.find("```") {
            &rest[..end]
        } else {
            source
        }
    } else {
        source
    };

    let mut depth = 0usize;
    let mut start = None;
    for (idx, ch) in source.char_indices() {
        if ch == '{' {
            if start.is_none() {
                start = Some(idx);
            }
            depth += 1;
        } else if ch == '}' && start.is_some() {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return start.map(|s| source[s..=idx].to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_dag_plan() {
        let plan = parse_dag_plan(
            r#"{
  "nodes": [
    {
      "id": "backend-api",
      "title": "实现后端 API",
      "kind": "backend",
      "workerIdentity": "coder",
      "instructions": "目标：新增后端 DAG API。修改范围：修改 src/main.rs 中的路由和处理器。验收步骤：运行 cargo check。",
      "acceptanceCriteria": ["cargo check 通过"],
      "targetFiles": ["src/main.rs"],
      "dependsOn": []
    },
    {
      "id": "frontend-ui",
      "title": "实现前端 UI",
      "kind": "frontend",
      "workerIdentity": "coder",
      "instructions": "目标：新增前端 DAG 面板。修改范围：新增 DagPanel 组件并接入 API 类型。验收步骤：运行 npm run build。",
      "acceptanceCriteria": ["npm run build 通过"],
      "targetFiles": ["frontend/src/components/DagPanel.tsx"],
      "dependsOn": ["backend-api"]
    }
  ]
}"#,
        )
        .unwrap();

        assert_eq!(plan.nodes.len(), 2);
        assert_eq!(plan.edges.len(), 1);
    }

    #[test]
    fn rejects_unknown_dependency() {
        let err = parse_dag_plan(
            r#"{
  "nodes": [
    {
      "id": "frontend-ui",
      "title": "实现前端 UI",
      "kind": "frontend",
      "workerIdentity": "coder",
      "instructions": "目标：新增前端 DAG 面板。修改范围：新增 DagPanel 组件并接入 API 类型。验收步骤：运行 npm run build。",
      "acceptanceCriteria": ["npm run build 通过"],
      "targetFiles": ["frontend/src/components/DagPanel.tsx"],
      "dependsOn": ["missing"]
    }
  ]
}"#,
        )
        .unwrap_err();

        assert!(err.to_string().contains("依赖源节点不存在"));
    }

    #[test]
    fn rejects_cycle() {
        let err = parse_dag_plan(
            r#"{
  "nodes": [
    {
      "id": "a",
      "title": "A",
      "kind": "backend",
      "workerIdentity": "coder",
      "instructions": "目标：修改后端 A。修改范围：调整 src/main.rs。验收步骤：运行 cargo check。",
      "acceptanceCriteria": ["cargo check 通过"],
      "targetFiles": ["src/main.rs"],
      "dependsOn": ["b"]
    },
    {
      "id": "b",
      "title": "B",
      "kind": "frontend",
      "workerIdentity": "coder",
      "instructions": "目标：修改前端 B。修改范围：调整 frontend/src/App.tsx。验收步骤：运行 npm run build。",
      "acceptanceCriteria": ["npm run build 通过"],
      "targetFiles": ["frontend/src/App.tsx"],
      "dependsOn": ["a"]
    }
  ]
}"#,
        )
        .unwrap_err();

        assert!(err.to_string().contains("不能包含环"));
    }

    #[test]
    fn rejects_file_conflict_without_dependency() {
        let err = parse_dag_plan(
            r#"{
  "nodes": [
    {
      "id": "api-a",
      "title": "实现接口 A",
      "kind": "backend",
      "workerIdentity": "coder",
      "instructions": "目标：实现接口 A。修改范围：修改 src/main.rs 的路由。验收步骤：运行 cargo check。",
      "acceptanceCriteria": ["cargo check 通过"],
      "targetFiles": ["src/main.rs"],
      "dependsOn": []
    },
    {
      "id": "api-b",
      "title": "实现接口 B",
      "kind": "backend",
      "workerIdentity": "coder",
      "instructions": "目标：实现接口 B。修改范围：修改 src/main.rs 的处理器。验收步骤：运行 cargo check。",
      "acceptanceCriteria": ["cargo check 通过"],
      "targetFiles": ["src/main.rs"],
      "dependsOn": []
    }
  ]
}"#,
        )
        .unwrap_err();

        assert!(err.to_string().contains("被多个 DAG 节点修改但未串行化"));
    }
}
