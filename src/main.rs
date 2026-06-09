use anyhow::{Context, Result};
use axum::{
    extract::{Extension, Path, Query},
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Pool, Sqlite};
use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::broadcast;
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tower_http::services::ServeDir;
use tracing::{info, warn};

mod coordinator;
mod db;
mod pi_rpc;

const PORT: u16 = 3003;

type EventSender = broadcast::Sender<JobEvent>;
type ProjectEventSender = broadcast::Sender<ProjectEvent>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobEvent {
    job_id: i64,
    event: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pi_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEvent {
    project_id: i64,
    event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    project: Option<db::Project>,
}

/// 全局应用状态，包含数据库连接、Pi Agent 进程池、事件广播等。
#[derive(Clone)]
struct AppState {
    pool: Pool<Sqlite>,
    default_pi_client: Arc<pi_rpc::PiRpcClient>,
    job_pi_clients: Arc<tokio::sync::Mutex<HashMap<i64, Arc<pi_rpc::PiRpcClient>>>>,
    workspace_dir: PathBuf,
    pi_session_dir: PathBuf,
    extension_path: Option<PathBuf>,
    event_tx: EventSender,
    project_event_tx: ProjectEventSender,
}

impl AppState {
    /// 获取或启动指定 job 的 Pi Agent 进程。
    /// 每个 job 拥有独立的 Pi Agent，cwd 设为对应项目的本地目录。
    async fn get_or_start_job_pi_client(
        &self,
        job_id: i64,
        project_id: i64,
    ) -> anyhow::Result<Arc<pi_rpc::PiRpcClient>> {
        {
            let clients = self.job_pi_clients.lock().await;
            if let Some(client) = clients.get(&job_id) {
                return Ok(client.clone());
            }
        }

        let project = db::get_project(&self.pool, project_id).await?;
        let local_path = project
            .local_path
            .as_deref()
            .context("项目尚未克隆到本地，无法启动 Pi Agent")?;
        let cwd = PathBuf::from(local_path);
        anyhow::ensure!(cwd.exists(), "项目本地目录不存在: {}", cwd.display());

        let client = pi_rpc::PiRpcClient::new_with_extension(
            &self.pi_session_dir,
            self.extension_path.as_deref(),
            Some(&cwd),
        )
        .await
        .with_context(|| format!("启动 job {} 的 Pi Agent 失败", job_id))?;

        let client = Arc::new(client);
        let mut clients = self.job_pi_clients.lock().await;
        clients.insert(job_id, client.clone());

        info!("为 job {} 启动 Pi Agent，cwd: {}", job_id, cwd.display());
        Ok(client)
    }

    /// 关闭指定 job 的 Pi Agent 进程。
    async fn shutdown_job_pi_client(&self, job_id: i64) {
        let mut clients = self.job_pi_clients.lock().await;
        if let Some(client) = clients.remove(&job_id) {
            if let Err(e) = client.shutdown().await {
                warn!("关闭 job {} 的 Pi Agent 失败: {}", job_id, e);
            } else {
                info!("关闭 job {} 的 Pi Agent", job_id);
            }
        }
    }
}

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

    let pi_session_dir = db_dir.join("pi-sessions");
    let workspace_dir = db_dir.join("workspace");
    if let Err(e) = std::fs::create_dir_all(&workspace_dir) {
        warn!("创建工作区目录失败: {}", e);
    }

    // 扩展路径使用 db_dir 作为基准，确保开发和生产环境行为一致。
    // db_dir 在开发时为项目根目录，生产时为可执行文件同级目录。
    let ext_candidate = db_dir.join("pi-extensions/coordinator-decision.ts");
    let extension_path = ext_candidate.exists().then_some(ext_candidate);
    if let Some(ref p) = extension_path {
        info!("加载 Coordinator 扩展: {}", p.display());
    } else {
        warn!("Coordinator 扩展未找到，将使用文本解析 fallback");
    }
    let coordinator_session_dir = pi_session_dir.join("coordinator");
    let pi_client = match pi_rpc::PiRpcClient::new_with_extension(
        &coordinator_session_dir,
        extension_path.as_deref(),
        None,
    )
    .await
    {
        Ok(c) => {
            info!("Pi RPC 客户端初始化成功");
            Arc::new(c)
        }
        Err(e) => {
            warn!("Pi RPC 客户端初始化失败: {}", e);
            return Err(e);
        }
    };

    let (event_tx, _) = broadcast::channel(256);
    let (project_event_tx, _) = broadcast::channel(256);
    let state = Arc::new(AppState {
        pool: pool.clone(),
        default_pi_client: pi_client.clone(),
        job_pi_clients: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        workspace_dir: workspace_dir.clone(),
        pi_session_dir: pi_session_dir.clone(),
        extension_path: extension_path.clone(),
        event_tx: event_tx.clone(),
        project_event_tx: project_event_tx.clone(),
    });
    let app = create_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    info!("🦝 raccoon 服务启动于 http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn create_router(state: Arc<AppState>) -> Router {
    let api_routes = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/pi-status", get(pi_status_handler))
        .route(
            "/api/projects",
            get(list_projects_handler).post(create_project_handler),
        )
        .route("/api/projects/events", get(project_events_handler))
        .route(
            "/api/projects/:id/jobs",
            get(list_project_jobs_handler).post(create_job_handler),
        )
        .route(
            "/api/jobs/:id",
            get(get_job_handler).delete(delete_job_handler),
        )
        .route("/api/jobs/:id/events", get(job_events_handler))
        .route(
            "/api/jobs/:id/clarifications",
            post(submit_clarifications_handler),
        )
        .route("/api/jobs/:id/confirm", post(confirm_job_handler))
        .route("/api/jobs/:id/messages", post(append_job_message_handler))
        .route("/api/projects/:id", delete(delete_project_handler))
        .route("/api/pi-config", get(pi_config_handler))
        .route("/api/pi-config/settings", post(update_pi_settings_handler))
        .route("/api/pi-config/auth", post(update_pi_auth_handler))
        .route(
            "/api/pi-config/auth/:provider",
            delete(delete_pi_auth_handler),
        )
        .route("/api/models", get(list_models_handler))
        .route(
            "/api/system-config",
            get(get_system_config_handler).put(update_system_config_handler),
        )
        .route(
            "/api/worker-tiers",
            get(list_worker_tiers_handler).post(create_worker_tier_handler),
        )
        .route(
            "/api/worker-tiers/:id",
            put(update_worker_tier_handler).delete(delete_worker_tier_handler),
        )
        .route(
            "/api/thinking-policies",
            get(list_thinking_policies_handler),
        )
        .route("/api/projects/:id", get(get_project_handler))
        .route("/api/projects/:id/files", get(list_project_files_handler))
        .route("/api/projects/:id/clone", post(reclone_project_handler))
        .route("/api/jobs/:id/close-agent", post(close_job_agent_handler))
        .layer(Extension(state));

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
    Extension(state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<Vec<db::Project>>> {
    match db::get_projects(&state.pool).await {
        Ok(projects) => Json(ApiResponse::ok(projects)),
        Err(e) => {
            warn!("获取项目列表失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

async fn create_project_handler(
    Extension(state): Extension<Arc<AppState>>,
    axum::extract::Json(req): axum::extract::Json<CreateProjectRequest>,
) -> Json<ApiResponse<db::Project>> {
    if req.name.trim().is_empty() {
        return Json(ApiResponse::err("项目名称不能为空"));
    }
    if req.git_url.trim().is_empty() {
        return Json(ApiResponse::err("Git 链接不能为空"));
    }

    match db::create_project(&state.pool, &req.name, &req.git_url).await {
        Ok(project) => {
            let project_id = project.id;
            let git_url = req.git_url;
            let name = req.name.trim().to_string();
            let workspace = state.workspace_dir.clone();
            let pool_clone = state.pool.clone();
            let project_event_tx = state.project_event_tx.clone();
            tokio::spawn(async move {
                let safe_name = name
                    .to_lowercase()
                    .replace(' ', "-")
                    .replace(|c: char| !c.is_alphanumeric() && c != '-', "");
                let project_dir = workspace.join(format!("project-{}-{}", project_id, safe_name));

                if let Err(e) = std::fs::create_dir_all(&workspace) {
                    warn!("创建工作区目录失败: {}", e);
                    let _ = db::update_project_clone_status(
                        &pool_clone,
                        project_id,
                        None,
                        "failed",
                        Some(&format!("创建工作区目录失败: {}", e)),
                    )
                    .await;
                    emit_project_event_from_db(
                        &pool_clone,
                        &project_event_tx,
                        project_id,
                        "clone_failed",
                    )
                    .await;
                    return;
                }

                if let Err(e) =
                    db::update_project_clone_status(&pool_clone, project_id, None, "cloning", None)
                        .await
                {
                    warn!("更新项目克隆开始状态失败: {}", e);
                }
                emit_project_event_from_db(
                    &pool_clone,
                    &project_event_tx,
                    project_id,
                    "clone_started",
                )
                .await;

                let output = tokio::process::Command::new("git")
                    .arg("clone")
                    .arg(&git_url)
                    .arg(&project_dir)
                    .output()
                    .await;

                match output {
                    Ok(out) if out.status.success() => {
                        let local_path = project_dir.to_string_lossy().to_string();
                        if let Err(e) = db::update_project_clone_status(
                            &pool_clone,
                            project_id,
                            Some(&local_path),
                            "ready",
                            None,
                        )
                        .await
                        {
                            warn!("更新项目克隆状态失败: {}", e);
                        } else {
                            info!("项目 {} 克隆完成: {}", project_id, local_path);
                        }
                        emit_project_event_from_db(
                            &pool_clone,
                            &project_event_tx,
                            project_id,
                            "clone_ready",
                        )
                        .await;
                    }
                    Ok(out) => {
                        let err = String::from_utf8_lossy(&out.stderr).to_string();
                        warn!("克隆项目 {} 失败: {}", project_id, err);
                        let _ = db::update_project_clone_status(
                            &pool_clone,
                            project_id,
                            None,
                            "failed",
                            Some(&err),
                        )
                        .await;
                        emit_project_event_from_db(
                            &pool_clone,
                            &project_event_tx,
                            project_id,
                            "clone_failed",
                        )
                        .await;
                    }
                    Err(e) => {
                        warn!("执行 git clone 失败: {}", e);
                        let _ = db::update_project_clone_status(
                            &pool_clone,
                            project_id,
                            None,
                            "failed",
                            Some(&format!("执行 git clone 失败: {}", e)),
                        )
                        .await;
                        emit_project_event_from_db(
                            &pool_clone,
                            &project_event_tx,
                            project_id,
                            "clone_failed",
                        )
                        .await;
                    }
                }
            });
            Json(ApiResponse::ok(project))
        }
        Err(e) => {
            warn!("创建项目失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

async fn get_project_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(project_id): Path<i64>,
) -> Json<ApiResponse<db::Project>> {
    match db::get_project(&state.pool, project_id).await {
        Ok(project) => Json(ApiResponse::ok(project)),
        Err(e) => {
            warn!("获取项目详情失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

async fn list_project_files_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(project_id): Path<i64>,
    Query(query): Query<ListProjectFilesQuery>,
) -> Json<ApiResponse<Vec<String>>> {
    match list_project_files(&state.pool, project_id, query.query.as_deref()).await {
        Ok(files) => Json(ApiResponse::ok(files)),
        Err(e) => {
            warn!("获取项目文件列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListProjectFilesQuery {
    #[serde(default)]
    query: Option<String>,
}

async fn list_project_files(
    pool: &Pool<Sqlite>,
    project_id: i64,
    filter: Option<&str>,
) -> anyhow::Result<Vec<String>> {
    let project = db::get_project(pool, project_id).await?;
    let local_path = project
        .local_path
        .as_deref()
        .context("项目尚未克隆到本地")?;
    let root = PathBuf::from(local_path);
    anyhow::ensure!(root.exists(), "项目本地目录不存在: {}", root.display());

    let filter_lower = filter.map(|s| s.to_lowercase());
    let mut files = Vec::new();
    collect_text_files(&root, &root, &filter_lower, &mut files)?;
    files.truncate(50);
    Ok(files)
}

fn collect_text_files(
    root: &PathBuf,
    current: &PathBuf,
    filter: &Option<String>,
    out: &mut Vec<String>,
) -> anyhow::Result<()> {
    if out.len() >= 50 {
        return Ok(());
    }

    for entry in std::fs::read_dir(current)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // 跳过隐藏目录和常见构建产物
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "build"
            || name == "vendor"
        {
            continue;
        }

        if path.is_dir() {
            collect_text_files(root, &path, filter, out)?;
        } else if path.is_file() {
            // 简单跳过已知二进制后缀
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if matches!(
                ext,
                "png"
                    | "jpg"
                    | "jpeg"
                    | "gif"
                    | "ico"
                    | "svg"
                    | "webp"
                    | "mp3"
                    | "mp4"
                    | "wav"
                    | "ogg"
                    | "webm"
                    | "zip"
                    | "tar"
                    | "gz"
                    | "rar"
                    | "7z"
                    | "pdf"
                    | "doc"
                    | "docx"
                    | "xls"
                    | "xlsx"
                    | "exe"
                    | "dll"
                    | "so"
                    | "dylib"
                    | "ttf"
                    | "otf"
                    | "woff"
                    | "woff2"
                    | "eot"
                    | "wasm"
                    | "map"
            ) {
                continue;
            }

            let rel = path.strip_prefix(root).unwrap_or(&path);
            let rel_str = rel.to_string_lossy().replace('\\', "/");

            if let Some(f) = filter {
                if !rel_str.to_lowercase().contains(f) {
                    continue;
                }
            }

            out.push(rel_str);
        }
    }

    Ok(())
}

async fn delete_job_with_local_cleanup(state: &AppState, job_id: i64) -> anyhow::Result<()> {
    let job = db::get_job(&state.pool, job_id).await?;
    if let Some(session_file) = job.coordinator_session_file.as_deref() {
        validate_session_file_path(&state.pi_session_dir, FsPath::new(session_file))?;
    }

    state.shutdown_job_pi_client(job_id).await;
    db::delete_job(&state.pool, job_id).await?;

    if let Some(session_file) = job.coordinator_session_file.as_deref() {
        remove_session_file_if_exists(&state.pi_session_dir, FsPath::new(session_file)).await?;
    }

    Ok(())
}

async fn delete_project_with_local_cleanup(
    state: &AppState,
    project_id: i64,
) -> anyhow::Result<bool> {
    let project = db::get_project(&state.pool, project_id).await?;
    let jobs = db::get_project_jobs(&state.pool, project_id, true).await?;
    let session_files: Vec<PathBuf> = jobs
        .iter()
        .filter_map(|job| job.coordinator_session_file.as_deref())
        .map(PathBuf::from)
        .collect();

    for session_file in &session_files {
        validate_session_file_path(&state.pi_session_dir, session_file)?;
    }
    if let Some(local_path) = project.local_path.as_deref() {
        validate_project_dir_path(&state.workspace_dir, project_id, FsPath::new(local_path))?;
    }

    for job in &jobs {
        state.shutdown_job_pi_client(job.id).await;
    }

    let deleted = db::delete_project(&state.pool, project_id).await?;
    if deleted {
        for session_file in &session_files {
            remove_session_file_if_exists(&state.pi_session_dir, session_file).await?;
        }
        if let Some(local_path) = project.local_path.as_deref() {
            remove_project_dir_if_exists(&state.workspace_dir, project_id, FsPath::new(local_path))
                .await?;
        }
        emit_project_event(&state.project_event_tx, project_id, "project_deleted", None);
    }

    Ok(deleted)
}

fn validate_session_file_path(session_dir: &FsPath, path: &FsPath) -> anyhow::Result<()> {
    if path.extension().and_then(|ext| ext.to_str()) != Some("jsonl") {
        anyhow::bail!("拒绝删除非 JSONL 会话文件: {}", path.display());
    }
    if !path.exists() {
        return Ok(());
    }
    ensure_existing_child_path(session_dir, path)
        .with_context(|| format!("拒绝删除 pi-sessions 外部文件: {}", path.display()))
}

fn validate_project_dir_path(
    workspace_dir: &FsPath,
    project_id: i64,
    path: &FsPath,
) -> anyhow::Result<()> {
    if !path.exists() {
        return Ok(());
    }
    let expected_prefix = format!("project-{project_id}-");
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    anyhow::ensure!(
        file_name.starts_with(&expected_prefix),
        "拒绝删除名称不匹配的项目目录: {}",
        path.display()
    );
    anyhow::ensure!(path.is_dir(), "项目本地路径不是目录: {}", path.display());
    ensure_existing_child_path(workspace_dir, path)
        .with_context(|| format!("拒绝删除 workspace 外部目录: {}", path.display()))
}

fn ensure_existing_child_path(root: &FsPath, path: &FsPath) -> anyhow::Result<()> {
    let root = root
        .canonicalize()
        .with_context(|| format!("根目录不存在: {}", root.display()))?;
    let path = path
        .canonicalize()
        .with_context(|| format!("路径不存在: {}", path.display()))?;
    anyhow::ensure!(path.starts_with(&root), "路径不在允许的根目录内");
    Ok(())
}

async fn remove_session_file_if_exists(session_dir: &FsPath, path: &FsPath) -> anyhow::Result<()> {
    validate_session_file_path(session_dir, path)?;
    if path.exists() {
        tokio::fs::remove_file(path)
            .await
            .with_context(|| format!("删除 Pi 会话文件失败: {}", path.display()))?;
    }
    Ok(())
}

async fn remove_project_dir_if_exists(
    workspace_dir: &FsPath,
    project_id: i64,
    path: &FsPath,
) -> anyhow::Result<()> {
    validate_project_dir_path(workspace_dir, project_id, path)?;
    if path.exists() {
        tokio::fs::remove_dir_all(path)
            .await
            .with_context(|| format!("删除项目本地目录失败: {}", path.display()))?;
    }
    Ok(())
}

async fn reclone_project_handler(
    Extension(_state): Extension<Arc<AppState>>,
    Path(_id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    Json(ApiResponse::err("重新克隆功能尚未实现"))
}

async fn delete_project_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    match delete_project_with_local_cleanup(&state, id).await {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => {
            warn!("删除项目失败: {}", e);
            Json(ApiResponse::err(e.to_string()))
        }
    }
}

// ===== Job / 需求澄清 API =====

#[derive(Debug, Deserialize)]
struct CreateJobRequest {
    requirement: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitClarificationsRequest {
    answers: Vec<db::SubmitClarificationAnswer>,
}

#[derive(Debug, Deserialize)]
struct AppendMessageRequest {
    content: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListJobsQuery {
    #[serde(default)]
    include_archived: bool,
}

async fn list_project_jobs_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(project_id): Path<i64>,
    Query(query): Query<ListJobsQuery>,
) -> Json<ApiResponse<Vec<db::Job>>> {
    match db::get_project_jobs(&state.pool, project_id, query.include_archived).await {
        Ok(jobs) => Json(ApiResponse::ok(jobs)),
        Err(e) => {
            warn!("获取 Job 列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

async fn create_job_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(project_id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<CreateJobRequest>,
) -> Json<ApiResponse<db::JobDetail>> {
    let requirement = req.requirement.trim();
    if requirement.is_empty() {
        return Json(ApiResponse::err("需求内容不能为空"));
    }

    let system_config = match db::get_system_config(&state.pool).await {
        Ok(config) => config,
        Err(e) => {
            warn!("读取 Coordinator 配置失败: {}", e);
            return Json(ApiResponse::err(format!(
                "读取 Coordinator 配置失败: {}",
                e
            )));
        }
    };
    if system_config.coordinator_provider.trim().is_empty()
        || system_config.coordinator_model.trim().is_empty()
    {
        return Json(ApiResponse::err(
            "请先在设置中配置 Coordinator 主模型，再提交需求",
        ));
    }

    match db::create_analyzing_job(&state.pool, project_id, requirement).await {
        Ok(detail) => {
            let job_id = detail.job.id;
            let pi_client = match state.get_or_start_job_pi_client(job_id, project_id).await {
                Ok(client) => client,
                Err(e) => {
                    warn!("启动 job Pi Agent 失败: {}", e);
                    let _ = db::set_job_failed(&state.pool, job_id, &e.to_string()).await;
                    return Json(ApiResponse::err(format!("启动 Pi Agent 失败: {}", e)));
                }
            };
            spawn_initial_analysis(
                state.pool.clone(),
                pi_client,
                state.event_tx.clone(),
                system_config,
                job_id,
                project_id,
                detail.job.title.clone(),
                requirement.to_string(),
            );
            Json(ApiResponse::ok(detail))
        }
        Err(e) => {
            warn!("创建 Job 失败: {}", e);
            Json(ApiResponse::err(format!("创建失败: {}", e)))
        }
    }
}

async fn get_job_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::get_job_detail(&state.pool, job_id).await {
        Ok(detail) => Json(ApiResponse::ok(detail)),
        Err(e) => {
            warn!("获取 Job 详情失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

async fn submit_clarifications_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<SubmitClarificationsRequest>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::submit_clarification_answers(&state.pool, job_id, &req.answers).await {
        Ok(detail) => {
            if detail.job.status == "analyzing" {
                let detail_for_project = match db::get_job_detail(&state.pool, job_id).await {
                    Ok(d) => d,
                    Err(e) => {
                        warn!("获取 job 详情失败: {}", e);
                        return Json(ApiResponse::err(format!("获取 job 详情失败: {}", e)));
                    }
                };
                let project_id = detail_for_project.job.project_id;
                let pi_client = match state.get_or_start_job_pi_client(job_id, project_id).await {
                    Ok(client) => client,
                    Err(e) => {
                        warn!("启动 job Pi Agent 失败: {}", e);
                        let _ = db::set_job_failed(&state.pool, job_id, &e.to_string()).await;
                        return Json(ApiResponse::err(format!("启动 Pi Agent 失败: {}", e)));
                    }
                };
                spawn_followup_analysis(
                    state.pool.clone(),
                    pi_client,
                    state.event_tx.clone(),
                    job_id,
                    project_id,
                    state.clone(),
                );
            }
            Json(ApiResponse::ok(detail))
        }
        Err(e) => {
            warn!("提交澄清答案失败: {}", e);
            Json(ApiResponse::err(format!("提交失败: {}", e)))
        }
    }
}

async fn confirm_job_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::confirm_job(&state.pool, job_id).await {
        Ok(detail) => {
            emit_job_event(
                &state.event_tx,
                job_id,
                "archived",
                "需求已确认，会话已归档。",
            );
            state.shutdown_job_pi_client(job_id).await;
            Json(ApiResponse::ok(detail))
        }
        Err(e) => {
            warn!("确认 Job 失败: {}", e);
            Json(ApiResponse::err(format!("确认失败: {}", e)))
        }
    }
}

async fn delete_job_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    match delete_job_with_local_cleanup(&state, job_id).await {
        Ok(()) => {
            emit_job_event(&state.event_tx, job_id, "deleted", "会话已删除。");
            Json(ApiResponse::ok(true))
        }
        Err(e) => {
            warn!("删除 Job 失败: {}", e);
            Json(ApiResponse::err(format!("删除失败: {}", e)))
        }
    }
}

async fn append_job_message_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<AppendMessageRequest>,
) -> Json<ApiResponse<db::JobDetail>> {
    let content = req.content.trim();
    if content.is_empty() {
        return Json(ApiResponse::err("消息内容不能为空"));
    }

    match db::append_job_message(&state.pool, job_id, content).await {
        Ok(detail) => {
            // 如果状态恢复为 analyzing，触发 Coordinator 继续分析
            if detail.job.status == "analyzing" {
                let detail_for_project = match db::get_job_detail(&state.pool, job_id).await {
                    Ok(d) => d,
                    Err(e) => {
                        warn!("获取 job 详情失败: {}", e);
                        return Json(ApiResponse::err(format!("获取 job 详情失败: {}", e)));
                    }
                };
                let project_id = detail_for_project.job.project_id;
                let pi_client = match state.get_or_start_job_pi_client(job_id, project_id).await {
                    Ok(client) => client,
                    Err(e) => {
                        warn!("启动 job Pi Agent 失败: {}", e);
                        let _ = db::set_job_failed(&state.pool, job_id, &e.to_string()).await;
                        return Json(ApiResponse::err(format!("启动 Pi Agent 失败: {}", e)));
                    }
                };
                spawn_followup_analysis(
                    state.pool.clone(),
                    pi_client,
                    state.event_tx.clone(),
                    job_id,
                    project_id,
                    state.clone(),
                );
            }
            Json(ApiResponse::ok(detail))
        }
        Err(e) => {
            warn!("追加消息失败: {}", e);
            Json(ApiResponse::err(format!("发送失败: {}", e)))
        }
    }
}

async fn close_job_agent_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    state.shutdown_job_pi_client(job_id).await;
    Json(ApiResponse::ok(true))
}

async fn job_events_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(job_id): Path<i64>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream =
        BroadcastStream::new(state.event_tx.subscribe()).filter_map(move |item| match item {
            Ok(event) if event.job_id == job_id => serde_json::to_string(&event)
                .ok()
                .map(|data| Ok(Event::default().event(event.event).data(data))),
            _ => None,
        });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn project_events_handler(
    Extension(state): Extension<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream =
        BroadcastStream::new(state.project_event_tx.subscribe()).filter_map(
            move |item| match item {
                Ok(event) => serde_json::to_string(&event)
                    .ok()
                    .map(|data| Ok(Event::default().event(event.event).data(data))),
                _ => None,
            },
        );

    Sse::new(stream).keep_alive(KeepAlive::default())
}

#[allow(clippy::too_many_arguments)]
fn spawn_initial_analysis(
    pool: Pool<Sqlite>,
    pi_client: Arc<pi_rpc::PiRpcClient>,
    event_tx: EventSender,
    system_config: db::SystemConfig,
    job_id: i64,
    project_id: i64,
    title: String,
    requirement: String,
) {
    tokio::spawn(async move {
        emit_job_event(
            &event_tx,
            job_id,
            "coordinator_started",
            "Coordinator 正在分析需求。",
        );
        if let Err(e) = run_initial_analysis(
            &pool,
            &pi_client,
            &event_tx,
            system_config,
            job_id,
            project_id,
            &title,
            &requirement,
        )
        .await
        {
            let err_msg = format!("{}", e);
            warn!("Coordinator 初始分析失败: {}", err_msg);
            // 更新数据库状态为 failed，避免前端无限等待
            if let Err(db_err) = db::set_job_failed(&pool, job_id, &err_msg).await {
                warn!("标记 job 为 failed 失败: {}", db_err);
            }
            emit_job_event(
                &event_tx,
                job_id,
                "error",
                &format!("Coordinator 分析失败: {}", err_msg),
            );
        }
    });
}

fn spawn_followup_analysis(
    pool: Pool<Sqlite>,
    pi_client: Arc<pi_rpc::PiRpcClient>,
    event_tx: EventSender,
    job_id: i64,
    project_id: i64,
    state: Arc<AppState>,
) {
    tokio::spawn(async move {
        emit_job_event(
            &event_tx,
            job_id,
            "coordinator_started",
            "Coordinator 正在继续分析澄清答案。",
        );
        if let Err(e) =
            run_followup_analysis(&pool, &pi_client, &event_tx, job_id, project_id).await
        {
            let err_msg = format!("{}", e);
            warn!("Coordinator 后续分析失败: {}", err_msg);
            // 关闭失败的 Pi Agent 进程
            state.shutdown_job_pi_client(job_id).await;
            // 更新数据库状态为 failed，避免前端无限等待
            if let Err(db_err) = db::set_job_failed(&pool, job_id, &err_msg).await {
                warn!("标记 job 为 failed 失败: {}", db_err);
            }
            emit_job_event(
                &event_tx,
                job_id,
                "error",
                &format!("Coordinator 分析失败: {}", err_msg),
            );
        }
    });
}

async fn build_project_context(
    pool: &Pool<Sqlite>,
    project_id: i64,
) -> Result<coordinator::ProjectContext> {
    let project = db::get_project(pool, project_id).await?;
    let local_path = project
        .local_path
        .as_deref()
        .context("项目尚未克隆到本地")?;
    Ok(coordinator::ProjectContext {
        name: project.name,
        git_url: project.git_url,
        local_path: local_path.to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
async fn run_initial_analysis(
    pool: &Pool<Sqlite>,
    pi_client: &pi_rpc::PiRpcClient,
    event_tx: &EventSender,
    system_config: db::SystemConfig,
    job_id: i64,
    project_id: i64,
    title: &str,
    requirement: &str,
) -> Result<()> {
    let thinking_level = get_requirement_thinking_level(pool).await;
    let project_ctx = build_project_context(pool, project_id).await.ok();
    let mut pi_event_sink = |event| emit_pi_job_event(event_tx, job_id, event);
    let decision = coordinator::start_requirement_analysis(
        pi_client,
        &system_config,
        &thinking_level,
        requirement,
        title,
        project_ctx.as_ref(),
        &mut pi_event_sink,
    )
    .await?;

    db::set_job_coordinator_session(
        pool,
        job_id,
        Some(&decision.session.session_id),
        decision.session.session_file.as_deref(),
    )
    .await?;
    apply_coordinator_decision(pool, event_tx, job_id, decision).await
}

async fn run_followup_analysis(
    pool: &Pool<Sqlite>,
    pi_client: &pi_rpc::PiRpcClient,
    event_tx: &EventSender,
    job_id: i64,
    project_id: i64,
) -> Result<()> {
    let detail = db::get_job_detail(pool, job_id).await?;
    if detail.job.clarification_round >= 5 {
        let draft = db::TaskDraftSeed {
            title: detail.job.title.clone(),
            description: "已达到最大澄清轮数，先按当前已确认信息整理需求。".to_string(),
            acceptance_criteria: vec![
                "实现范围遵循原始需求和已提交澄清答案".to_string(),
                "不确定事项按最小可行范围处理".to_string(),
                "交付时说明剩余风险和验证结果".to_string(),
            ],
        };
        db::apply_task_draft(
            pool,
            job_id,
            "已达到最大澄清轮数，我先整理确认需求卡片。",
            draft,
        )
        .await?;
        emit_job_event(event_tx, job_id, "task_draft_ready", "确认需求卡片已生成。");
        return Ok(());
    }

    let session_file = detail
        .job
        .coordinator_session_file
        .as_deref()
        .context("当前 Job 缺少 Coordinator 会话文件")?;
    let answer_summary = detail
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "user")
        .map(|message| message.content.as_str())
        .unwrap_or("用户已提交澄清答案。");
    let system_config = db::get_system_config(pool).await?;
    let thinking_level = get_requirement_thinking_level(pool).await;
    let project_ctx = build_project_context(pool, project_id).await.ok();
    let mut pi_event_sink = |event| emit_pi_job_event(event_tx, job_id, event);
    let decision = coordinator::continue_requirement_analysis(
        pi_client,
        &system_config,
        &thinking_level,
        session_file,
        answer_summary,
        project_ctx.as_ref(),
        &mut pi_event_sink,
    )
    .await?;

    apply_coordinator_decision(pool, event_tx, job_id, decision).await
}

async fn apply_coordinator_decision(
    pool: &Pool<Sqlite>,
    event_tx: &EventSender,
    job_id: i64,
    decision: coordinator::CoordinatorDecision,
) -> Result<()> {
    if !decision.progress.trim().is_empty() {
        emit_job_event(
            event_tx,
            job_id,
            "coordinator_progress",
            decision.progress.trim(),
        );
    }

    match decision.status {
        coordinator::CoordinatorStatus::NeedsClarification => {
            db::apply_clarification_items(
                pool,
                job_id,
                &decision.progress,
                decision.clarifications,
                None,
            )
            .await?;
            emit_job_event(
                event_tx,
                job_id,
                "clarifications_ready",
                "新的澄清问题已生成。",
            );
        }
        coordinator::CoordinatorStatus::Ready => {
            let draft = decision.draft.context("ready 状态缺少任务草案")?;
            db::apply_task_draft(pool, job_id, &decision.progress, draft).await?;
            emit_job_event(event_tx, job_id, "task_draft_ready", "确认需求卡片已生成。");
        }
    }

    Ok(())
}

async fn get_requirement_thinking_level(pool: &Pool<Sqlite>) -> String {
    match db::get_task_thinking_level(pool, "requirement_analysis").await {
        Ok(level) => level,
        Err(e) => {
            warn!("读取需求分析 thinking level 失败，使用 high: {}", e);
            "high".to_string()
        }
    }
}

fn emit_job_event(event_tx: &EventSender, job_id: i64, event: &str, message: &str) {
    let _ = event_tx.send(JobEvent {
        job_id,
        event: event.to_string(),
        message: message.to_string(),
        pi_type: None,
        payload: None,
    });
}

fn emit_pi_job_event(event_tx: &EventSender, job_id: i64, payload: Value) {
    let pi_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let message = summarize_pi_event(&pi_type, &payload);
    let _ = event_tx.send(JobEvent {
        job_id,
        event: "pi_event".to_string(),
        message,
        pi_type: Some(pi_type),
        payload: Some(payload),
    });
}

fn summarize_pi_event(pi_type: &str, payload: &Value) -> String {
    match pi_type {
        "agent_start" => "Pi Agent 开始处理。".to_string(),
        "agent_end" => "Pi Agent 处理完成。".to_string(),
        "turn_start" => "开始新一轮推理。".to_string(),
        "turn_end" => "本轮推理完成。".to_string(),
        "message_start" => "开始生成消息。".to_string(),
        "message_end" => "消息生成完成。".to_string(),
        "message_update" => summarize_message_update(payload),
        "tool_execution_start" => {
            format!("开始执行工具{}。", format_tool_name(payload))
        }
        "tool_execution_update" => {
            format!("工具{}正在执行。", format_tool_name(payload))
        }
        "tool_execution_end" => {
            format!("工具{}执行完成。", format_tool_name(payload))
        }
        "queue_update" => "消息队列已更新。".to_string(),
        "compaction_start" => "开始压缩上下文。".to_string(),
        "compaction_end" => "上下文压缩完成。".to_string(),
        "auto_retry_start" => "遇到临时错误，开始自动重试。".to_string(),
        "auto_retry_end" => "自动重试结束。".to_string(),
        "extension_error" => payload
            .get("errorMessage")
            .and_then(Value::as_str)
            .map(|message| format!("扩展执行出错：{message}"))
            .unwrap_or_else(|| "扩展执行出错。".to_string()),
        _ => format!("Pi 事件：{pi_type}"),
    }
}

fn summarize_message_update(payload: &Value) -> String {
    let delta_type = payload
        .get("assistantMessageEvent")
        .and_then(|event| event.get("type"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    match delta_type {
        "text_delta" => "正在生成回复文本。".to_string(),
        "thinking_delta" => "正在推理。".to_string(),
        "tool_call_delta" => "正在生成工具调用。".to_string(),
        _ => "消息正在更新。".to_string(),
    }
}

fn format_tool_name(payload: &Value) -> String {
    payload
        .get("toolName")
        .or_else(|| payload.get("tool_name"))
        .or_else(|| payload.get("name"))
        .and_then(Value::as_str)
        .map(|name| format!(" {name}"))
        .unwrap_or_default()
}

fn emit_project_event(
    event_tx: &ProjectEventSender,
    project_id: i64,
    event: &str,
    project: Option<db::Project>,
) {
    let _ = event_tx.send(ProjectEvent {
        project_id,
        event: event.to_string(),
        project,
    });
}

async fn emit_project_event_from_db(
    pool: &Pool<Sqlite>,
    event_tx: &ProjectEventSender,
    project_id: i64,
    event: &str,
) {
    match db::get_project(pool, project_id).await {
        Ok(project) => emit_project_event(event_tx, project_id, event, Some(project)),
        Err(e) => warn!("读取项目事件数据失败: {}", e),
    }
}

// ===== Pi Config API =====

/// 获取 Pi Agent 配置目录
fn pi_config_dir() -> PathBuf {
    std::env::var("PI_CODING_AGENT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".pi/agent")
        })
}

fn pi_settings_path() -> PathBuf {
    pi_config_dir().join("settings.json")
}

fn pi_auth_path() -> PathBuf {
    pi_config_dir().join("auth.json")
}

/// Pi settings.json 结构
#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PiSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    last_changelog_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_thinking_level: Option<String>,
}

/// Pi auth.json 中的单个条目（脱敏版，不返回 key）
#[derive(Debug, Serialize)]
struct PiAuthEntryPublic {
    #[serde(rename = "type")]
    auth_type: String,
}

#[derive(Debug, Serialize)]
struct PiConfigResponse {
    settings: PiSettings,
    auth: HashMap<String, PiAuthEntryPublic>,
}

/// 读取 Pi settings.json
fn read_pi_settings() -> Result<PiSettings, anyhow::Error> {
    let path = pi_settings_path();
    if !path.exists() {
        return Ok(PiSettings::default());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("读取 Pi settings 失败: {}", path.display()))?;
    let value: Value =
        serde_json::from_str(&content).with_context(|| "解析 Pi settings JSON 失败")?;

    // 手动映射字段（保留 snake_case 兼容性）
    Ok(PiSettings {
        last_changelog_version: value
            .get("lastChangelogVersion")
            .and_then(|v: &Value| v.as_str().map(String::from)),
        default_provider: value
            .get("defaultProvider")
            .and_then(|v: &Value| v.as_str().map(String::from)),
        default_model: value
            .get("defaultModel")
            .and_then(|v: &Value| v.as_str().map(String::from)),
        default_thinking_level: value
            .get("defaultThinkingLevel")
            .and_then(|v: &Value| v.as_str().map(String::from)),
    })
}

/// 读取 Pi auth.json（脱敏）
fn read_pi_auth_public() -> Result<HashMap<String, PiAuthEntryPublic>, anyhow::Error> {
    let path = pi_auth_path();
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let content = std::fs::read_to_string(&path)
        .with_context(|| format!("读取 Pi auth 失败: {}", path.display()))?;
    let raw: HashMap<String, Value> =
        serde_json::from_str(&content).with_context(|| "解析 Pi auth JSON 失败")?;

    let mut auth = HashMap::new();
    for (provider, entry) in raw {
        let auth_type = entry
            .get("type")
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "api_key".to_string());
        auth.insert(provider, PiAuthEntryPublic { auth_type });
    }
    Ok(auth)
}

/// 写入 Pi settings.json（保留其他字段）
fn write_pi_settings(settings: &PiSettings) -> Result<(), anyhow::Error> {
    let path = pi_settings_path();
    let mut value = if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str(&content)
            .with_context(|| format!("解析 Pi settings 失败: {}", path.display()))?
    } else {
        json!({})
    };

    if let Some(ref v) = settings.last_changelog_version {
        value["lastChangelogVersion"] = json!(v);
    }
    if let Some(ref v) = settings.default_provider {
        value["defaultProvider"] = json!(v);
    }
    if let Some(ref v) = settings.default_model {
        value["defaultModel"] = json!(v);
    }
    if let Some(ref v) = settings.default_thinking_level {
        value["defaultThinkingLevel"] = json!(v);
    }

    let content =
        serde_json::to_string_pretty(&value).with_context(|| "序列化 Pi settings 失败")?;
    std::fs::write(&path, content)
        .with_context(|| format!("写入 Pi settings 失败: {}", path.display()))?;
    Ok(())
}

/// 写入 Pi auth.json（添加/更新 provider）
fn write_pi_auth(provider: &str, key: &str) -> Result<(), anyhow::Error> {
    let path = pi_auth_path();
    let mut value = if path.exists() {
        let content = std::fs::read_to_string(&path)?;
        serde_json::from_str(&content)
            .with_context(|| format!("解析 Pi auth 失败: {}", path.display()))?
    } else {
        json!({})
    };

    value[provider] = json!({
        "type": "api_key",
        "key": key
    });

    let content = serde_json::to_string_pretty(&value).with_context(|| "序列化 Pi auth 失败")?;
    std::fs::create_dir_all(path.parent().unwrap_or(PathBuf::from(".").as_path()))?;
    std::fs::write(&path, content)
        .with_context(|| format!("写入 Pi auth 失败: {}", path.display()))?;
    Ok(())
}

/// 删除 Pi auth.json 中的 provider
fn delete_pi_auth(provider: &str) -> Result<(), anyhow::Error> {
    let path = pi_auth_path();
    if !path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(&path)?;
    let mut value: Value = serde_json::from_str(&content)?;

    if let Value::Object(ref mut map) = value {
        map.remove(provider);
    }

    let content = serde_json::to_string_pretty(&value)?;
    std::fs::write(&path, content)
        .with_context(|| format!("写入 Pi auth 失败: {}", path.display()))?;
    Ok(())
}

async fn pi_config_handler(
    Extension(_state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<PiConfigResponse>> {
    match (read_pi_settings(), read_pi_auth_public()) {
        (Ok(settings), Ok(auth)) => Json(ApiResponse::ok(PiConfigResponse { settings, auth })),
        (Err(e), _) | (_, Err(e)) => {
            warn!("读取 Pi 配置失败: {}", e);
            Json(ApiResponse::err(format!("读取配置失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
struct UpdatePiSettingsRequest {
    #[serde(rename = "defaultProvider")]
    default_provider: Option<String>,
    #[serde(rename = "defaultModel")]
    default_model: Option<String>,
    #[serde(rename = "defaultThinkingLevel")]
    default_thinking_level: Option<String>,
}

async fn update_pi_settings_handler(
    Extension(_state): Extension<Arc<AppState>>,
    axum::extract::Json(req): axum::extract::Json<UpdatePiSettingsRequest>,
) -> Json<ApiResponse<bool>> {
    let settings = PiSettings {
        last_changelog_version: None,
        default_provider: req.default_provider,
        default_model: req.default_model,
        default_thinking_level: req.default_thinking_level,
    };

    match write_pi_settings(&settings) {
        Ok(()) => Json(ApiResponse::ok(true)),
        Err(e) => {
            warn!("更新 Pi settings 失败: {}", e);
            Json(ApiResponse::err(format!("保存失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
struct UpdatePiAuthRequest {
    provider: String,
    #[serde(rename = "type")]
    auth_type: String,
    key: String,
}

async fn update_pi_auth_handler(
    Extension(_state): Extension<Arc<AppState>>,
    axum::extract::Json(req): axum::extract::Json<UpdatePiAuthRequest>,
) -> Json<ApiResponse<bool>> {
    if req.provider.trim().is_empty() {
        return Json(ApiResponse::err("Provider 不能为空"));
    }
    if req.key.trim().is_empty() {
        return Json(ApiResponse::err("API Key 不能为空"));
    }
    if req.auth_type != "api_key" {
        return Json(ApiResponse::err("目前仅支持 api_key 认证类型"));
    }

    match write_pi_auth(&req.provider, &req.key) {
        Ok(()) => Json(ApiResponse::ok(true)),
        Err(e) => {
            warn!("更新 Pi auth 失败: {}", e);
            Json(ApiResponse::err(format!("保存失败: {}", e)))
        }
    }
}

async fn delete_pi_auth_handler(
    Extension(_state): Extension<Arc<AppState>>,
    Path(provider): Path<String>,
) -> Json<ApiResponse<bool>> {
    match delete_pi_auth(&provider) {
        Ok(()) => Json(ApiResponse::ok(true)),
        Err(e) => {
            warn!("删除 Pi auth 失败: {}", e);
            Json(ApiResponse::err(format!("删除失败: {}", e)))
        }
    }
}

// ===== Pi 可用模型列表 =====

async fn list_models_handler(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<Vec<pi_rpc::PiModel>>> {
    match state.default_pi_client.get_available_models().await {
        Ok(models) => Json(ApiResponse::ok(models)),
        Err(e) => {
            warn!("获取模型列表失败: {}", e);
            Json(ApiResponse::err(format!("获取模型列表失败: {}", e)))
        }
    }
}

// ===== System Config API =====

async fn get_system_config_handler(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<db::SystemConfig>> {
    match db::get_system_config(&state.pool).await {
        Ok(config) => Json(ApiResponse::ok(config)),
        Err(e) => {
            warn!("获取系统配置失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
struct UpdateSystemConfigRequest {
    #[serde(rename = "coordinatorProvider")]
    coordinator_provider: String,
    #[serde(rename = "coordinatorModel")]
    coordinator_model: String,
}

async fn update_system_config_handler(
    Extension(state): Extension<Arc<AppState>>,
    axum::extract::Json(req): axum::extract::Json<UpdateSystemConfigRequest>,
) -> Json<ApiResponse<bool>> {
    if req.coordinator_provider.trim().is_empty() {
        return Json(ApiResponse::err("Coordinator Provider 不能为空"));
    }
    if req.coordinator_model.trim().is_empty() {
        return Json(ApiResponse::err("Coordinator Model 不能为空"));
    }

    match db::update_system_config(
        &state.pool,
        &req.coordinator_provider,
        &req.coordinator_model,
    )
    .await
    {
        Ok(()) => Json(ApiResponse::ok(true)),
        Err(e) => {
            warn!("更新系统配置失败: {}", e);
            Json(ApiResponse::err(format!("保存失败: {}", e)))
        }
    }
}

// ===== Worker Tier CRUD =====

async fn list_worker_tiers_handler(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<Vec<db::WorkerModelTier>>> {
    match db::get_worker_model_tiers(&state.pool).await {
        Ok(tiers) => Json(ApiResponse::ok(tiers)),
        Err(e) => {
            warn!("获取 Worker Tier 列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
struct CreateWorkerTierRequest {
    identity: String,
    #[serde(rename = "tierLevel")]
    tier_level: i64,
    provider: String,
    model: String,
    description: String,
}

async fn create_worker_tier_handler(
    Extension(state): Extension<Arc<AppState>>,
    axum::extract::Json(req): axum::extract::Json<CreateWorkerTierRequest>,
) -> Json<ApiResponse<db::WorkerModelTier>> {
    if req.identity.trim().is_empty() {
        return Json(ApiResponse::err("Identity 不能为空"));
    }
    if req.provider.trim().is_empty() {
        return Json(ApiResponse::err("Provider 不能为空"));
    }
    if req.model.trim().is_empty() {
        return Json(ApiResponse::err("Model 不能为空"));
    }
    if req.tier_level < 1 {
        return Json(ApiResponse::err("Tier Level 必须 >= 1"));
    }

    match db::create_worker_model_tier(
        &state.pool,
        &req.identity,
        req.tier_level,
        &req.provider,
        &req.model,
        &req.description,
    )
    .await
    {
        Ok(tier) => Json(ApiResponse::ok(tier)),
        Err(e) => {
            warn!("创建 Worker Tier 失败: {}", e);
            Json(ApiResponse::err(format!("创建失败: {}", e)))
        }
    }
}

#[derive(Debug, Deserialize)]
struct UpdateWorkerTierRequest {
    identity: String,
    #[serde(rename = "tierLevel")]
    tier_level: i64,
    provider: String,
    model: String,
    description: String,
}

async fn update_worker_tier_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<UpdateWorkerTierRequest>,
) -> Json<ApiResponse<bool>> {
    if req.identity.trim().is_empty() {
        return Json(ApiResponse::err("Identity 不能为空"));
    }
    if req.provider.trim().is_empty() {
        return Json(ApiResponse::err("Provider 不能为空"));
    }
    if req.model.trim().is_empty() {
        return Json(ApiResponse::err("Model 不能为空"));
    }
    if req.tier_level < 1 {
        return Json(ApiResponse::err("Tier Level 必须 >= 1"));
    }

    match db::update_worker_model_tier(
        &state.pool,
        id,
        &req.identity,
        req.tier_level,
        &req.provider,
        &req.model,
        &req.description,
    )
    .await
    {
        Ok(updated) => Json(ApiResponse::ok(updated)),
        Err(e) => {
            warn!("更新 Worker Tier 失败: {}", e);
            Json(ApiResponse::err(format!("更新失败: {}", e)))
        }
    }
}

async fn delete_worker_tier_handler(
    Extension(state): Extension<Arc<AppState>>,
    Path(id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    match db::delete_worker_model_tier(&state.pool, id).await {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => {
            warn!("删除 Worker Tier 失败: {}", e);
            Json(ApiResponse::err(format!("删除失败: {}", e)))
        }
    }
}

// ===== Thinking Policies API =====

async fn list_thinking_policies_handler(
    Extension(state): Extension<Arc<AppState>>,
) -> Json<ApiResponse<Vec<db::TaskThinkingPolicy>>> {
    match db::get_task_thinking_policies(&state.pool).await {
        Ok(policies) => Json(ApiResponse::ok(policies)),
        Err(e) => {
            warn!("获取思考策略列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("raccoon-cleanup-test-{suffix}"))
    }

    #[test]
    fn validates_local_cleanup_paths() {
        let root = temp_root();
        let session_dir = root.join("pi-sessions");
        let workspace_dir = root.join("workspace");
        let session_file = session_dir.join("session.jsonl");
        let project_dir = workspace_dir.join("project-42-demo");
        let outside_dir = root.join("outside");
        let outside_file = outside_dir.join("session.jsonl");

        fs::create_dir_all(&session_dir).unwrap();
        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&outside_dir).unwrap();
        fs::write(&session_file, "{}\n").unwrap();
        fs::write(&outside_file, "{}\n").unwrap();

        assert!(validate_session_file_path(&session_dir, &session_file).is_ok());
        assert!(validate_project_dir_path(&workspace_dir, 42, &project_dir).is_ok());
        assert!(validate_session_file_path(&session_dir, &outside_file).is_err());
        assert!(validate_session_file_path(&session_dir, &session_dir.join("bad.txt")).is_err());
        assert!(validate_project_dir_path(&workspace_dir, 7, &project_dir).is_err());

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn summarizes_pi_message_update_without_payload_leak() {
        let payload = json!({
            "type": "message_update",
            "assistantMessageEvent": { "type": "text_delta", "delta": "{\"status\"" }
        });

        assert_eq!(
            summarize_pi_event("message_update", &payload),
            "正在生成回复文本。"
        );
    }
}
