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

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub git_url: String,
    pub local_path: Option<String>,
    pub clone_status: Option<String>,
    pub clone_error: Option<String>,
    pub last_synced_at: Option<String>,
    pub created_at: String,
}

// ===== Job / Clarification / Task Draft =====

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub original_requirement: String,
    pub status: String,
    pub current_stage: String,
    pub coordinator_session_id: Option<String>,
    pub coordinator_session_file: Option<String>,
    pub clarification_round: i64,
    pub archived_at: Option<String>,
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
    pub metadata_json: Option<String>,
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

#[derive(Debug, Clone)]
pub struct TaskDraftSeed {
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct DagNodeRow {
    id: i64,
    job_id: i64,
    node_key: String,
    title: String,
    kind: String,
    worker_identity: String,
    status: String,
    instructions: String,
    acceptance_criteria_json: String,
    target_files_json: String,
    worktree_path: Option<String>,
    session_id: Option<String>,
    session_file: Option<String>,
    retry_count: i64,
    error_message: Option<String>,
    result_summary: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DagNode {
    pub id: i64,
    pub job_id: i64,
    pub node_key: String,
    pub title: String,
    pub kind: String,
    pub worker_identity: String,
    pub status: String,
    pub instructions: String,
    pub acceptance_criteria: Vec<String>,
    pub target_files: Vec<String>,
    pub worktree_path: Option<String>,
    pub session_id: Option<String>,
    pub session_file: Option<String>,
    pub retry_count: i64,
    pub error_message: Option<String>,
    pub result_summary: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DagEdge {
    pub id: i64,
    pub job_id: i64,
    pub from_node_id: i64,
    pub to_node_id: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct DagRun {
    pub id: i64,
    pub job_id: i64,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, sqlx::FromRow)]
struct TaskArtifactRow {
    id: i64,
    job_id: i64,
    node_id: i64,
    artifact_type: String,
    path: Option<String>,
    content: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskArtifact {
    pub id: i64,
    pub job_id: i64,
    pub node_id: i64,
    pub artifact_type: String,
    pub path: Option<String>,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct DagNodeSeed {
    pub node_key: String,
    pub title: String,
    pub kind: String,
    pub worker_identity: String,
    pub instructions: String,
    pub acceptance_criteria: Vec<String>,
    pub target_files: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DagEdgeSeed {
    pub from_node_key: String,
    pub to_node_key: String,
}

#[derive(Debug, Clone)]
pub struct TaskArtifactSeed {
    pub node_id: i64,
    pub artifact_type: String,
    pub path: Option<String>,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDetail {
    pub job: Job,
    pub messages: Vec<JobMessage>,
    pub clarifications: Vec<ClarificationItem>,
    pub task_drafts: Vec<TaskDraft>,
    pub dag_nodes: Vec<DagNode>,
    pub dag_edges: Vec<DagEdge>,
    pub task_artifacts: Vec<TaskArtifact>,
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
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA foreign_keys = ON")
                    .execute(conn)
                    .await?;
                Ok(())
            })
        })
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
            local_path TEXT,
            clone_status TEXT DEFAULT 'pending',
            clone_error TEXT,
            last_synced_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Migrate existing projects table
    add_column_if_missing(&pool, "projects", "local_path", "TEXT").await?;
    add_column_if_missing(&pool, "projects", "clone_status", "TEXT DEFAULT 'pending'").await?;
    add_column_if_missing(&pool, "projects", "clone_error", "TEXT").await?;
    add_column_if_missing(&pool, "projects", "last_synced_at", "DATETIME").await?;

    // Create jobs table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            original_requirement TEXT NOT NULL,
            status TEXT NOT NULL,
            current_stage TEXT NOT NULL,
            coordinator_session_id TEXT,
            coordinator_session_file TEXT,
            clarification_round INTEGER NOT NULL DEFAULT 0,
            archived_at DATETIME,
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
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    migrate_job_tables(&pool).await?;

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

    // Create DAG nodes table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dag_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            node_key TEXT NOT NULL,
            title TEXT NOT NULL,
            kind TEXT NOT NULL,
            worker_identity TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            instructions TEXT NOT NULL,
            acceptance_criteria_json TEXT NOT NULL,
            target_files_json TEXT NOT NULL,
            worktree_path TEXT,
            session_id TEXT,
            session_file TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            result_summary TEXT,
            started_at DATETIME,
            finished_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            UNIQUE(job_id, node_key)
        )",
    )
    .execute(&pool)
    .await?;

    // Create DAG edges table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dag_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            from_node_id INTEGER NOT NULL,
            to_node_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(from_node_id) REFERENCES dag_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY(to_node_id) REFERENCES dag_nodes(id) ON DELETE CASCADE,
            UNIQUE(job_id, from_node_id, to_node_id)
        )",
    )
    .execute(&pool)
    .await?;

    // Create DAG runs table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dag_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at DATETIME,
            finished_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    // Create task artifacts table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS task_artifacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL,
            node_id INTEGER NOT NULL,
            artifact_type TEXT NOT NULL,
            path TEXT,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(node_id) REFERENCES dag_nodes(id) ON DELETE CASCADE
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

async fn migrate_job_tables(pool: &Pool<Sqlite>) -> Result<()> {
    add_column_if_missing(pool, "jobs", "coordinator_session_id", "TEXT").await?;
    add_column_if_missing(pool, "jobs", "coordinator_session_file", "TEXT").await?;
    add_column_if_missing(
        pool,
        "jobs",
        "clarification_round",
        "INTEGER NOT NULL DEFAULT 0",
    )
    .await?;
    add_column_if_missing(pool, "jobs", "archived_at", "DATETIME").await?;
    add_column_if_missing(pool, "job_messages", "metadata_json", "TEXT").await?;
    sqlx::query(
        "UPDATE jobs
         SET status = 'archived',
             current_stage = 'archived',
             archived_at = COALESCE(archived_at, updated_at)
         WHERE status = 'confirmed' AND archived_at IS NULL",
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn add_column_if_missing(
    pool: &Pool<Sqlite>,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<()> {
    let pragma = format!("SELECT name FROM pragma_table_info('{table}')");
    let columns: Vec<(String,)> = sqlx::query_as(&pragma).fetch_all(pool).await?;
    if columns.iter().any(|(name,)| name == column) {
        return Ok(());
    }

    let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {definition}");
    sqlx::query(&sql).execute(pool).await?;
    Ok(())
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

pub async fn get_task_thinking_level(pool: &Pool<Sqlite>, task_type: &str) -> Result<String> {
    let level = sqlx::query_scalar::<_, String>(
        "SELECT default_level
         FROM task_thinking_policies
         WHERE task_type = $1",
    )
    .bind(task_type)
    .fetch_one(pool)
    .await?;

    Ok(level)
}

// ===== Project CRUD =====

pub async fn get_projects(pool: &Pool<Sqlite>) -> Result<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT id, name, git_url, local_path, clone_status, clone_error, last_synced_at, created_at
         FROM projects ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(projects)
}

pub async fn get_project(pool: &Pool<Sqlite>, project_id: i64) -> Result<Project> {
    let project = sqlx::query_as::<_, Project>(
        "SELECT id, name, git_url, local_path, clone_status, clone_error, last_synced_at, created_at
         FROM projects WHERE id = $1",
    )
    .bind(project_id)
    .fetch_one(pool)
    .await?;

    Ok(project)
}

pub async fn create_project(pool: &Pool<Sqlite>, name: &str, git_url: &str) -> Result<Project> {
    let id = sqlx::query("INSERT INTO projects (name, git_url) VALUES ($1, $2)")
        .bind(name)
        .bind(git_url)
        .execute(pool)
        .await?
        .last_insert_rowid();

    let project = sqlx::query_as::<_, Project>(
        "SELECT id, name, git_url, local_path, clone_status, clone_error, last_synced_at, created_at
         FROM projects WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(project)
}

pub async fn update_project_clone_status(
    pool: &Pool<Sqlite>,
    project_id: i64,
    local_path: Option<&str>,
    clone_status: &str,
    clone_error: Option<&str>,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE projects
         SET local_path = $1,
             clone_status = $2,
             clone_error = $3,
             last_synced_at = datetime('now')
         WHERE id = $4",
    )
    .bind(local_path)
    .bind(clone_status)
    .bind(clone_error)
    .bind(project_id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
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

pub async fn create_analyzing_job(
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
         VALUES ($1, $2, $3, 'analyzing', 'requirement_analysis')",
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
        "我正在分析需求，判断是否需要进一步澄清。",
    )
    .await?;

    get_job_detail(pool, job_id).await
}

pub async fn set_job_coordinator_session(
    pool: &Pool<Sqlite>,
    job_id: i64,
    session_id: Option<&str>,
    session_file: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET coordinator_session_id = $1, coordinator_session_file = $2, updated_at = datetime('now')
         WHERE id = $3",
    )
    .bind(session_id)
    .bind(session_file)
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn apply_clarification_items(
    pool: &Pool<Sqlite>,
    job_id: i64,
    progress: &str,
    clarifications: Vec<ClarificationSeed>,
    fallback_reason: Option<&str>,
) -> Result<JobDetail> {
    if clarifications.is_empty() {
        anyhow::bail!("至少需要一个澄清项");
    }

    sqlx::query("DELETE FROM clarification_items WHERE job_id = $1 AND answer_json IS NULL")
        .bind(job_id)
        .execute(pool)
        .await?;

    for item in clarifications {
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

    sqlx::query(
        "UPDATE jobs
         SET status = 'clarifying',
             current_stage = 'clarification',
             clarification_round = clarification_round + 1,
             updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    insert_job_message(
        pool,
        job_id,
        "coordinator",
        if progress.trim().is_empty() {
            "我需要再确认几个关键点。"
        } else {
            progress.trim()
        },
    )
    .await?;

    if let Some(reason) = fallback_reason {
        insert_job_message(
            pool,
            job_id,
            "system",
            &format!("Coordinator 生成澄清失败，已使用模板澄清。原因：{reason}"),
        )
        .await?;
    }

    get_job_detail(pool, job_id).await
}

pub async fn apply_task_draft(
    pool: &Pool<Sqlite>,
    job_id: i64,
    progress: &str,
    draft: TaskDraftSeed,
) -> Result<JobDetail> {
    sqlx::query("DELETE FROM task_drafts WHERE job_id = $1")
        .bind(job_id)
        .execute(pool)
        .await?;

    insert_task_draft(pool, job_id, draft).await?;

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
        if progress.trim().is_empty() {
            "需求已经足够清晰，我已整理确认卡片。"
        } else {
            progress.trim()
        },
    )
    .await?;

    get_job_detail(pool, job_id).await
}

pub async fn get_project_jobs(
    pool: &Pool<Sqlite>,
    project_id: i64,
    include_archived: bool,
) -> Result<Vec<Job>> {
    let archived_filter = if include_archived {
        ""
    } else {
        "AND archived_at IS NULL"
    };
    let sql = format!(
        "SELECT id, project_id, title, original_requirement, status, current_stage,
                coordinator_session_id, coordinator_session_file, clarification_round, archived_at,
                created_at, updated_at
         FROM jobs
         WHERE project_id = $1 {archived_filter}
         ORDER BY updated_at DESC, id DESC"
    );
    let jobs = sqlx::query_as::<_, Job>(&sql)
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
    let dag_nodes = get_dag_nodes(pool, job_id).await?;
    let dag_edges = get_dag_edges(pool, job_id).await?;
    let task_artifacts = get_task_artifacts(pool, job_id).await?;

    Ok(JobDetail {
        job,
        messages,
        clarifications,
        task_drafts,
        dag_nodes,
        dag_edges,
        task_artifacts,
    })
}

pub async fn apply_dag_plan(
    pool: &Pool<Sqlite>,
    job_id: i64,
    nodes: Vec<DagNodeSeed>,
    edges: Vec<DagEdgeSeed>,
) -> Result<JobDetail> {
    if nodes.is_empty() {
        anyhow::bail!("DAG 至少需要一个节点");
    }

    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM task_artifacts WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM dag_edges WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM dag_nodes WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM dag_runs WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;

    let mut node_ids = std::collections::HashMap::new();
    for node in nodes {
        let acceptance_json = serde_json::to_string(&node.acceptance_criteria)?;
        let target_files_json = serde_json::to_string(&node.target_files)?;
        let id = sqlx::query(
            "INSERT INTO dag_nodes
             (job_id, node_key, title, kind, worker_identity, status, instructions,
              acceptance_criteria_json, target_files_json)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)",
        )
        .bind(job_id)
        .bind(&node.node_key)
        .bind(&node.title)
        .bind(&node.kind)
        .bind(&node.worker_identity)
        .bind(&node.instructions)
        .bind(acceptance_json)
        .bind(target_files_json)
        .execute(&mut *tx)
        .await?
        .last_insert_rowid();
        node_ids.insert(node.node_key, id);
    }

    for edge in edges {
        let from_id = node_ids
            .get(&edge.from_node_key)
            .copied()
            .with_context(|| format!("DAG 依赖源节点不存在: {}", edge.from_node_key))?;
        let to_id = node_ids
            .get(&edge.to_node_key)
            .copied()
            .with_context(|| format!("DAG 依赖目标节点不存在: {}", edge.to_node_key))?;
        sqlx::query(
            "INSERT OR IGNORE INTO dag_edges (job_id, from_node_id, to_node_id)
             VALUES ($1, $2, $3)",
        )
        .bind(job_id)
        .bind(from_id)
        .bind(to_id)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        "INSERT INTO dag_runs (job_id, status, started_at)
         VALUES ($1, 'pending', datetime('now'))",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE jobs
         SET status = 'dag_ready', current_stage = 'dag_execution', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "INSERT INTO job_messages (job_id, role, content)
         VALUES ($1, 'coordinator', '任务 DAG 已生成，准备执行。')",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    get_job_detail(pool, job_id).await
}

pub async fn mark_job_dag_planning(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'dag_planning', current_stage = 'dag_planning', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_job_dag_planning_failed(
    pool: &Pool<Sqlite>,
    job_id: i64,
    reason: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'dag_planning_failed', current_stage = 'dag_planning', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    insert_job_message(pool, job_id, "system", reason).await?;
    Ok(())
}

pub async fn reset_job_for_replan(pool: &Pool<Sqlite>, job_id: i64) -> Result<JobDetail> {
    let mut tx = pool.begin().await?;

    // 删除 dag_nodes 会自动级联删除 dag_edges 和 task_artifacts
    sqlx::query("DELETE FROM dag_nodes WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;

    // 删除 dag_runs
    sqlx::query("DELETE FROM dag_runs WHERE job_id = $1")
        .bind(job_id)
        .execute(&mut *tx)
        .await?;

    // 重置状态为 dag_planning
    sqlx::query(
        "UPDATE jobs
         SET status = 'dag_planning', current_stage = 'dag_planning', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    insert_job_message(
        pool,
        job_id,
        "system",
        "重新规划 DAG，清理旧数据并重新生成任务拆分。",
    )
    .await?;

    get_job_detail(pool, job_id).await
}

pub async fn mark_job_executing(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'executing', current_stage = 'dag_execution', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE dag_runs
         SET status = 'running', started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now')
         WHERE job_id = $1 AND status IN ('pending', 'running')",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn resume_job_for_execution(pool: &Pool<Sqlite>, job_id: i64) -> Result<JobDetail> {
    let mut tx = pool.begin().await?;

    // 重置失败节点状态为 pending，清除错误信息
    sqlx::query(
        "UPDATE dag_nodes
         SET status = 'pending',
             error_message = NULL,
             result_summary = NULL,
             retry_count = retry_count + 1,
             started_at = NULL,
             finished_at = NULL,
             updated_at = datetime('now')
         WHERE job_id = $1 AND status = 'failed'",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    // 重置 job 状态为 executing
    sqlx::query(
        "UPDATE jobs
         SET status = 'executing', current_stage = 'dag_execution', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    insert_job_message(pool, job_id, "system", "恢复 DAG 执行，从失败节点继续。").await?;

    get_job_detail(pool, job_id).await
}

pub async fn mark_job_completed(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'completed', current_stage = 'completed', archived_at = datetime('now'), updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE dag_runs
         SET status = 'succeeded', finished_at = datetime('now'), updated_at = datetime('now')
         WHERE job_id = $1 AND status IN ('pending', 'running')",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    insert_job_message(pool, job_id, "system", "DAG 执行完成，任务已完成。").await?;
    Ok(())
}

pub async fn mark_job_blocked(pool: &Pool<Sqlite>, job_id: i64, reason: &str) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'blocked', current_stage = 'blocked', updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE dag_runs
         SET status = 'blocked', finished_at = datetime('now'), updated_at = datetime('now')
         WHERE job_id = $1 AND status IN ('pending', 'running')",
    )
    .bind(job_id)
    .execute(pool)
    .await?;
    insert_job_message(pool, job_id, "system", reason).await?;
    Ok(())
}

pub async fn update_dag_node_status(
    pool: &Pool<Sqlite>,
    node_id: i64,
    status: &str,
    result_summary: Option<&str>,
    error_message: Option<&str>,
) -> Result<()> {
    let started_at_expr = if status == "running" {
        "datetime('now')"
    } else {
        "started_at"
    };
    let finished_at_expr = if matches!(status, "succeeded" | "failed" | "blocked") {
        "datetime('now')"
    } else {
        "finished_at"
    };
    let sql = format!(
        "UPDATE dag_nodes
         SET status = $1,
             result_summary = $2,
             error_message = $3,
             started_at = {started_at_expr},
             finished_at = {finished_at_expr},
             updated_at = datetime('now')
         WHERE id = $4"
    );
    sqlx::query(&sql)
        .bind(status)
        .bind(result_summary)
        .bind(error_message)
        .bind(node_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_dag_node_worktree(
    pool: &Pool<Sqlite>,
    node_id: i64,
    worktree_path: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE dag_nodes
         SET worktree_path = $1, updated_at = datetime('now')
         WHERE id = $2",
    )
    .bind(worktree_path)
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_task_artifact(
    pool: &Pool<Sqlite>,
    job_id: i64,
    artifact: TaskArtifactSeed,
) -> Result<TaskArtifact> {
    let id = sqlx::query(
        "INSERT INTO task_artifacts (job_id, node_id, artifact_type, path, content)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(job_id)
    .bind(artifact.node_id)
    .bind(&artifact.artifact_type)
    .bind(&artifact.path)
    .bind(&artifact.content)
    .execute(pool)
    .await?
    .last_insert_rowid();

    let row = sqlx::query_as::<_, TaskArtifactRow>(
        "SELECT id, job_id, node_id, artifact_type, path, content, created_at
         FROM task_artifacts WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;
    TaskArtifact::try_from(row)
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

    let summary = summarize_answers(pool, job_id, answers).await?;
    insert_job_message(pool, job_id, "user", &summary).await?;

    if all_clarifications_answered(pool, job_id).await? {
        sqlx::query(
            "UPDATE jobs
             SET status = 'analyzing', current_stage = 'requirement_analysis', updated_at = datetime('now')
             WHERE id = $1",
        )
        .bind(job_id)
        .execute(pool)
        .await?;
        insert_job_message(
            pool,
            job_id,
            "coordinator",
            "我已收到澄清答案，正在继续判断是否可以确认需求。",
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
         SET status = 'archived',
             current_stage = 'archived',
             archived_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    insert_job_message(
        pool,
        job_id,
        "system",
        "需求已确认，当前澄清会话已归档。后台将自动进入任务规划与执行。",
    )
    .await?;

    get_job_detail(pool, job_id).await
}

pub async fn delete_job(pool: &Pool<Sqlite>, job_id: i64) -> Result<()> {
    sqlx::query("DELETE FROM jobs WHERE id = $1")
        .bind(job_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_job_failed(pool: &Pool<Sqlite>, job_id: i64, reason: &str) -> Result<()> {
    sqlx::query(
        "UPDATE jobs
         SET status = 'failed',
             current_stage = 'failed',
             updated_at = datetime('now')
         WHERE id = $1",
    )
    .bind(job_id)
    .execute(pool)
    .await?;

    insert_job_message(
        pool,
        job_id,
        "system",
        &format!("Coordinator 分析失败: {}", reason),
    )
    .await?;

    Ok(())
}

pub async fn get_job(pool: &Pool<Sqlite>, job_id: i64) -> Result<Job> {
    let job = sqlx::query_as::<_, Job>(
        "SELECT id, project_id, title, original_requirement, status, current_stage,
                coordinator_session_id, coordinator_session_file, clarification_round, archived_at,
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
        "SELECT id, job_id, role, content, metadata_json, created_at
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

pub async fn get_dag_nodes(pool: &Pool<Sqlite>, job_id: i64) -> Result<Vec<DagNode>> {
    let rows = sqlx::query_as::<_, DagNodeRow>(
        "SELECT id, job_id, node_key, title, kind, worker_identity, status, instructions,
                acceptance_criteria_json, target_files_json, worktree_path, session_id,
                session_file, retry_count, error_message, result_summary, started_at,
                finished_at, created_at, updated_at
         FROM dag_nodes
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(DagNode::try_from).collect()
}

pub async fn get_dag_edges(pool: &Pool<Sqlite>, job_id: i64) -> Result<Vec<DagEdge>> {
    let edges = sqlx::query_as::<_, DagEdge>(
        "SELECT id, job_id, from_node_id, to_node_id, created_at
         FROM dag_edges
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    Ok(edges)
}

pub async fn get_task_artifacts(pool: &Pool<Sqlite>, job_id: i64) -> Result<Vec<TaskArtifact>> {
    let rows = sqlx::query_as::<_, TaskArtifactRow>(
        "SELECT id, job_id, node_id, artifact_type, path, content, created_at
         FROM task_artifacts
         WHERE job_id = $1
         ORDER BY id ASC",
    )
    .bind(job_id)
    .fetch_all(pool)
    .await?;

    rows.into_iter().map(TaskArtifact::try_from).collect()
}

async fn insert_job_message(
    pool: &Pool<Sqlite>,
    job_id: i64,
    role: &str,
    content: &str,
) -> Result<()> {
    insert_job_message_with_metadata(pool, job_id, role, content, None).await
}

async fn insert_job_message_with_metadata(
    pool: &Pool<Sqlite>,
    job_id: i64,
    role: &str,
    content: &str,
    metadata: Option<&serde_json::Value>,
) -> Result<()> {
    let metadata_json = metadata.map(serde_json::to_string).transpose()?;
    sqlx::query(
        "INSERT INTO job_messages (job_id, role, content, metadata_json)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(job_id)
    .bind(role)
    .bind(content)
    .bind(metadata_json)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn insert_job_trace_message(
    pool: &Pool<Sqlite>,
    job_id: i64,
    metadata: &serde_json::Value,
) -> Result<()> {
    insert_job_message_with_metadata(
        pool,
        job_id,
        "trace",
        "Coordinator 运行过程",
        Some(metadata),
    )
    .await
}

/// 向已有 Job 追加用户消息，并在需要时将状态恢复为 analyzing
pub async fn append_job_message(
    pool: &Pool<Sqlite>,
    job_id: i64,
    content: &str,
) -> Result<JobDetail> {
    let job = get_job(pool, job_id).await?;

    // 已归档的 Job 不允许追加消息
    if job.status == "archived" {
        anyhow::bail!("当前会话已归档，无法追加消息");
    }

    // 插入用户消息
    insert_job_message(pool, job_id, "user", content).await?;

    // draft_ready 或 failed 状态下追加消息，都表示需求有变化/需要重试，恢复为 analyzing
    if job.status == "draft_ready" || job.status == "failed" {
        sqlx::query(
            "UPDATE jobs
             SET status = 'analyzing', current_stage = 'requirement_analysis', updated_at = datetime('now')
             WHERE id = $1",
        )
        .bind(job_id)
        .execute(pool)
        .await?;

        insert_job_message(
            pool,
            job_id,
            "coordinator",
            "收到补充说明，正在重新分析需求。",
        )
        .await?;
    }

    get_job_detail(pool, job_id).await
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

async fn summarize_answers(
    pool: &Pool<Sqlite>,
    job_id: i64,
    answers: &[SubmitClarificationAnswer],
) -> Result<String> {
    let items = get_clarification_items(pool, job_id).await?;
    let mut lines = vec!["已提交澄清答案：".to_string()];
    for answer in answers {
        if let Some(item) = items.iter().find(|item| item.id == answer.clarification_id) {
            let mut parts = answer.selected_options.clone();
            if let Some(custom_text) = answer
                .custom_text
                .as_ref()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
            {
                parts.push(custom_text.to_string());
            }
            lines.push(format!(
                "- {}：{}",
                item.question,
                if parts.is_empty() {
                    "已确认".to_string()
                } else {
                    parts.join("、")
                }
            ));
        }
    }
    Ok(lines.join("\n"))
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
        insert_task_draft(
            pool,
            job_id,
            TaskDraftSeed {
                title: title.to_string(),
                description: description.to_string(),
                acceptance_criteria: acceptance_criteria
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
            },
        )
        .await?;
    }

    Ok(())
}

async fn insert_task_draft(pool: &Pool<Sqlite>, job_id: i64, draft: TaskDraftSeed) -> Result<()> {
    let criteria_json = serde_json::to_string(&draft.acceptance_criteria)?;
    sqlx::query(
        "INSERT INTO task_drafts
            (job_id, title, description, acceptance_criteria_json, status)
         VALUES ($1, $2, $3, $4, 'draft')",
    )
    .bind(job_id)
    .bind(draft.title)
    .bind(draft.description)
    .bind(criteria_json)
    .execute(pool)
    .await?;
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

#[derive(Debug, Clone)]
pub struct ClarificationSeed {
    pub question: String,
    pub question_type: String,
    pub options: Vec<ClarificationOption>,
    pub allow_custom: bool,
}

fn _test_option(label: &str, description: &str, recommended: bool) -> ClarificationOption {
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

impl TryFrom<DagNodeRow> for DagNode {
    type Error = anyhow::Error;

    fn try_from(row: DagNodeRow) -> Result<Self> {
        let acceptance_criteria = serde_json::from_str(&row.acceptance_criteria_json)
            .with_context(|| "解析 DAG 节点验收标准失败")?;
        let target_files = serde_json::from_str(&row.target_files_json)
            .with_context(|| "解析 DAG 节点目标文件失败")?;

        Ok(Self {
            id: row.id,
            job_id: row.job_id,
            node_key: row.node_key,
            title: row.title,
            kind: row.kind,
            worker_identity: row.worker_identity,
            status: row.status,
            instructions: row.instructions,
            acceptance_criteria,
            target_files,
            worktree_path: row.worktree_path,
            session_id: row.session_id,
            session_file: row.session_file,
            retry_count: row.retry_count,
            error_message: row.error_message,
            result_summary: row.result_summary,
            started_at: row.started_at,
            finished_at: row.finished_at,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
}

impl TryFrom<TaskArtifactRow> for TaskArtifact {
    type Error = anyhow::Error;

    fn try_from(row: TaskArtifactRow) -> Result<Self> {
        Ok(Self {
            id: row.id,
            job_id: row.job_id,
            node_id: row.node_id,
            artifact_type: row.artifact_type,
            path: row.path,
            content: row.content,
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
    async fn chat_clarification_flow_generates_and_archives_requirement() {
        let pool = memory_pool().await;
        update_system_config(&pool, "test-provider", "test-model")
            .await
            .unwrap();
        let project = create_project(&pool, "测试项目", "https://example.com/repo.git")
            .await
            .unwrap();

        let detail = create_analyzing_job(&pool, project.id, "实现需求澄清闭环")
            .await
            .unwrap();
        assert_eq!(detail.job.status, "analyzing");
        assert!(detail.clarifications.is_empty());

        let detail = apply_clarification_items(
            &pool,
            detail.job.id,
            "还需要确认几个关键点。",
            vec![
                ClarificationSeed {
                    question: "交付目标是什么？".to_string(),
                    question_type: "single_choice".to_string(),
                    options: vec![
                        _test_option("直接修改代码", "确认后直接进入实现。", true),
                        _test_option("先出方案", "优先整理设计文档。", false),
                    ],
                    allow_custom: true,
                },
                ClarificationSeed {
                    question: "验收包含哪些检查？".to_string(),
                    question_type: "multi_choice".to_string(),
                    options: vec![
                        _test_option("自动化测试", "运行单元测试。", true),
                        _test_option("构建检查", "运行 cargo check。", false),
                    ],
                    allow_custom: true,
                },
                ClarificationSeed {
                    question: "必须排除的范围？".to_string(),
                    question_type: "free_text".to_string(),
                    options: Vec::new(),
                    allow_custom: true,
                },
            ],
            None,
        )
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
        assert_eq!(detail.job.status, "analyzing");
        assert!(detail
            .clarifications
            .iter()
            .all(|item| item.answer.is_some()));

        let detail = apply_task_draft(
            &pool,
            detail.job.id,
            "需求已经清晰，可以确认。",
            TaskDraftSeed {
                title: "实现需求澄清闭环".to_string(),
                description: "以聊天形式完成需求澄清并展示确认卡片。".to_string(),
                acceptance_criteria: vec![
                    "支持可点选澄清项".to_string(),
                    "确认后归档会话".to_string(),
                ],
            },
        )
        .await
        .unwrap();
        assert_eq!(detail.job.status, "draft_ready");
        assert_eq!(detail.task_drafts.len(), 1);

        let detail = confirm_job(&pool, detail.job.id).await.unwrap();
        assert_eq!(detail.job.status, "archived");
        assert_eq!(detail.job.current_stage, "archived");
        assert!(detail.job.archived_at.is_some());
        assert!(detail
            .task_drafts
            .iter()
            .all(|draft| draft.status == "confirmed"));

        let active_jobs = get_project_jobs(&pool, project.id, false).await.unwrap();
        assert!(active_jobs.is_empty());
        let all_jobs = get_project_jobs(&pool, project.id, true).await.unwrap();
        assert_eq!(all_jobs.len(), 1);
    }

    #[tokio::test]
    async fn create_job_rejects_unknown_project() {
        let pool = memory_pool().await;
        let err = create_analyzing_job(&pool, 404, "不存在项目")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("项目不存在"));
    }

    #[tokio::test]
    async fn delete_project_cascades_to_jobs_and_messages() {
        let pool = memory_pool().await;
        let project = create_project(&pool, "待删除项目", "https://example.com/repo.git")
            .await
            .unwrap();
        let detail = create_analyzing_job(&pool, project.id, "验证级联删除")
            .await
            .unwrap();

        assert!(delete_project(&pool, project.id).await.unwrap());

        let job_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM jobs WHERE project_id = $1")
            .bind(project.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        let message_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM job_messages WHERE job_id = $1")
                .bind(detail.job.id)
                .fetch_one(&pool)
                .await
                .unwrap();

        assert_eq!(job_count, 0);
        assert_eq!(message_count, 0);
    }
}
