use anyhow::Result;
use axum::{
    extract::{Extension, Path},
    response::Json,
    routing::{delete, get},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{Pool, Sqlite};
use std::net::SocketAddr;
use std::path::PathBuf;
use tokio::process::Command;
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

/// 检测 Pi Agent 是否安装
async fn check_pi_installed() -> bool {
    #[cfg(target_os = "windows")]
    let cmd = "where";
    #[cfg(not(target_os = "windows"))]
    let cmd = "which";

    match Command::new(cmd).arg("pi").output().await {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::new("info"))
        .init();

    // 初始化数据库路径
    // 开发时：项目根目录   生产时：可执行文件同级目录
    let db_dir = std::env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .ok()
        .or_else(exe_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    let db_path = db_dir.join("raccoon.db");
    // sqlx SQLite 需要 mode=rwc 才能自动创建数据库文件
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());
    std::env::set_var("DATABASE_URL", db_url);

    let pool = match db::init_db().await {
        Ok(p) => {
            info!("数据库初始化成功");
            p
        }
        Err(e) => {
            warn!("数据库初始化失败: {}", e);
            return Err(e);
        }
    };

    let app = create_router(pool);

    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    info!("🦝 raccoon 服务启动于 http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn create_router(pool: Pool<Sqlite>) -> Router {
    let api_routes = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/pi-status", get(pi_status_handler))
        .route(
            "/api/projects",
            get(list_projects_handler).post(create_project_handler),
        )
        .route("/api/projects/:id", delete(delete_project_handler))
        .layer(Extension(pool));

    let frontend_router = if let Some(dir) = find_frontend_dir() {
        info!("前端静态文件目录: {}", dir.display());
        Router::new().fallback_service(ServeDir::new(dir).append_index_html_on_directories(true))
    } else {
        warn!("前端构建目录不存在，服务不托管静态文件");
        Router::new().fallback(get(|| async {
            axum::response::Html(
                "<h1>🦝 raccoon</h1><p>前端构建产物不存在。请运行 npm run build</p>",
            )
        }))
    };

    api_routes.merge(frontend_router)
}

async fn health_handler() -> &'static str {
    "{\"status\":\"ok\"}"
}

// ===== Pi Agent 状态 =====

async fn pi_status_handler() -> Json<serde_json::Value> {
    let installed = check_pi_installed().await;
    Json(json!({ "installed": installed }))
}

// ===== 项目管理 API =====

#[derive(Debug, Deserialize)]
struct CreateProjectRequest {
    name: String,
    git_url: String,
}

#[derive(Debug, Serialize)]
struct ApiResponse<T: Serialize> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

async fn list_projects_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<ApiResponse<Vec<db::Project>>> {
    match db::get_projects(&pool).await {
        Ok(projects) => Json(ApiResponse::ok(projects)),
        Err(e) => {
            warn!("获取项目列表失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

async fn create_project_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
    axum::extract::Json(req): axum::extract::Json<CreateProjectRequest>,
) -> Json<ApiResponse<db::Project>> {
    if req.name.trim().is_empty() {
        return Json(ApiResponse::err("项目名称不能为空"));
    }
    if req.git_url.trim().is_empty() {
        return Json(ApiResponse::err("Git 链接不能为空"));
    }

    match db::create_project(&pool, &req.name, &req.git_url).await {
        Ok(project) => Json(ApiResponse::ok(project)),
        Err(e) => {
            warn!("创建项目失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

async fn delete_project_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
    Path(id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    match db::delete_project(&pool, id).await {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => {
            warn!("删除项目失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}
