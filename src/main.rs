use anyhow::Result;
use axum::{response::Html, routing::get, Router};
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::services::ServeDir;
use tracing::{info, warn};

mod db;

const PORT: u16 = 3003;

/// 获取可执行文件所在目录
fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

/// 查找前端构建产物目录
/// 1. 优先在可执行文件同级目录找 frontend/
/// 2.  fallback 到项目根目录的 frontend/dist/
fn find_frontend_dir() -> Option<PathBuf> {
    // 情况1：打包后运行（可执行文件旁有 frontend/ 目录）
    if let Some(dir) = exe_dir() {
        let packaged = dir.join("frontend");
        if packaged.exists() {
            return Some(packaged);
        }
    }

    // 情况2：开发时运行（cargo run，从项目根目录）
    let dev = PathBuf::from("frontend/dist");
    if dev.exists() {
        return Some(dev);
    }

    None
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new("info"))
        .init();

    // 初始化数据库（在可执行文件同级目录创建）
    if let Some(dir) = exe_dir() {
        let db_path = dir.join("raccoon.db");
        std::env::set_var("DATABASE_URL", format!("sqlite:{}", db_path.display()));
    }

    if let Err(e) = db::init_db().await {
        warn!("数据库初始化失败: {}", e);
    }

    let app = create_router();

    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    info!("🦝 raccoon 服务启动于 http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn create_router() -> Router {
    let api_routes = Router::new().route("/api/health", get(health_handler));

    let frontend_router = if let Some(dir) = find_frontend_dir() {
        info!("前端静态文件目录: {}", dir.display());
        Router::new().fallback_service(ServeDir::new(dir).append_index_html_on_directories(true))
    } else {
        warn!("前端构建目录不存在，服务不托管静态文件");
        Router::new().fallback(get(|| async {
            Html("<h1>🦝 raccoon</h1><p>前端构建产物不存在。请运行 npm run build</p>")
        }))
    };

    api_routes.merge(frontend_router)
}

async fn health_handler() -> &'static str {
    "{\"status\":\"ok\"}"
}
