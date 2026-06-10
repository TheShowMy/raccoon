use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;
use tracing::warn;

use crate::db::{ClarificationOption, ClarificationSeed, SystemConfig, TaskDraftSeed};
use crate::pi_rpc::{PiRpcClient, RpcSessionState};

/// Coordinator 分析时需要用到的项目上下文。
#[derive(Debug, Clone)]
pub struct ProjectContext {
    pub name: String,
    pub git_url: String,
    pub local_path: String,
}

impl ProjectContext {
    pub(crate) fn format_for_prompt(&self) -> String {
        format!(
            "- 项目名称：{}\n- Git 仓库：{}\n- 本地路径：{}\n",
            self.name, self.git_url, self.local_path
        )
    }
}

const GENERATION_TIMEOUT: tokio::time::Duration = tokio::time::Duration::from_secs(1500);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoordinatorStatus {
    NeedsClarification,
    Ready,
}

#[derive(Debug, Clone)]
pub struct CoordinatorDecision {
    pub status: CoordinatorStatus,
    pub progress: String,
    pub clarifications: Vec<ClarificationSeed>,
    pub draft: Option<TaskDraftSeed>,
    pub session: RpcSessionState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCoordinatorResponse {
    status: String,
    #[serde(default)]
    progress: String,
    #[serde(default)]
    clarifications: Vec<GeneratedClarification>,
    draft: Option<GeneratedDraft>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedClarification {
    question: String,
    #[serde(rename = "type")]
    question_type: String,
    #[serde(default)]
    options: Vec<GeneratedOption>,
    #[serde(default = "default_allow_custom")]
    allow_custom: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedOption {
    label: String,
    description: String,
    #[serde(default)]
    recommended: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedDraft {
    title: String,
    summary: String,
    #[serde(default)]
    acceptance_criteria: Vec<String>,
}

fn default_allow_custom() -> bool {
    true
}

const COORDINATOR_SHARED_GUIDELINES: &str = r#"## 语言规范

- 所有可展示给用户或会被前端记录的内容都必须使用简体中文，包括 thinking、progress、clarifications、options、draft.title、draft.summary 和 acceptanceCriteria。
- 不要输出英文思考、英文过程说明或中英混杂的分析文本；技术名词、文件名、API 名称可以保留原文。
- progress 只写可展示给用户的过程摘要，不输出隐藏思考链。

## 稳定决策准则

按同一套清单判断需求是否足够明确，避免同一个需求在不同运行中结论漂移：

1. 目标：用户要达成的效果是否清楚。
2. 范围：要改的模块、页面、接口或行为边界是否能从需求或项目上下文判断。
3. 验收：完成后如何验证是否能用测试、构建、静态检查或明确的人工步骤表达。
4. 约束：技术栈、兼容性、数据迁移、安全边界、性能要求是否存在会改变实现路径的不确定点。
5. 风险：如果直接实现，是否可能做出高成本、不可逆或明显偏离用户意图的选择。

只有当不确定点会影响实现路径、验收标准、数据兼容或安全边界时，才返回 status=needs_clarification。
如果缺失信息可以按项目既有惯例、最小可行范围或安全默认值处理，返回 status=ready，并在 draft.summary 或 acceptanceCriteria 中写明默认假设。
不要询问已经能从用户需求、项目上下文或常规工程惯例明确得到的信息。

## 澄清策略

- status=needs_clarification 时，只提出当前阶段最关键的 1 到 6 个问题。
- 优先使用 single_choice 或 multi_choice，并提供 2 到 4 个互斥且有实际取舍的选项。
- 推荐项最多 1 个，且推荐项应放在 options 的第一个位置。
- 禁止生成低信息选项，例如“是 / 否 / 其他”“方案一 / 方案二”，除非问题本身确实是二选一。
- free_text 只用于无法合理枚举选项的开放问题，options 使用空数组。
"#;

pub async fn start_requirement_analysis(
    pi_client: &PiRpcClient,
    system_config: &SystemConfig,
    thinking_level: &str,
    requirement: &str,
    title: &str,
    project_context: Option<&ProjectContext>,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<CoordinatorDecision> {
    let _guard = pi_client.session_guard().await;
    let created = pi_client
        .new_session()
        .await
        .context("创建 Coordinator 独立会话失败")?;
    if created.cancelled {
        anyhow::bail!("创建 Coordinator 独立会话被取消");
    }
    pi_client
        .set_session_name(&format!("raccoon: {title}"))
        .await
        .context("设置 Coordinator 会话名称失败")?;
    run_prompt(
        pi_client,
        system_config,
        thinking_level,
        &build_initial_prompt(requirement, project_context),
        pi_event_sink,
    )
    .await
}

pub async fn continue_requirement_analysis(
    pi_client: &PiRpcClient,
    system_config: &SystemConfig,
    thinking_level: &str,
    session_file: &str,
    answer_summary: &str,
    project_context: Option<&ProjectContext>,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<CoordinatorDecision> {
    let _guard = pi_client.session_guard().await;
    let switched = pi_client
        .switch_session(session_file)
        .await
        .context("切回 Coordinator 会话失败")?;
    if switched.cancelled {
        anyhow::bail!("切回 Coordinator 会话被取消");
    }
    run_prompt(
        pi_client,
        system_config,
        thinking_level,
        &build_followup_prompt(answer_summary, project_context),
        pi_event_sink,
    )
    .await
}

async fn run_prompt(
    pi_client: &PiRpcClient,
    system_config: &SystemConfig,
    thinking_level: &str,
    prompt: &str,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<CoordinatorDecision> {
    pi_client
        .set_model(
            &system_config.coordinator_provider,
            &system_config.coordinator_model,
        )
        .await
        .context("设置 Coordinator 模型失败")?;
    pi_client
        .set_thinking_level(thinking_level)
        .await
        .context("设置 Coordinator thinking level 失败")?;

    pi_client
        .prompt(prompt)
        .await
        .context("发送 Coordinator prompt 失败")?;
    pi_client
        .wait_for_agent_end_with_events(GENERATION_TIMEOUT, &mut *pi_event_sink)
        .await
        .context("等待 Coordinator 输出失败")?;

    let mut decision = try_parse_with_retry(pi_client, prompt, pi_event_sink).await?;
    let session = pi_client
        .get_state()
        .await
        .context("读取 Coordinator 会话状态失败")?;
    decision.session = session;
    Ok(decision)
}

/// 尝试解析 Coordinator 输出。
///
/// 优先级：
/// 1. 如果 LLM 调用了 submit_coordinator_decision 工具，从 tool result 直接读取（格式最可靠）
/// 2. 否则从 assistant 文本解析 JSON
/// 3. 解析失败时通过 steer 给具体错误反馈，最多自纠 2 次
async fn try_parse_with_retry(
    pi_client: &PiRpcClient,
    _original_prompt: &str,
    pi_event_sink: &mut (dyn FnMut(Value) + Send),
) -> Result<CoordinatorDecision> {
    // 第 0 次：初始尝试
    if let Some(decision) = try_parse_from_tool_result(pi_client).await? {
        return Ok(decision);
    }

    let text = pi_client
        .get_last_assistant_text()
        .await
        .context("读取 Coordinator 输出失败")?
        .context("Coordinator 未返回文本")?;

    match parse_decision(&text) {
        Ok(decision) => Ok(decision),
        Err(initial_err) => {
            warn!("Coordinator 首次解析失败: {}", initial_err);

            // 第 1 次自纠：给出具体错误
            let steer_msg = format!(
                "你的输出有问题：{}。请修正后严格只输出一个 JSON 对象，不要 Markdown 代码块，不要解释文字。",
                initial_err
            );
            pi_client
                .steer(&steer_msg)
                .await
                .context("发送第 1 次 steer 自纠指令失败")?;

            pi_client
                .wait_for_agent_end_with_events(GENERATION_TIMEOUT, &mut *pi_event_sink)
                .await
                .context("等待 Coordinator 第 1 次自纠输出失败")?;

            if let Some(decision) = try_parse_from_tool_result(pi_client).await? {
                return Ok(decision);
            }

            let text = pi_client
                .get_last_assistant_text()
                .await
                .context("读取 Coordinator 第 1 次自纠输出失败")?
                .context("Coordinator 第 1 次自纠未返回文本")?;

            match parse_decision(&text) {
                Ok(decision) => Ok(decision),
                Err(first_retry_err) => {
                    warn!("Coordinator 第 1 次自纠后仍解析失败: {}", first_retry_err);

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
                        .wait_for_agent_end_with_events(GENERATION_TIMEOUT, &mut *pi_event_sink)
                        .await
                        .context("等待 Coordinator 第 2 次自纠输出失败")?;

                    if let Some(decision) = try_parse_from_tool_result(pi_client).await? {
                        return Ok(decision);
                    }

                    let text = pi_client
                        .get_last_assistant_text()
                        .await
                        .context("读取 Coordinator 第 2 次自纠输出失败")?
                        .context("Coordinator 第 2 次自纠未返回文本")?;

                    parse_decision(&text).context("Coordinator 两次自纠后仍无法解析输出")
                }
            }
        }
    }
}

/// 从会话消息中查找 submit_coordinator_decision 的 tool result。
async fn try_parse_from_tool_result(
    pi_client: &PiRpcClient,
) -> Result<Option<CoordinatorDecision>> {
    let messages = pi_client.get_messages().await.context("获取会话消息失败")?;

    // 从后往前找最近的 toolResult
    for msg in messages.iter().rev() {
        if msg.role == "toolResult"
            && msg.tool_name.as_deref() == Some("submit_coordinator_decision")
        {
            if let Some(details) = &msg.details {
                let response: RawCoordinatorResponse = serde_json::from_value(details.clone())
                    .context("解析 tool result details 失败")?;
                return Ok(Some(normalize_decision(response)?));
            }
        }
    }

    Ok(None)
}

fn build_initial_prompt(requirement: &str, project_context: Option<&ProjectContext>) -> String {
    let project_section = project_context
        .map(|p| {
            format!(
                r#"## 项目上下文

{}
你当前的工作目录就是项目根目录。用户可能会使用 @path 引用项目中的文件（例如 @src/main.rs），当你遇到这类引用时，请使用文件读取工具查看对应文件的内容，以便结合项目实际情况进行分析。
"#,
                p.format_for_prompt()
            )
        })
        .unwrap_or_default();
    let shared_guidelines = COORDINATOR_SHARED_GUIDELINES;

    format!(
        r#"你是 raccoon 的 Coordinator，负责把用户需求整理为后续执行前的确认需求。

如果你看到 submit_coordinator_decision 工具可用，请**优先调用该工具**提交你的分析决策。
如果工具不可用，请**只输出一个 JSON 对象**，不要 Markdown，不要解释，不要代码块。

你必须先按固定标准判断需求是否已经足够清晰。

{shared_guidelines}

{project_section}
## 输出 JSON 结构

```json
{{
  "status": "needs_clarification | ready",
  "progress": "给用户看的简短过程说明，说明你正在判断什么",
  "clarifications": [
    {{
      "question": "问题文本",
      "type": "single_choice | multi_choice | free_text",
      "options": [
        {{
          "label": "短选项",
          "description": "选择该项的影响或取舍",
          "recommended": true
        }}
      ],
      "allowCustom": true
    }}
  ],
  "draft": {{
    "title": "确认需求标题",
    "summary": "最终需求范围摘要",
    "acceptanceCriteria": ["验收标准 1", "验收标准 2"]
  }}
}}
```

## ⚠️ 关键规则（必须严格遵守，否则输出会被拒绝）

1. **status=needs_clarification 时**：clarifications 必须包含 1 到 6 个问题，draft 可以省略。
2. **status=ready 时**：clarifications 必须为空数组 `[]`，draft 必须存在。
3. **single_choice / multi_choice 必须提供 2 到 4 个选项** —— 绝对不能少于 2 个，也绝对不能多于 4 个。
4. **free_text 可以没有 options**（options 为空数组）。
5. **每个选择题最多只能有 1 个 recommended=true** —— 绝对不能标记 2 个或以上为 recommended。
6. 所有字符串字段必须使用简体中文，技术名词、文件名、API 名称除外。
7. 选择题的推荐选项如果存在，必须放在 options 第一个位置。

## 示例输出（needs_clarification）

```json
{{
  "status": "needs_clarification",
  "progress": "需求目标已识别，但技术栈偏好和验收标准需要确认。",
  "clarifications": [
    {{
      "question": "倾向使用哪种前端框架？",
      "type": "single_choice",
      "options": [
        {{
          "label": "React",
          "description": "生态系统最丰富，适合复杂交互场景",
          "recommended": true
        }},
        {{
          "label": "Vue",
          "description": "上手简单，模板语法直观"
        }}
      ],
      "allowCustom": true
    }}
  ]
}}
```

## 用户需求

{requirement}
"#
    )
}

fn build_followup_prompt(answer_summary: &str, project_context: Option<&ProjectContext>) -> String {
    let project_section = project_context
        .map(|p| {
            format!(
                r#"
## 项目上下文

{}
你当前的工作目录就是项目根目录。用户可能会使用 @path 引用项目中的文件（例如 @src/main.rs），当你遇到这类引用时，请使用文件读取工具查看对应文件的内容，以便结合项目实际情况进行分析。
"#,
                p.format_for_prompt()
            )
        })
        .unwrap_or_default();
    let shared_guidelines = COORDINATOR_SHARED_GUIDELINES;

    format!(
        r#"用户已经回答了上一轮澄清问题：
{answer_summary}
{project_section}
请基于当前完整上下文，继续按固定标准判断需求是否已经足够清晰。

如果你看到 submit_coordinator_decision 工具可用，请**优先调用该工具**提交你的分析决策。
如果工具不可用，请**只输出一个 JSON 对象**，不要 Markdown，不要解释，不要代码块。

{shared_guidelines}

## 输出 JSON 结构（与初始分析相同）

```json
{{
  "status": "needs_clarification | ready",
  "progress": "给用户看的简短过程说明",
  "clarifications": [
    {{
      "question": "问题文本",
      "type": "single_choice | multi_choice | free_text",
      "options": [
        {{
          "label": "短选项",
          "description": "选择该项的影响或取舍",
          "recommended": true
        }}
      ],
      "allowCustom": true
    }}
  ],
  "draft": {{
    "title": "确认需求标题",
    "summary": "最终需求范围摘要",
    "acceptanceCriteria": ["验收标准 1", "验收标准 2"]
  }}
}}
```

## ⚠️ 关键规则（必须严格遵守）

1. **status=needs_clarification 时**：clarifications 必须包含 1 到 6 个问题，draft 可以省略。
2. **status=ready 时**：clarifications 必须为空数组 `[]`，draft 必须存在。
3. **single_choice / multi_choice 必须提供 2 到 4 个选项** —— 绝对不能少于 2 个，也绝对不能多于 4 个。
4. **free_text 可以没有 options**（options 为空数组）。
5. **每个选择题最多只能有 1 个 recommended=true** —— 绝对不能标记 2 个或以上为 recommended。
6. 所有字符串字段必须使用简体中文，技术名词、文件名、API 名称除外。
7. 选择题的推荐选项如果存在，必须放在 options 第一个位置。

## 示例输出（ready）

```json
{{
  "status": "ready",
  "progress": "需求已明确：使用 React 开发，需通过自动化测试和构建检查验收。",
  "clarifications": [],
  "draft": {{
    "title": "实现用户登录功能",
    "summary": "开发包含邮箱验证码登录和 JWT Token 鉴权的登录模块，支持登录状态持久化。",
    "acceptanceCriteria": [
      "邮箱验证码发送和校验流程正常工作",
      "JWT Token 签发和刷新机制正确",
      "登录状态在页面刷新后保持"
    ]
  }}
}}
```

## 示例输出（needs_clarification）

```json
{{
  "status": "needs_clarification",
  "progress": "已确认前端框架，但部署方式和验收标准需要补充。",
  "clarifications": [
    {{
      "question": "部署目标环境是什么？",
      "type": "single_choice",
      "options": [
        {{
          "label": "Vercel",
          "description": "Serverless 部署，自动 CI/CD",
          "recommended": true
        }},
        {{
          "label": "自有服务器",
          "description": "Docker 部署，完全可控"
        }}
      ],
      "allowCustom": true
    }}
  ]
}}
```
"#
    )
}

pub fn parse_decision(text: &str) -> Result<CoordinatorDecision> {
    let json_text = extract_json_object(text).context("Coordinator 输出中没有 JSON 对象")?;
    let response: RawCoordinatorResponse =
        serde_json::from_str(&json_text).context("解析 Coordinator JSON 失败")?;
    normalize_decision(response)
}

fn normalize_decision(response: RawCoordinatorResponse) -> Result<CoordinatorDecision> {
    let progress = response.progress.trim().to_string();
    match response.status.as_str() {
        "needs_clarification" => {
            let clarifications = normalize_clarifications(response.clarifications)?;
            Ok(CoordinatorDecision {
                status: CoordinatorStatus::NeedsClarification,
                progress,
                clarifications,
                draft: None,
                session: empty_session(),
            })
        }
        "ready" => {
            if !response.clarifications.is_empty() {
                anyhow::bail!("ready 状态不能包含澄清项");
            }
            let draft = response.draft.context("ready 状态必须包含 draft")?;
            Ok(CoordinatorDecision {
                status: CoordinatorStatus::Ready,
                progress,
                clarifications: Vec::new(),
                draft: Some(normalize_draft(draft)?),
                session: empty_session(),
            })
        }
        other => anyhow::bail!("不支持的 Coordinator 状态: {other}"),
    }
}

fn normalize_clarifications(items: Vec<GeneratedClarification>) -> Result<Vec<ClarificationSeed>> {
    if items.is_empty() {
        anyhow::bail!("needs_clarification 状态必须包含澄清项");
    }
    if items.len() > 6 {
        anyhow::bail!("Coordinator 返回的澄清项过多");
    }

    let mut seeds = Vec::with_capacity(items.len());
    for item in items {
        let question = item.question.trim().to_string();
        if question.is_empty() {
            anyhow::bail!("澄清问题不能为空");
        }
        if !matches!(
            item.question_type.as_str(),
            "single_choice" | "multi_choice" | "free_text"
        ) {
            anyhow::bail!("不支持的澄清问题类型: {}", item.question_type);
        }

        let mut options: Vec<ClarificationOption> = item
            .options
            .into_iter()
            .map(|option| ClarificationOption {
                label: option.label.trim().to_string(),
                description: option.description.trim().to_string(),
                recommended: option.recommended,
            })
            .collect();

        if item.question_type == "free_text" {
            seeds.push(ClarificationSeed {
                question,
                question_type: item.question_type,
                options: Vec::new(),
                allow_custom: true,
            });
            continue;
        }

        // 自动修复：推荐选项去重
        let recommended_count = options.iter().filter(|o| o.recommended).count();
        if recommended_count > 1 {
            warn!(
                "Coordinator 生成了 {} 个推荐选项，自动保留第一个",
                recommended_count
            );
            let mut first_kept = false;
            for option in options.iter_mut() {
                if option.recommended {
                    if first_kept {
                        option.recommended = false;
                    } else {
                        first_kept = true;
                    }
                }
            }
        }

        // 自动修复：选项数量
        if options.len() < 2 {
            warn!(
                "Coordinator 生成了 {} 个选项（需要 2-4 个），自动补充默认选项",
                options.len()
            );
            while options.len() < 2 {
                options.push(ClarificationOption {
                    label: "其他".to_string(),
                    description: "以上选项均不适用，手动输入".to_string(),
                    recommended: false,
                });
            }
        } else if options.len() > 4 {
            warn!(
                "Coordinator 生成了 {} 个选项（最多 4 个），自动截断",
                options.len()
            );
            // 按 recommended 优先排序后截断前 4 个，再恢复原始顺序
            let mut indexed: Vec<(usize, ClarificationOption)> =
                options.into_iter().enumerate().collect();
            indexed.sort_by(|a, b| {
                b.1.recommended
                    .cmp(&a.1.recommended)
                    .then_with(|| a.0.cmp(&b.0))
            });
            indexed.truncate(4);
            indexed.sort_by(|a, b| a.0.cmp(&b.0));
            options = indexed.into_iter().map(|(_, opt)| opt).collect();
        }

        // 兜底验证：自动修复后仍不符合则报错
        if options.len() < 2 || options.len() > 4 {
            anyhow::bail!("选择题必须包含 2 到 4 个选项（自动修复后仍不符合）");
        }
        if options
            .iter()
            .any(|option| option.label.is_empty() || option.description.is_empty())
        {
            anyhow::bail!("澄清选项 label/description 不能为空");
        }
        if options.iter().filter(|option| option.recommended).count() > 1 {
            anyhow::bail!("每个选择题最多只能有一个推荐选项（自动修复后仍不符合）");
        }

        seeds.push(ClarificationSeed {
            question,
            question_type: item.question_type,
            options,
            allow_custom: item.allow_custom,
        });
    }

    Ok(seeds)
}

fn normalize_draft(draft: GeneratedDraft) -> Result<TaskDraftSeed> {
    let title = draft.title.trim().to_string();
    let description = draft.summary.trim().to_string();
    let acceptance_criteria = draft
        .acceptance_criteria
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();

    if title.is_empty() {
        anyhow::bail!("draft.title 不能为空");
    }
    if description.is_empty() {
        anyhow::bail!("draft.summary 不能为空");
    }
    if acceptance_criteria.is_empty() {
        anyhow::bail!("draft.acceptanceCriteria 不能为空");
    }

    Ok(TaskDraftSeed {
        title,
        description,
        acceptance_criteria,
    })
}

fn extract_json_object(text: &str) -> Option<String> {
    let trimmed = text.trim();

    // 1. 尝试提取 Markdown 代码块中的 JSON
    if let Some(json) = extract_markdown_json(trimmed) {
        return Some(json);
    }

    // 2. 用栈匹配找最外层配对的 {}
    let (start, end) = find_balanced_braces(trimmed)?;
    let fragment = trimmed[start..=end].trim();

    // 3. 尝试修复常见 JSON 错误
    Some(sanitize_json_fragment(fragment))
}

/// 从 Markdown 代码块中提取 JSON 内容
fn extract_markdown_json(text: &str) -> Option<String> {
    let markers = ["```json\n", "```json ", "```\n", "``` "];
    for marker in &markers {
        if let Some(start_idx) = text.find(marker) {
            let after_marker = &text[start_idx + marker.len()..];
            if let Some(end_idx) = after_marker.find("```") {
                let content = after_marker[..end_idx].trim();
                if content.starts_with('{') {
                    return Some(content.to_string());
                }
            }
        }
    }
    None
}

/// 用栈匹配算法找第一个 { 及其配对的 }
fn find_balanced_braces(text: &str) -> Option<(usize, usize)> {
    let mut start: Option<usize> = None;
    let mut depth: usize = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for (i, ch) in text.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if in_string => escape_next = true,
            '"' => in_string = !in_string,
            '{' if !in_string => {
                if start.is_none() {
                    start = Some(i);
                }
                depth += 1;
            }
            '}' if !in_string => {
                if depth > 0 {
                    depth -= 1;
                    if depth == 0 {
                        if let Some(s) = start {
                            return Some((s, i));
                        }
                    }
                }
            }
            _ => {}
        }
    }
    None
}

/// 修复常见的 JSON 语法错误
fn sanitize_json_fragment(text: &str) -> String {
    let mut result = text.to_string();

    // 去除对象和数组中的尾部逗号
    // 先处理嵌套情况，从长到短避免重复替换问题
    result = result.replace(",\n}", "\n}");
    result = result.replace(",\n]", "\n]");
    result = result.replace(",}", "}");
    result = result.replace(",]", "]");

    result
}

fn empty_session() -> RpcSessionState {
    RpcSessionState {
        session_file: None,
        session_id: String::new(),
        is_streaming: false,
        pending_message_count: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_prompt_contains_stable_chinese_guidelines() {
        let prompt = build_initial_prompt("实现需求分析优化", None);

        assert!(prompt.contains("所有可展示给用户或会被前端记录的内容都必须使用简体中文"));
        assert!(prompt.contains("不要输出英文思考、英文过程说明或中英混杂的分析文本"));
        assert!(prompt.contains("## 稳定决策准则"));
        assert!(prompt.contains("只有当不确定点会影响实现路径、验收标准、数据兼容或安全边界时"));
        assert!(prompt.contains("选择题的推荐选项如果存在，必须放在 options 第一个位置"));
    }

    #[test]
    fn followup_prompt_reuses_stable_chinese_guidelines() {
        let prompt = build_followup_prompt("已选择最小可行范围。", None);

        assert!(prompt.contains("所有可展示给用户或会被前端记录的内容都必须使用简体中文"));
        assert!(prompt.contains("## 稳定决策准则"));
        assert!(prompt.contains("目标：用户要达成的效果是否清楚"));
        assert!(prompt.contains("如果缺失信息可以按项目既有惯例、最小可行范围或安全默认值处理"));
        assert!(prompt.contains("所有字符串字段必须使用简体中文"));
    }

    #[test]
    fn prompts_define_clarification_option_quality_rules() {
        let initial_prompt = build_initial_prompt("新增导出功能", None);
        let followup_prompt = build_followup_prompt("用户选择 CSV 导出。", None);

        for prompt in [initial_prompt, followup_prompt] {
            assert!(prompt.contains("single_choice / multi_choice 必须提供 2 到 4 个选项"));
            assert!(prompt.contains("提供 2 到 4 个互斥且有实际取舍的选项"));
            assert!(prompt.contains("推荐项最多 1 个"));
            assert!(prompt.contains("禁止生成低信息选项"));
        }
    }

    #[test]
    fn parse_ready_decision_without_clarifications() {
        let parsed = parse_decision(
            r#"{
  "status": "ready",
  "progress": "需求已经清晰，可以确认。",
  "clarifications": [],
  "draft": {
    "title": "实现聊天式澄清",
    "summary": "将需求澄清改为聊天体验。",
    "acceptanceCriteria": ["展示聊天流", "确认后归档"]
  }
}"#,
        )
        .unwrap();

        assert_eq!(parsed.status, CoordinatorStatus::Ready);
        assert!(parsed.clarifications.is_empty());
        assert_eq!(parsed.draft.unwrap().acceptance_criteria.len(), 2);
    }

    #[test]
    fn parse_needs_clarification_decision() {
        let parsed = parse_decision(
            r#"```json
{
  "status": "needs_clarification",
  "progress": "还需要确认验收方式。",
  "clarifications": [
    {
      "question": "验收方式？",
      "type": "multi_choice",
      "options": [
        {"label": "测试", "description": "运行自动化测试", "recommended": true},
        {"label": "构建", "description": "运行构建检查"}
      ],
      "allowCustom": true
    }
  ]
}
```"#,
        )
        .unwrap();

        assert_eq!(parsed.status, CoordinatorStatus::NeedsClarification);
        assert_eq!(parsed.clarifications.len(), 1);
    }

    #[test]
    fn reject_ready_with_clarifications() {
        let err = parse_decision(
            r#"{
  "status": "ready",
  "clarifications": [
    {"question": "目标？", "type": "free_text"}
  ],
  "draft": {
    "title": "标题",
    "summary": "摘要",
    "acceptanceCriteria": ["通过"]
  }
}"#,
        )
        .unwrap_err();

        assert!(err.to_string().contains("ready 状态不能包含"));
    }

    // ---- extract_json_object 测试 ----

    #[test]
    fn extracts_plain_json() {
        let text = r#"{"status": "ready", "progress": "ok"}"#;
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"status": "ready", "progress": "ok"}"#.to_string())
        );
    }

    #[test]
    fn extracts_json_from_markdown_json_block() {
        let text = "```json\n{\"status\": \"ready\"}\n```";
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"status": "ready"}"#.to_string())
        );
    }

    #[test]
    fn extracts_json_from_markdown_plain_block() {
        let text = "```\n{\"status\": \"ready\"}\n```";
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"status": "ready"}"#.to_string())
        );
    }

    #[test]
    fn extracts_json_with_explanatory_text() {
        let text = r#"这是分析结果：
{"status": "ready", "progress": "ok"}
请确认。"#;
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"status": "ready", "progress": "ok"}"#.to_string())
        );
    }

    #[test]
    fn extracts_nested_json() {
        let text = r#"{"outer": {"inner": "value"}}"#;
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"outer": {"inner": "value"}}"#.to_string())
        );
    }

    #[test]
    fn fixes_trailing_comma_in_object() {
        let text = r#"{"status": "ready", "progress": "ok",}"#;
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"status": "ready", "progress": "ok"}"#.to_string())
        );
    }

    #[test]
    fn fixes_trailing_comma_in_array() {
        let text = r#"{"items": [1, 2, 3,]}"#;
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"items": [1, 2, 3]}"#.to_string())
        );
    }

    #[test]
    fn returns_none_when_no_json() {
        assert_eq!(extract_json_object("只是一些普通文本"), None);
    }

    #[test]
    fn handles_multiple_json_objects() {
        let text = r#"{"first": 1}{"status": "ready"}"#;
        // 应该提取第一个最外层的 JSON
        assert_eq!(
            extract_json_object(text),
            Some(r#"{"first": 1}"#.to_string())
        );
    }

    // ---- 自动修复测试 ----

    #[test]
    fn auto_fixes_too_many_recommended() {
        let parsed = parse_decision(
            r#"{
  "status": "needs_clarification",
  "progress": "需要确认",
  "clarifications": [
    {
      "question": "选择哪个？",
      "type": "single_choice",
      "options": [
        {"label": "A", "description": "选项A", "recommended": true},
        {"label": "B", "description": "选项B", "recommended": true},
        {"label": "C", "description": "选项C", "recommended": true}
      ],
      "allowCustom": true
    }
  ]
}"#,
        )
        .unwrap();

        assert_eq!(parsed.status, CoordinatorStatus::NeedsClarification);
        let options = &parsed.clarifications[0].options;
        assert_eq!(options.len(), 3);
        assert!(options[0].recommended);
        assert!(!options[1].recommended);
        assert!(!options[2].recommended);
    }

    #[test]
    fn auto_fixes_too_few_options() {
        let parsed = parse_decision(
            r#"{
  "status": "needs_clarification",
  "progress": "需要确认",
  "clarifications": [
    {
      "question": "选择哪个？",
      "type": "single_choice",
      "options": [
        {"label": "A", "description": "选项A", "recommended": true}
      ],
      "allowCustom": true
    }
  ]
}"#,
        )
        .unwrap();

        assert_eq!(parsed.status, CoordinatorStatus::NeedsClarification);
        let options = &parsed.clarifications[0].options;
        assert_eq!(options.len(), 2);
        assert!(options[0].recommended);
        assert_eq!(options[1].label, "其他");
    }

    #[test]
    fn auto_fixes_too_many_options() {
        let parsed = parse_decision(
            r#"{
  "status": "needs_clarification",
  "progress": "需要确认",
  "clarifications": [
    {
      "question": "选择哪个？",
      "type": "single_choice",
      "options": [
        {"label": "A", "description": "选项A"},
        {"label": "B", "description": "选项B"},
        {"label": "C", "description": "选项C", "recommended": true},
        {"label": "D", "description": "选项D"},
        {"label": "E", "description": "选项E"},
        {"label": "F", "description": "选项F"}
      ],
      "allowCustom": true
    }
  ]
}"#,
        )
        .unwrap();

        assert_eq!(parsed.status, CoordinatorStatus::NeedsClarification);
        let options = &parsed.clarifications[0].options;
        assert_eq!(options.len(), 4);
        // recommended 的 C 应该保留
        assert!(options.iter().any(|o| o.label == "C" && o.recommended));
    }
}
