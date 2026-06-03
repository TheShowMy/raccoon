use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;
use tracing::info;

static REQ_ID: AtomicU64 = AtomicU64::new(0);

/// Pi Agent RPC 客户端
///
/// 通过 `pi --mode rpc` 启动持久子进程，使用 stdin/stdout JSONL 通信。
pub struct PiRpcClient {
    stdin: Mutex<ChildStdin>,
    stdout_reader: Mutex<BufReader<ChildStdout>>,
    #[allow(dead_code)]
    child: Child,
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

impl PiRpcClient {
    /// 启动 `pi --mode rpc` 子进程并初始化客户端
    pub async fn new() -> Result<Self> {
        let pi_path = find_pi_binary()?;
        info!("Starting pi RPC: {}", pi_path);

        let mut child = Command::new(&pi_path)
            .arg("--mode")
            .arg("rpc")
            .arg("--no-session")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| "Failed to spawn pi --mode rpc".to_string())?;

        let stdin = child.stdin.take().context("Failed to open pi stdin")?;
        let stdout = child.stdout.take().context("Failed to open pi stdout")?;

        // Drain stderr in background so the pipe doesn't block
        if let Some(stderr) = child.stderr.take() {
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

        let client = Self {
            stdin: Mutex::new(stdin),
            stdout_reader: Mutex::new(BufReader::new(stdout)),
            child,
        };

        // Allow pi to finish initialization, then drain any startup noise
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        client.drain_startup_noise().await?;

        info!("Pi RPC client ready");
        Ok(client)
    }

    /// 获取所有可用模型列表
    ///
    /// 对应 RPC 命令 `get_available_models`
    pub async fn get_available_models(&self) -> Result<Vec<PiModel>> {
        let req_id = format!("req-{}", REQ_ID.fetch_add(1, Ordering::SeqCst));
        let cmd = json!({
            "id": req_id,
            "type": "get_available_models"
        });

        let resp = self.send_command(cmd, &req_id).await?;

        let models = resp
            .get("data")
            .and_then(|d| d.get("models"))
            .context("Missing models in RPC response")?;

        let models: Vec<PiModel> =
            serde_json::from_value(models.clone()).context("Failed to parse models")?;

        Ok(models)
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
