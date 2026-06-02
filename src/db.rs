use anyhow::Result;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};

pub async fn init_db() -> Result<Pool<Sqlite>> {
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:raccoon.db".to_string());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // 初始迁移占位
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}
