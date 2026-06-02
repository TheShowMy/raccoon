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

    Ok(pool)
}

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
