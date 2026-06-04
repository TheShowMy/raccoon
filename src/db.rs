use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

// ===== System Config =====

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SystemConfig {
    pub id: i64,
    pub coordinator_provider: String,
    pub coordinator_model: String,
    pub updated_at: String,
}

// ===== Worker Model Tier =====

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkerModelTier {
    pub id: i64,
    pub identity: String,
    pub tier_level: i64,
    pub provider: String,
    pub model: String,
    pub description: String,
    pub created_at: String,
}

// ===== Task Thinking Policy =====

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TaskThinkingPolicy {
    pub task_type: String,
    pub default_level: String,
}

// ===== Project =====

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub git_url: String,
    pub created_at: String,
}

// ===== Job / Clarification / Task Draft =====

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub original_requirement: String,
    pub status: String,
    pub current_stage: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct JobMessage {
    pub id: i64,
    pub job_id: i64,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationOption {
    pub label: String,
    pub description: String,
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationAnswer {
    pub selected_options: Vec<String>,
    pub custom_text: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ClarificationItemRow {
    id: i64,
    job_id: i64,
    question: String,
    question_type: String,
    options_json: String,
    allow_custom: i64,
    answer_json: Option<String>,
    answered_at: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarificationItem {
    pub id: i64,
    pub job_id: i64,
    pub question: String,
    pub question_type: String,
    pub options: Vec<ClarificationOption>,
    pub allow_custom: bool,
    pub answer: Option<ClarificationAnswer>,
    pub answered_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct TaskDraftRow {
    id: i64,
    job_id: i64,
    title: String,
    description: String,
    acceptance_criteria_json: String,
    status: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraft {
    pub id: i64,
    pub job_id: i64,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDetail {
    pub job: Job,
    pub messages: Vec<JobMessage>,
    pub clarifications: Vec<ClarificationItem>,
    pub task_drafts: Vec<TaskDraft>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitClarificationAnswer {
    pub clarification_id: i64,
    #[serde(default)]
    pub selected_options: Vec<String>,
    pub custom_text: Option<String>,
}

// ===== Worker Identity Enum =====

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum WorkerIdentity {
    Coder,
    Reviewer,
    Browser,
    Vision,
}

#[allow(dead_code)]
impl WorkerIdentity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Coder => "coder",
            Self::Reviewer => "reviewer",
            Self::Browser => "browser",
            Self::Vision => "vision",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Coder => "编码专家",
            Self::Reviewer => "审查员",
            Self::Browser => "浏览器操作",
            Self::Vision => "视觉分析",
        }
    }

    pub fn all() -> &'static [WorkerIdentity] {
        &[Self::Coder, Self::Reviewer, Self::Browser, Self::Vision]
    }
}

impl std::str::FromStr for WorkerIdentity {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "coder" => Ok(Self::Coder),
            "reviewer" => Ok(Self::Reviewer),
            "browser" => Ok(Self::Browser),
            "vision" => Ok(Self::Vision),
            _ => Err(format!("unknown worker identity: {s}")),
        }
    }
}

// ===== Database Initialization =====

pub async fn init_db() -> Result<Pool<Sqlite>> {
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:raccoon.db".to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Drop old tables (from previous schema)
    sqlx::query("DROP TABLE IF EXISTS model_identities")
        .execute(&pool)
        .await?;
    sqlx::query("DROP TABLE IF EXISTS model_settings")
        .execute(&pool)
        .await?;

    // Create sessions table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Create projects table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            git_url TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Create jobs table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            original_requirement TEXT NOT NULL,
            status TEXT NOT NULL,
            current_stage TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    // Create job messages table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS job_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    // Create clarification items table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS clarification_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            question TEXT NOT NULL,
            question_type TEXT NOT NULL,
            options_json TEXT NOT NULL,
            allow_custom INTEGER NOT NULL DEFAULT 1,
            answer_json TEXT,
            answered_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    // Create task drafts table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS task_drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            acceptance_criteria_json TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    // Create system_config table (single row)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS system_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            coordinator_provider TEXT NOT NULL DEFAULT '',
            coordinator_model TEXT NOT NULL DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Insert default system config if not exists
    sqlx::query(
        "INSERT OR IGNORE INTO system_config (id, coordinator_provider, coordinator_model)
         VALUES (1, '', '')",
    )
    .execute(&pool)
    .await?;

    // Create worker_model_tiers table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS worker_model_tiers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            identity TEXT NOT NULL,
            tier_level INTEGER NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(identity, tier_level)
        )",
    )
    .execute(&pool)
    .await?;

    // Create task_thinking_policies table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS task_thinking_policies (
            task_type TEXT PRIMARY KEY,
            default_level TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await?;

    // Seed default thinking policies
    seed_task_thinking_policies(&pool).await?;

    Ok(pool)
}

async fn seed_task_thinking_policies(pool: &Pool<Sqlite>) -> Result<()> {
    let policies = [
        ("requirement_analysis", "high"),
        ("architecture_design", "high"),
        ("coding", "medium"),
        ("review", "medium"),
        ("batch_execution", "off"),
        ("browser_operation", "low"),
        ("vision_analysis", "medium"),
    ];

    for (task_type, default_level) in &policies {
        sqlx::query(
            "INSERT OR IGNORE INTO task_thinking_policies (task_type, default_level)
             VALUES ($1, $2)",
        )
        .bind(task_type)
        .bind(default_level)
        .execute(pool)
        .await?;
    }

    Ok(())
}

// ===== System Config CRUD =====

pub async fn get_system_config(pool: &Pool<Sqlite>) -> Result<SystemConfig> {
    let config = sqlx::query_as::<_, SystemConfig>(
        "SELECT id, coordinator_provider, coordinator_model, updated_at
         FROM system_config WHERE id = 1",
    )
    .fetch_one(pool)
    .await?;

    Ok(config)
}

pub async fn update_system_config(
    pool: &Pool<Sqlite>,
    coordinator_provider: &str,
    coordinator_model: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE system_config
         SET coordinator_provider = $1, coordinator_model = $2, updated_at = datetime('now')
         WHERE id = 1",
    )
    .bind(coordinator_provider)
    .bind(coordinator_model)
    .execute(pool)
    .await?;

    Ok(())
}

// ===== Worker Model Tier CRUD =====

pub async fn get_worker_model_tiers(pool: &Pool<Sqlite>) -> Result<Vec<WorkerModelTier>> {
    let tiers = sqlx::query_as::<_, WorkerModelTier>(
        "SELECT id, identity, tier_level, provider, model, description, created_at
         FROM worker_model_tiers
         ORDER BY identity ASC, tier_level ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(tiers)
}

pub async fn create_worker_model_tier(
    pool: &Pool<Sqlite>,
    identity: &str,
    tier_level: i64,
    provider: &str,
    model: &str,
    description: &str,
) -> Result<WorkerModelTier> {
    let id = sqlx::query(
        "INSERT INTO worker_model_tiers (identity, tier_level, provider, model, description)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(identity)
    .bind(tier_level)
    .bind(provider)
    .bind(model)
    .bind(description)
    .execute(pool)
    .await?
    .last_insert_rowid();

    let tier = sqlx::query_as::<_, WorkerModelTier>(
        "SELECT id, identity, tier_level, provider, model, description, created_at
         FROM worker_model_tiers WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(tier)
}

pub async fn update_worker_model_tier(
    pool: &Pool<Sqlite>,
    id: i64,
    identity: &str,
    tier_level: i64,
    provider: &str,
    model: &str,
    description: &str,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE worker_model_tiers
         SET identity = $1, tier_level = $2, provider = $3, model = $4, description = $5
         WHERE id = $6",
    )
    .bind(identity)
    .bind(tier_level)
    .bind(provider)
    .bind(model)
    .bind(description)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete_worker_model_tier(pool: &Pool<Sqlite>, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM worker_model_tiers WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ===== Task Thinking Policy CRUD =====

pub async fn get_task_thinking_policies(pool: &Pool<Sqlite>) -> Result<Vec<TaskThinkingPolicy>> {
    let policies = sqlx::query_as::<_, TaskThinkingPolicy>(
        "SELECT task_type, default_level
         FROM task_thinking_policies
         ORDER BY task_type ASC",
    )
    .fetch_all(pool)
    .await?;

    Ok(policies)
}

// ===== Project CRUD =====

pub async fn get_projects(pool: &Pool<Sqlite>) -> Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT id, name, git_url, created_at FROM projects ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

pub async fn create_project(pool: &Pool<Sqlite>, name: &str, git_url: &str) -> Result<Project> {
    let id = sqlx::query("INSERT INTO projects (name, git_url) VALUES ($1, $2)")
        .bind(name)
        .bind(git_url)
        .execute(pool)
        .await?
        .last_insert_rowid();

    let project = sqlx::query_as::<_, Project>(
        "SELECT id, name, git_url, created_at FROM projects WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(project)
}

pub async fn delete_project(pool: &Pool<Sqlite>, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ===== Job CRUD / Clarification Flow =====

pub async fn project_exists(pool: &Pool<Sqlite>, project_id: i64) -> Result<bool> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects WHERE id = $1")
        .bind(project_id)
        .fetch_one(pool)
        .await?;

    Ok(count > 0)
}

pub async fn create_job_with_clarifications(
    pool: &Pool<Sqlite>,
    project_id: i64,
    original_requirement: &str,
) -> Result<JobDetail> {
    if !project_exists(pool, project_id).await? {
        anyhow::bail!("项目不存在");
    }

    let title = derive_job_title(original_requirement);
    let job_id = sqlx::query(
        "INSERT INTO jobs (project_id, title, original_requirement, status, current_stage)
         VALUES ($1, $2, $3, 'clarifying', 'clarification')",
    )
    .bind(project_id)
    .bind(&title)
    .bind(original_requirement)
    .execute(pool)
    .await?
    .last_insert_rowid();

    insert_job_message(pool, job_id, "user", original_requirement).await?;
    insert_job_message(
        pool,
        job_id,
        "coordinator",
        "我先确认几个关键选择，再整理可执行任务草案。",
    )
    .await?;

    for item in default_clarification_items() {
        insert_clarification_item(
            pool,
            job_id,
            item.question,
            item.question_type,
            item.options,
            item.allow_custom,
        )
        .await?;
    }

    get_job_detail(pool, job_id).await
}

pub async fn get_project_jobs(pool: &Pool<Sqlite>, project_id: i64) -> Result<Vec<Job>> {
    let jobs = sqlx::query_as::<_, Job>(
        "SELECT id, project_id, title, original_requirement, status, current_stage,
                created_at, updated_at
         FROM jobs
         WHERE project_id = $1
         ORDER BY updated_at DESC, id DESC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await?;

    Ok(jobs)
}

pub async fn get_job_detail(pool: &Pool<Sqlite>, job_id: i64) -> Result<JobDetail> {
    let job = get_job(pool, job_id).await?;
    let messages = get_job_messages(pool, job_id).await?;
    let clarifications = get_clarification_items(pool, job_id).await?;
    let task_drafts = get_task_drafts(pool, job_id).await?;

    Ok(JobDetail {
        job,
        messages,
        clarifications,
        task_drafts,
    })
}

pub async fn submit_clarification_answers(
    pool: &Pool<Sqlite>,
    job_id: i64,
    answers: &[SubmitClarificationAnswer],
) -> Result<JobDetail> {
    let _job = get_job(pool, job_id).await?;
    if answers.is_empty() {
        anyhow::bail!("至少需要提交一个澄清答案");
    }

    for answer in answers {
        let belongs_to_job: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM clarification_items WHERE id = $1 AND job_id = $2",
        )
        .bind(answer.clarification_id)
        .bind(job_id)
        .fetch_one(pool)
        .await?;

        if belongs_to_job == 0 {
            anyhow::bail!("澄清项不存在或不属于当前 Job");
        }

        let normalized = ClarificationAnswer {
            selected_options: answer.selected_options.clone(),
            custom_text: answer
                .custom_text
                .as_ref()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
        };
        let answer_json = serde_json::to_string(&normalized)?;

        sqlx::query(
            "UPDATE clarification_items
             SET answer_json = $1, answered_at = datetime('now')
             WHERE id = $2 AND job_id = $3",
        )
        .bind(answer_json)
        .bind(answer.clarification_id)
        .bind(job_id)
        .execute(pool)
        .await?;
    }

    insert_job_message(pool, job_id, "user", "已提交澄清答案。").await?;

    if all_clarifications_answered(pool, job_id).await? {
        ensure_task_drafts(pool, job_id).await?;
        sqlx::query(
            "UPDATE jobs
             SET status = 'draft_ready', current_stage = 'task_draft', updated_at = datetime('now')
             WHERE id = $1",
        )
        .bind(job_id)
        .execute(pool)
        .await?;
        insert_job_message(
            pool,
            job_id,
            "coordinator",
            "已根据澄清答案整理任务草案，请确认后进入待执行。",
        )
        .await?;
    } else {
        touch_job(pool, job_id).await?;
    }

    get_job_detail(pool, job_id).await
}

pub async fn confirm_job(pool: &Pool<Sqlite>, job_id: i64) -> Result<JobDetail> {
    let _job = get_job(pool, job_id).await?;
    ensure_task_drafts(pool, job_id).await?;

    sqlx::query("UPDATE task_drafts SET status = 'confirmed' WHERE job_id = $1")
        .bind(job_id)
        .execute(pool)
        .await?;

    sqlx::query(
        "UPDATE jobs
         SET status = 'confirmed', current_stage = 'pending_execution', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    insert_job_message(
        pool,
        job_id,
        "system",
        "任务草案已确认，等待后续执行链路接入。",
    )
    .await?;

    get_job_detail(pool, job_id).await
}

async fn get_job(pool: &Pool<Sqlite>, job_id: i64) -> Result<Job> {
    let job = sqlx::query_as::<_, Job>(
        "SELECT id, project_id, title, original_requirement, status, current_stage,
                created_at, updated_at
         FROM jobs WHERE id = $1",
    )
    .bind(job_id)
    .fetch_one(pool)
    .await?;

    Ok(job)
}

async fn get_job_messages(pool: &Pool<Sqlite>, job_id: i64) -> Result<Vec<JobMessage>> {
    let messages = sqlx::query_as::<_, JobMessage>(
        "SELECT id, job_id, role, content, created_at
         FROM job_messages
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    Ok(messages)
}

async fn get_clarification_items(
    pool: &Pool<Sqlite>,
    job_id: i64,
) -> Result<Vec<ClarificationItem>> {
    let rows = sqlx::query_as::<_, ClarificationItemRow>(
        "SELECT id, job_id, question, question_type, options_json, allow_custom,
                answer_json, answered_at, created_at
         FROM clarification_items
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(ClarificationItem::try_from).collect()
}

async fn get_task_drafts(pool: &Pool<Sqlite>, job_id: i64) -> Result<Vec<TaskDraft>> {
    let rows = sqlx::query_as::<_, TaskDraftRow>(
        "SELECT id, job_id, title, description, acceptance_criteria_json, status, created_at
         FROM task_drafts
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(TaskDraft::try_from).collect()
}

async fn insert_job_message(
    pool: &Pool<Sqlite>,
    job_id: i64,
    role: &str,
    content: &str,
) -> Result<()> {
    sqlx::query("INSERT INTO job_messages (job_id, role, content) VALUES ($1, $2, $3)")
        .bind(job_id)
        .bind(role)
        .bind(content)
        .execute(pool)
        .await?;
    Ok(())
}

async fn insert_clarification_item(
    pool: &Pool<Sqlite>,
    job_id: i64,
    question: String,
    question_type: String,
    options: Vec<ClarificationOption>,
    allow_custom: bool,
) -> Result<()> {
    let options_json = serde_json::to_string(&options)?;
    sqlx::query(
        "INSERT INTO clarification_items
            (job_id, question, question_type, options_json, allow_custom)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(job_id)
    .bind(question)
    .bind(question_type)
    .bind(options_json)
    .bind(if allow_custom { 1 } else { 0 })
    .execute(pool)
    .await?;
    Ok(())
}

async fn all_clarifications_answered(pool: &Pool<Sqlite>, job_id: i64) -> Result<bool> {
    let unanswered: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM clarification_items
         WHERE job_id = $1 AND answer_json IS NULL",
    )
    .bind(job_id)
    .fetch_one(pool)
    .await?;

    Ok(unanswered == 0)
}

async fn ensure_task_drafts(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM task_drafts WHERE job_id = $1")
        .bind(job_id)
        .fetch_one(pool)
        .await?;
    if existing > 0 {
        return Ok(());
    }

    let drafts = [
        (
            "需求确认与执行边界",
            "整理用户原始需求和澄清答案，形成最终实现范围。",
            vec![
                "保留原始需求记录",
                "所有澄清项均有答案",
                "任务草案可被用户确认",
            ],
        ),
        (
            "代码实现",
            "按确认后的任务范围修改项目代码，并保持改动聚焦。",
            vec![
                "实现范围与确认内容一致",
                "不引入无关重构",
                "必要错误状态可被用户理解",
            ],
        ),
        (
            "验证与交付",
            "运行确定性检查并汇总交付结果。",
            vec!["后端检查通过", "前端构建通过", "交付说明包含验证结果"],
        ),
    ];

    for (title, description, acceptance_criteria) in drafts {
        let criteria_json = serde_json::to_string(&acceptance_criteria)?;
        sqlx::query(
            "INSERT INTO task_drafts
                (job_id, title, description, acceptance_criteria_json, status)
             VALUES ($1, $2, $3, $4, 'draft')",
        )
        .bind(job_id)
        .bind(title)
        .bind(description)
        .bind(criteria_json)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn touch_job(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    sqlx::query("UPDATE jobs SET updated_at = datetime('now') WHERE id = $1")
        .bind(job_id)
        .execute(pool)
        .await?;
    Ok(())
}

fn derive_job_title(requirement: &str) -> String {
    let compact = requirement
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(requirement)
        .trim();
    let mut title: String = compact.chars().take(36).collect();
    if compact.chars().count() > 36 {
        title.push_str("...");
    }
    if title.is_empty() {
        "未命名需求".to_string()
    } else {
        title
    }
}

struct ClarificationSeed {
    question: String,
    question_type: String,
    options: Vec<ClarificationOption>,
    allow_custom: bool,
}

fn default_clarification_items() -> Vec<ClarificationSeed> {
    vec![
        ClarificationSeed {
            question: "这次需求的主要交付目标是什么？".to_string(),
            question_type: "single_choice".to_string(),
            options: vec![
                option("直接修改代码", "确认后直接进入实现任务草案。", true),
                option("先产出技术方案", "优先整理设计、风险和拆分方案。", false),
                option("只做代码审查", "以问题发现和修改建议为主。", false),
            ],
            allow_custom: true,
        },
        ClarificationSeed {
            question: "你希望这次验收包含哪些检查？".to_string(),
            question_type: "multi_choice".to_string(),
            options: vec![
                option("自动化测试", "运行现有单元测试或检查命令。", true),
                option("前端手工验证", "打开页面验证核心交互。", false),
                option(
                    "构建检查",
                    "运行 cargo check、前端 build 或全量 check。",
                    true,
                ),
            ],
            allow_custom: true,
        },
        ClarificationSeed {
            question: "还有哪些必须包含或排除的范围？".to_string(),
            question_type: "free_text".to_string(),
            options: Vec::new(),
            allow_custom: true,
        },
    ]
}

fn option(label: &str, description: &str, recommended: bool) -> ClarificationOption {
    ClarificationOption {
        label: label.to_string(),
        description: description.to_string(),
        recommended,
    }
}

impl TryFrom<ClarificationItemRow> for ClarificationItem {
    type Error = anyhow::Error;

    fn try_from(row: ClarificationItemRow) -> Result<Self> {
        let options =
            serde_json::from_str(&row.options_json).with_context(|| "解析澄清选项失败")?;
        let answer = match row.answer_json {
            Some(answer_json) => {
                Some(serde_json::from_str(&answer_json).with_context(|| "解析澄清答案失败")?)
            }
            None => None,
        };

        Ok(Self {
            id: row.id,
            job_id: row.job_id,
            question: row.question,
            question_type: row.question_type,
            options,
            allow_custom: row.allow_custom == 1,
            answer,
            answered_at: row.answered_at,
            created_at: row.created_at,
        })
    }
}

impl TryFrom<TaskDraftRow> for TaskDraft {
    type Error = anyhow::Error;

    fn try_from(row: TaskDraftRow) -> Result<Self> {
        let acceptance_criteria = serde_json::from_str(&row.acceptance_criteria_json)
            .with_context(|| "解析任务草案验收标准失败")?;

        Ok(Self {
            id: row.id,
            job_id: row.job_id,
            title: row.title,
            description: row.description,
            acceptance_criteria,
            status: row.status,
            created_at: row.created_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn memory_pool() -> Pool<Sqlite> {
        std::env::set_var("DATABASE_URL", "sqlite::memory:");
        init_db().await.expect("init memory db")
    }

    #[tokio::test]
    async fn job_clarification_flow_generates_and_confirms_task_drafts() {
        let pool = memory_pool().await;
        update_system_config(&pool, "test-provider", "test-model")
            .await
            .unwrap();
        let project = create_project(&pool, "测试项目", "https://example.com/repo.git")
            .await
            .unwrap();

        let detail = create_job_with_clarifications(&pool, project.id, "实现需求澄清闭环")
            .await
            .unwrap();
        assert_eq!(detail.job.status, "clarifying");
        assert_eq!(detail.clarifications.len(), 3);
        assert!(detail.task_drafts.is_empty());

        let answers: Vec<SubmitClarificationAnswer> = detail
            .clarifications
            .iter()
            .map(|item| SubmitClarificationAnswer {
                clarification_id: item.id,
                selected_options: item
                    .options
                    .first()
                    .map(|option| vec![option.label.clone()])
                    .unwrap_or_default(),
                custom_text: if item.question_type == "free_text" {
                    Some("不包含执行链路".to_string())
                } else {
                    None
                },
            })
            .collect();

        let detail = submit_clarification_answers(&pool, detail.job.id, &answers)
            .await
            .unwrap();
        assert_eq!(detail.job.status, "draft_ready");
        assert_eq!(detail.task_drafts.len(), 3);
        assert!(detail
            .clarifications
            .iter()
            .all(|item| item.answer.is_some()));

        let detail = confirm_job(&pool, detail.job.id).await.unwrap();
        assert_eq!(detail.job.status, "confirmed");
        assert_eq!(detail.job.current_stage, "pending_execution");
        assert!(detail
            .task_drafts
            .iter()
            .all(|draft| draft.status == "confirmed"));
    }

    #[tokio::test]
    async fn create_job_rejects_unknown_project() {
        let pool = memory_pool().await;
        let err = create_job_with_clarifications(&pool, 404, "不存在项目")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("项目不存在"));
    }
}
