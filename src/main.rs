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
use std::path::PathBuf;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct JobEvent {
    job_id: i64,
    event: String,
    message: String,
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
    let extension_path = std::path::Path::new("pi-extensions/coordinator-decision.ts");
    let pi_client = match pi_rpc::PiRpcClient::new_with_extension(
        &pi_session_dir,
        extension_path.exists().then_some(extension_path),
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
    let app = create_router(pool, pi_client, event_tx);

    let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
    info!("🦝 raccoon 服务启动于 http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

fn create_router(
    pool: Pool<Sqlite>,
    pi_client: Arc<pi_rpc::PiRpcClient>,
    event_tx: EventSender,
) -> Router {
    let api_routes = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/pi-status", get(pi_status_handler))
        .route(
            "/api/projects",
            get(list_projects_handler).post(create_project_handler),
        )
        .route(
            "/api/projects/:id/jobs",
            get(list_project_jobs_handler).post(create_job_handler),
        )
        .route("/api/jobs/:id", get(get_job_handler))
        .route("/api/jobs/:id/events", get(job_events_handler))
        .route(
            "/api/jobs/:id/clarifications",
            post(submit_clarifications_handler),
        )
        .route("/api/jobs/:id/confirm", post(confirm_job_handler))
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
        .layer(Extension(pool))
        .layer(Extension(pi_client))
        .layer(Extension(event_tx));

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

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListJobsQuery {
    #[serde(default)]
    include_archived: bool,
}

async fn list_project_jobs_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
    Path(project_id): Path<i64>,
    Query(query): Query<ListJobsQuery>,
) -> Json<ApiResponse<Vec<db::Job>>> {
    match db::get_project_jobs(&pool, project_id, query.include_archived).await {
        Ok(jobs) => Json(ApiResponse::ok(jobs)),
        Err(e) => {
            warn!("获取 Job 列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

async fn create_job_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
    Extension(pi_client): Extension<Arc<pi_rpc::PiRpcClient>>,
    Extension(event_tx): Extension<EventSender>,
    Path(project_id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<CreateJobRequest>,
) -> Json<ApiResponse<db::JobDetail>> {
    let requirement = req.requirement.trim();
    if requirement.is_empty() {
        return Json(ApiResponse::err("需求内容不能为空"));
    }

    let system_config = match db::get_system_config(&pool).await {
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

    match db::create_analyzing_job(&pool, project_id, requirement).await {
        Ok(detail) => {
            let job_id = detail.job.id;
            spawn_initial_analysis(
                pool.clone(),
                pi_client,
                event_tx,
                system_config,
                job_id,
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::get_job_detail(&pool, job_id).await {
        Ok(detail) => Json(ApiResponse::ok(detail)),
        Err(e) => {
            warn!("获取 Job 详情失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}

async fn submit_clarifications_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
    Extension(pi_client): Extension<Arc<pi_rpc::PiRpcClient>>,
    Extension(event_tx): Extension<EventSender>,
    Path(job_id): Path<i64>,
    axum::extract::Json(req): axum::extract::Json<SubmitClarificationsRequest>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::submit_clarification_answers(&pool, job_id, &req.answers).await {
        Ok(detail) => {
            if detail.job.status == "analyzing" {
                spawn_followup_analysis(pool.clone(), pi_client, event_tx, job_id);
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Extension(event_tx): Extension<EventSender>,
    Path(job_id): Path<i64>,
) -> Json<ApiResponse<db::JobDetail>> {
    match db::confirm_job(&pool, job_id).await {
        Ok(detail) => {
            emit_job_event(&event_tx, job_id, "archived", "需求已确认，会话已归档。");
            Json(ApiResponse::ok(detail))
        }
        Err(e) => {
            warn!("确认 Job 失败: {}", e);
            Json(ApiResponse::err(format!("确认失败: {}", e)))
        }
    }
}

async fn job_events_handler(
    Extension(event_tx): Extension<EventSender>,
    Path(job_id): Path<i64>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream = BroadcastStream::new(event_tx.subscribe()).filter_map(move |item| match item {
        Ok(event) if event.job_id == job_id => serde_json::to_string(&event)
            .ok()
            .map(|data| Ok(Event::default().event(event.event).data(data))),
        _ => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn spawn_initial_analysis(
    pool: Pool<Sqlite>,
    pi_client: Arc<pi_rpc::PiRpcClient>,
    event_tx: EventSender,
    system_config: db::SystemConfig,
    job_id: i64,
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
            &title,
            &requirement,
        )
        .await
        {
            warn!("Coordinator 初始分析失败: {}", e);
            emit_job_event(
                &event_tx,
                job_id,
                "error",
                &format!("Coordinator 分析失败: {}", e),
            );
        }
    });
}

fn spawn_followup_analysis(
    pool: Pool<Sqlite>,
    pi_client: Arc<pi_rpc::PiRpcClient>,
    event_tx: EventSender,
    job_id: i64,
) {
    tokio::spawn(async move {
        emit_job_event(
            &event_tx,
            job_id,
            "coordinator_started",
            "Coordinator 正在继续分析澄清答案。",
        );
        if let Err(e) = run_followup_analysis(&pool, &pi_client, &event_tx, job_id).await {
            warn!("Coordinator 后续分析失败: {}", e);
            emit_job_event(
                &event_tx,
                job_id,
                "error",
                &format!("Coordinator 分析失败: {}", e),
            );
        }
    });
}

async fn run_initial_analysis(
    pool: &Pool<Sqlite>,
    pi_client: &pi_rpc::PiRpcClient,
    event_tx: &EventSender,
    system_config: db::SystemConfig,
    job_id: i64,
    title: &str,
    requirement: &str,
) -> Result<()> {
    let thinking_level = get_requirement_thinking_level(pool).await;
    let decision = coordinator::start_requirement_analysis(
        pi_client,
        &system_config,
        &thinking_level,
        requirement,
        title,
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
    let decision = coordinator::continue_requirement_analysis(
        pi_client,
        &system_config,
        &thinking_level,
        session_file,
        answer_summary,
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
    });
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

async fn pi_config_handler() -> Json<ApiResponse<PiConfigResponse>> {
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

async fn delete_pi_auth_handler(Path(provider): Path<String>) -> Json<ApiResponse<bool>> {
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
    Extension(pi_client): Extension<std::sync::Arc<pi_rpc::PiRpcClient>>,
) -> Json<ApiResponse<Vec<pi_rpc::PiModel>>> {
    match pi_client.get_available_models().await {
        Ok(models) => Json(ApiResponse::ok(models)),
        Err(e) => {
            warn!("获取模型列表失败: {}", e);
            Json(ApiResponse::err(format!("获取模型列表失败: {}", e)))
        }
    }
}

// ===== System Config API =====

async fn get_system_config_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<ApiResponse<db::SystemConfig>> {
    match db::get_system_config(&pool).await {
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
    Extension(pool): Extension<Pool<Sqlite>>,
    axum::extract::Json(req): axum::extract::Json<UpdateSystemConfigRequest>,
) -> Json<ApiResponse<bool>> {
    if req.coordinator_provider.trim().is_empty() {
        return Json(ApiResponse::err("Coordinator Provider 不能为空"));
    }
    if req.coordinator_model.trim().is_empty() {
        return Json(ApiResponse::err("Coordinator Model 不能为空"));
    }

    match db::update_system_config(&pool, &req.coordinator_provider, &req.coordinator_model).await {
        Ok(()) => Json(ApiResponse::ok(true)),
        Err(e) => {
            warn!("更新系统配置失败: {}", e);
            Json(ApiResponse::err(format!("保存失败: {}", e)))
        }
    }
}

// ===== Worker Tier CRUD =====

async fn list_worker_tiers_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<ApiResponse<Vec<db::WorkerModelTier>>> {
    match db::get_worker_model_tiers(&pool).await {
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
    Extension(pool): Extension<Pool<Sqlite>>,
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
        &pool,
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
    Extension(pool): Extension<Pool<Sqlite>>,
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
        &pool,
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
    Extension(pool): Extension<Pool<Sqlite>>,
    Path(id): Path<i64>,
) -> Json<ApiResponse<bool>> {
    match db::delete_worker_model_tier(&pool, id).await {
        Ok(deleted) => Json(ApiResponse::ok(deleted)),
        Err(e) => {
            warn!("删除 Worker Tier 失败: {}", e);
            Json(ApiResponse::err(format!("删除失败: {}", e)))
        }
    }
}

// ===== Thinking Policies API =====

async fn list_thinking_policies_handler(
    Extension(pool): Extension<Pool<Sqlite>>,
) -> Json<ApiResponse<Vec<db::TaskThinkingPolicy>>> {
    match db::get_task_thinking_policies(&pool).await {
        Ok(policies) => Json(ApiResponse::ok(policies)),
        Err(e) => {
            warn!("获取思考策略列表失败: {}", e);
            Json(ApiResponse::err(format!("获取失败: {}", e)))
        }
    }
}
