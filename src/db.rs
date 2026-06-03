use anyhow::Result;
use serde::Serialize;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub git_url: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ModelIdentity {
    pub id: i64,
    pub name: String,
    pub provider: String,
    pub model: String,
    pub thinking_level: String,
    pub enabled: bool,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ModelSetting {
    pub provider: String,
    pub model: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn init_db() -> Result<Pool<Sqlite>> {
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:raccoon.db".to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // 创建 sessions 表（保留原有结构）
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // 创建 projects 表
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

    // 创建 model_identities 表
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS model_identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            thinking_level TEXT NOT NULL DEFAULT 'medium',
            enabled BOOLEAN NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // 创建 model_settings 表（模型级别配置）
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS model_settings (
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (provider, model)
        )",
    )
    .execute(&pool)
    .await?;

    Ok(pool)
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

// ===== Model Identity CRUD =====

pub async fn get_model_identities(pool: &Pool<Sqlite>) -> Result<Vec<ModelIdentity>> {
    let identities = sqlx::query_as::<_, ModelIdentity>(
        "SELECT id, name, provider, model, thinking_level, enabled, sort_order, created_at
         FROM model_identities
         ORDER BY sort_order ASC, created_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(identities)
}

pub async fn create_model_identity(
    pool: &Pool<Sqlite>,
    name: &str,
    provider: &str,
    model: &str,
    thinking_level: &str,
    enabled: bool,
) -> Result<ModelIdentity> {
    // 获取当前最大 sort_order
    let max_order: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM model_identities")
        .fetch_one(pool)
        .await?;
    let sort_order = max_order.unwrap_or(0) + 1;

    let id = sqlx::query(
        "INSERT INTO model_identities (name, provider, model, thinking_level, enabled, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(name)
    .bind(provider)
    .bind(model)
    .bind(thinking_level)
    .bind(enabled)
    .bind(sort_order)
    .execute(pool)
    .await?
    .last_insert_rowid();

    let identity = sqlx::query_as::<_, ModelIdentity>(
        "SELECT id, name, provider, model, thinking_level, enabled, sort_order, created_at
         FROM model_identities WHERE id = $1",
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(identity)
}

pub async fn update_model_identity(
    pool: &Pool<Sqlite>,
    id: i64,
    name: &str,
    provider: &str,
    model: &str,
    thinking_level: &str,
    enabled: bool,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE model_identities
         SET name = $1, provider = $2, model = $3, thinking_level = $4, enabled = $5
         WHERE id = $6",
    )
    .bind(name)
    .bind(provider)
    .bind(model)
    .bind(thinking_level)
    .bind(enabled)
    .bind(id)
    .execute(pool)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn delete_model_identity(pool: &Pool<Sqlite>, id: i64) -> Result<bool> {
    let result = sqlx::query("DELETE FROM model_identities WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

// ===== Model Settings =====

pub async fn get_model_settings(pool: &Pool<Sqlite>) -> Result<Vec<ModelSetting>> {
    let settings = sqlx::query_as::<_, ModelSetting>(
        "SELECT provider, model, enabled, created_at, updated_at
         FROM model_settings
         ORDER BY updated_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(settings)
}

pub async fn upsert_model_setting(
    pool: &Pool<Sqlite>,
    provider: &str,
    model: &str,
    enabled: bool,
) -> Result<ModelSetting> {
    sqlx::query(
        "INSERT INTO model_settings (provider, model, enabled, updated_at)
         VALUES ($1, $2, $3, datetime('now'))
         ON CONFLICT(provider, model) DO UPDATE SET
             enabled = excluded.enabled,
             updated_at = datetime('now')",
    )
    .bind(provider)
    .bind(model)
    .bind(enabled)
    .execute(pool)
    .await?;

    let setting = sqlx::query_as::<_, ModelSetting>(
        "SELECT provider, model, enabled, created_at, updated_at
         FROM model_settings WHERE provider = $1 AND model = $2",
    )
    .bind(provider)
    .bind(model)
    .fetch_one(pool)
    .await?;

    Ok(setting)
}
