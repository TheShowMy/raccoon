use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command};
use tokio::sync::{Mutex, MutexGuard};
use tracing::info;

static REQ_ID: AtomicU64 = AtomicU64::new(0);

/// Pi Agent RPC 客户端
///
/// 通过 `pi --mode rpc` 启动持久子进程，使用 stdin/stdout JSONL 通信。
pub struct PiRpcClient {
    session_lock: Mutex<()>,
    io_lock: Mutex<()>,
    stdin: Mutex<ChildStdin>,
    stdout_reader: Mutex<BufReader<ChildStdout>>,
    #[allow(dead_code)]
    child: Mutex<Child>,
}

/// Pi Agent 返回的模型信息
///
/// 对应 RPC 命令 `get_available_models` 的响应中 `models` 数组元素。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PiModel {
    pub id: String,
    pub name: String,
    pub api: String,
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: Option<String>,
    pub reasoning: bool,
    pub input: Vec<String>,
    #[serde(rename = "contextWindow")]
    pub context_window: u64,
    #[serde(rename = "maxTokens")]
    pub max_tokens: u64,
    pub cost: Option<ModelCost>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCost {
    pub input: f64,
    pub output: f64,
    #[serde(rename = "cacheRead")]
    pub cache_read: f64,
    #[serde(rename = "cacheWrite")]
    pub cache_write: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcSessionState {
    pub session_file: Option<String>,
    pub session_id: String,
    #[serde(default)]
    pub is_streaming: bool,
    #[serde(default)]
    pub pending_message_count: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RpcSessionSwitchResult {
    #[serde(default)]
    pub cancelled: bool,
}

/// Pi Agent 消息结构（用于 get_messages）
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AgentMessage {
    pub role: String,
    #[serde(default)]
    pub content: Vec<MessageContent>,
    #[serde(rename = "toolCallId", default)]
    pub tool_call_id: Option<String>,
    #[serde(rename = "toolName", default)]
    pub tool_name: Option<String>,
    #[serde(default)]
    pub details: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct MessageContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: Option<String>,
}

impl PiRpcClient {
    /// 启动 `pi --mode rpc` 子进程并初始化客户端
    #[allow(dead_code)]
    pub async fn new(session_dir: impl AsRef<Path>) -> Result<Self> {
        Self::new_with_extension(session_dir, None, None).await
    }

    /// 启动 `pi --mode rpc` 子进程并加载可选扩展
    pub async fn new_with_extension(
        session_dir: impl AsRef<Path>,
        extension_path: Option<&Path>,
        cwd: Option<&Path>,
    ) -> Result<Self> {
        let pi_path = find_pi_binary()?;
        let session_dir = session_dir.as_ref();
        std::fs::create_dir_all(session_dir).with_context(|| {
            format!("Failed to create pi session dir: {}", session_dir.display())
        })?;
        info!("Starting pi RPC: {}", pi_path);

        let mut cmd = Command::new(&pi_path);
        cmd.arg("--mode")
            .arg("rpc")
            .arg("--session-dir")
            .arg(session_dir);

        if let Some(ext) = extension_path {
            cmd.arg("--extension").arg(ext);
            info!("Loading pi extension: {}", ext.display());
        }

        if let Some(dir) = cwd {
            cmd.current_dir(dir);
            info!("Pi Agent working directory: {}", dir.display());
        }

        let mut child = cmd
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| "Failed to spawn pi --mode rpc".to_string())?;

        let stdin = child.stdin.take().context("Failed to open pi stdin")?;
        let stdout = child.stdout.take().context("Failed to open pi stdout")?;

        // Drain stderr in background so the pipe doesn't block
        if let Some(stderr) = child.stderr.take() {
            spawn_stderr_drain(stderr);
        }

        let client = Self {
            session_lock: Mutex::new(()),
            io_lock: Mutex::new(()),
            stdin: Mutex::new(stdin),
            stdout_reader: Mutex::new(BufReader::new(stdout)),
            child: Mutex::new(child),
        };

        // Allow pi to finish initialization, then drain any startup noise
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        client.drain_startup_noise().await?;

        info!("Pi RPC client ready");
        Ok(client)
    }

    /// 获取独占会话锁。Coordinator 会跨多个 RPC 命令切换会话，必须串行执行。
    pub async fn session_guard(&self) -> MutexGuard<'_, ()> {
        self.session_lock.lock().await
    }

    /// 关闭 Pi Agent 子进程。
    pub async fn shutdown(&self) -> Result<()> {
        let mut child = self.child.lock().await;
        child
            .kill()
            .await
            .with_context(|| "Failed to kill pi agent child process")?;
        Ok(())
    }

    /// 获取所有可用模型列表
    ///
    /// 对应 RPC 命令 `get_available_models`
    pub async fn get_available_models(&self) -> Result<Vec<PiModel>> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "get_available_models"
        }));

        let resp = self.send_command(cmd, &req_id).await?;

        let models = resp
            .get("data")
            .and_then(|d| d.get("models"))
            .context("Missing models in RPC response")?;

        let models: Vec<PiModel> =
            serde_json::from_value(models.clone()).context("Failed to parse models")?;

        Ok(models)
    }

    /// 切换当前 RPC 会话模型。
    pub async fn set_model(&self, provider: &str, model_id: &str) -> Result<()> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "set_model",
            "provider": provider,
            "modelId": model_id,
        }));

        self.send_command(cmd, &req_id).await?;
        Ok(())
    }

    /// 创建新的持久会话。
    pub async fn new_session(&self) -> Result<RpcSessionSwitchResult> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "new_session",
        }));

        let resp = self.send_command(cmd, &req_id).await?;
        let data = resp
            .get("data")
            .cloned()
            .unwrap_or_else(|| json!({ "cancelled": false }));
        serde_json::from_value(data).context("Failed to parse new_session result")
    }

    /// 切换到指定 Pi 会话文件。
    pub async fn switch_session(&self, session_path: &str) -> Result<RpcSessionSwitchResult> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "switch_session",
            "sessionPath": session_path,
        }));

        let resp = self.send_command(cmd, &req_id).await?;
        let data = resp
            .get("data")
            .cloned()
            .unwrap_or_else(|| json!({ "cancelled": false }));
        serde_json::from_value(data).context("Failed to parse switch_session result")
    }

    /// 设置当前 Pi 会话展示名称。
    pub async fn set_session_name(&self, name: &str) -> Result<()> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "set_session_name",
            "name": name,
        }));

        self.send_command(cmd, &req_id).await?;
        Ok(())
    }

    /// 设置 thinking level。
    pub async fn set_thinking_level(&self, level: &str) -> Result<()> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "set_thinking_level",
            "level": level,
        }));

        self.send_command(cmd, &req_id).await?;
        Ok(())
    }

    /// 发送用户 prompt。该响应只表示消息已提交，模型输出通过事件继续流式返回。
    pub async fn prompt(&self, message: &str) -> Result<()> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "prompt",
            "message": message,
        }));

        self.send_command(cmd, &req_id).await?;
        Ok(())
    }

    /// 获取 RPC 会话状态。
    pub async fn get_state(&self) -> Result<RpcSessionState> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "get_state",
        }));

        let resp = self.send_command(cmd, &req_id).await?;
        let data = resp.get("data").context("Missing state in RPC response")?;
        let state: RpcSessionState =
            serde_json::from_value(data.clone()).context("Failed to parse state")?;
        Ok(state)
    }

    /// 按 Pi RPC 官方客户端语义等待 `agent_end` 事件。
    pub async fn wait_for_agent_end(&self, timeout: tokio::time::Duration) -> Result<()> {
        let _io_guard = self.io_lock.lock().await;
        let mut stdout = self.stdout_reader.lock().await;
        let mut buf = String::new();

        let read_until_end = async {
            loop {
                buf.clear();
                stdout
                    .read_line(&mut buf)
                    .await
                    .context("Failed to read from pi stdout")?;

                let trimmed = buf.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let val: Value = serde_json::from_str(trimmed)
                    .with_context(|| format!("Failed to parse JSON: {}", trimmed))?;
                if val.get("type") == Some(&json!("agent_end")) {
                    return Ok(());
                }
            }
        };

        tokio::time::timeout(timeout, read_until_end)
            .await
            .context("等待 Pi RPC agent_end 超时")?
    }

    /// 读取最后一条 assistant 文本。
    pub async fn get_last_assistant_text(&self) -> Result<Option<String>> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "get_last_assistant_text",
        }));

        let resp = self.send_command(cmd, &req_id).await?;
        let text = resp
            .get("data")
            .and_then(|d| d.get("text"))
            .and_then(|v| v.as_str())
            .map(String::from);
        Ok(text)
    }

    /// 获取会话中的所有消息。
    pub async fn get_messages(&self) -> Result<Vec<AgentMessage>> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "get_messages",
        }));

        let resp = self.send_command(cmd, &req_id).await?;
        let messages = resp
            .get("data")
            .and_then(|d| d.get("messages"))
            .context("Missing messages in RPC response")?;

        let messages: Vec<AgentMessage> =
            serde_json::from_value(messages.clone()).context("Failed to parse messages")?;
        Ok(messages)
    }

    /// 发送 steer 指令，在流式过程中插队指导。
    pub async fn steer(&self, message: &str) -> Result<()> {
        let (cmd, req_id) = command_with_id(json!({
            "type": "steer",
            "message": message,
        }));

        self.send_command(cmd, &req_id).await?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    /// Drain any lines already in the stdout buffer before the first real command.
    /// Uses a short timeout so we don't wait forever.
    async fn drain_startup_noise(&self) -> Result<()> {
        let mut stdout = self.stdout_reader.lock().await;
        let mut buf = String::new();
        let timeout = tokio::time::Duration::from_millis(100);

        loop {
            buf.clear();
            match tokio::time::timeout(timeout, stdout.read_line(&mut buf)).await {
                Ok(Ok(0)) => break,  // EOF
                Ok(Ok(_)) => {}      // drained a line, keep going
                Ok(Err(_)) => break, // read error
                Err(_) => break,     // timeout → no more buffered data
            }
        }
        Ok(())
    }

    /// Send a command and block until the matching response arrives.
    /// Non-response lines (events) are skipped.
    async fn send_command(&self, cmd: Value, expected_id: &str) -> Result<Value> {
        let _io_guard = self.io_lock.lock().await;
        let line = format!("{}\n", cmd);

        // Write
        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .context("Failed to write to pi stdin")?;
            stdin.flush().await.context("Failed to flush pi stdin")?;
        }

        // Read until we find a response with the matching id
        {
            let mut stdout = self.stdout_reader.lock().await;
            let mut buf = String::new();

            loop {
                buf.clear();
                stdout
                    .read_line(&mut buf)
                    .await
                    .context("Failed to read from pi stdout")?;

                let trimmed = buf.trim();
                if trimmed.is_empty() {
                    continue;
                }

                let val: Value = serde_json::from_str(trimmed)
                    .with_context(|| format!("Failed to parse JSON: {}", trimmed))?;

                // Match response type + id
                if val.get("type") == Some(&json!("response"))
                    && val.get("id") == Some(&json!(expected_id))
                {
                    if val.get("success") == Some(&json!(true)) {
                        return Ok(val);
                    }
                    let err = val
                        .get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Unknown RPC error");
                    anyhow::bail!("Pi RPC error: {}", err);
                }

                // Anything else (event, response for another request) → keep reading
            }
        }
    }
}

fn command_with_id(mut cmd: Value) -> (Value, String) {
    let req_id = format!("req-{}", REQ_ID.fetch_add(1, Ordering::SeqCst));
    cmd["id"] = json!(req_id);
    (cmd, req_id)
}

/// Locate the `pi` binary on this machine.
fn find_pi_binary() -> Result<String> {
    for path in [
        "/opt/homebrew/bin/pi",
        "/usr/local/bin/pi",
        "/usr/bin/pi",
        "/bin/pi",
    ] {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    if let Some(home) = dirs::home_dir() {
        for rel in [".local/bin/pi", ".cargo/bin/pi"] {
            let path = home.join(rel);
            if path.exists() {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    Ok("pi".to_string())
}

/// Spawn a background task that drains pi's stderr to prevent the pipe from blocking.
fn spawn_stderr_drain(stderr: ChildStderr) {
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr);
        let mut buf = String::new();
        loop {
            buf.clear();
            match reader.read_line(&mut buf).await {
                Ok(0) => break,
                Ok(_) => {
                    let t = buf.trim();
                    if !t.is_empty() {
                        tracing::debug!(target: "pi_stderr", "{}", t);
                    }
                }
                Err(e) => {
                    tracing::debug!("pi stderr read error: {}", e);
                    break;
                }
            }
        }
    });
}
