use crate::commands::confluence::send_confluence_get;
use crate::commands::CmdResult;
use crate::config::{self, AppConfig, ConfluenceConfig};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;

const MAX_CONFLUENCE_TEST_BODY_BYTES: usize = 1_048_576; // 1 MiB
const MD2CF_CHECK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const MD2CF_CHECK_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);
const MD2CF_KILL_FAILURE_WAIT: std::time::Duration = std::time::Duration::from_secs(3);
static CONFIG_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceTokenStatus {
    pub has_token: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Md2cfCheckResult {
    pub installed: bool,
    pub version: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceTestResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceConnectionPayload {
    pub base_url: String,
    pub username: String,
    pub api_token: Option<String>,
    pub space_key: String,
    pub ignore_ssl: bool,
}

/// 获取当前应用可写目录路径。
#[tauri::command]
pub fn get_app_dir(app_handle: tauri::AppHandle) -> CmdResult<String> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(path) => CmdResult::success(path.to_string_lossy().to_string()),
        Err(e) => CmdResult::failure(e),
    }
}

/// 读取应用配置。
/// 配置不存在或损坏时返回默认配置，目录解析失败时也返回默认配置，不阻断启动。
#[tauri::command]
pub fn get_config(app_handle: tauri::AppHandle) -> CmdResult<AppConfig> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let config_path = config::config_file_path(&dir);
            match config::read_config(&config_path) {
                Ok(cfg) => CmdResult::success(cfg),
                Err(e) => {
                    tracing::warn!(path = %config_path.display(), error = %e, "config read failed, using defaults");
                    CmdResult::success(AppConfig::default())
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "writable dir resolve failed, using defaults");
            CmdResult::success(AppConfig::default())
        }
    }
}

/// 更新配置字段并写入配置。
#[tauri::command]
pub fn set_config(
    app_handle: tauri::AppHandle,
    save_path: Option<String>,
    theme_id: Option<String>,
) -> CmdResult<()> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let _config_write_lock = CONFIG_WRITE_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let config_path = config::config_file_path(&dir);
            let mut cfg = config::read_config(&config_path).unwrap_or_default();
            if let Some(save_path) = save_path {
                cfg.save_path = Some(save_path);
            }
            if let Some(theme_id) = theme_id {
                if !config::is_valid_theme_id(&theme_id) {
                    return CmdResult::failure(config::ERR_INVALID_THEME_ID.to_string());
                }
                cfg.theme_id = theme_id;
            }
            match config::write_config(&config_path, &cfg) {
                Ok(_) => CmdResult::ok(),
                Err(e) => CmdResult::failure(e),
            }
        }
        Err(e) => CmdResult::failure(e),
    }
}

/// 更新最近一次打开的文件路径。
#[tauri::command]
pub fn update_last_opened_file(
    app_handle: tauri::AppHandle,
    file_path: Option<String>,
) -> CmdResult<()> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let _config_write_lock = CONFIG_WRITE_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let config_path = config::config_file_path(&dir);
            let mut cfg = config::read_config(&config_path).unwrap_or_default();
            cfg.last_opened_file = file_path;
            match config::write_config(&config_path, &cfg) {
                Ok(_) => CmdResult::ok(),
                Err(e) => CmdResult::failure(e),
            }
        }
        Err(e) => CmdResult::failure(e),
    }
}

/// 更新 Confluence 配置（不包含 Token）。
#[tauri::command]
pub fn set_confluence_config(
    app_handle: tauri::AppHandle,
    confluence: ConfluenceConfig,
) -> CmdResult<()> {
    let trimmed = normalize_confluence_config(confluence);
    if trimmed.base_url.is_empty() {
        return CmdResult::failure(config::ERR_CONFLUENCE_REQUIRED_FIELD_MISSING.to_string());
    }
    if !config::is_valid_confluence_base_url(&trimmed.base_url) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_BASE_URL.to_string());
    }
    // Space Key 现在延后到"浏览 Space/页面树"步骤才选定，第一步（PAT + Base URL）保存时允许为空。
    if !trimmed.space_key.is_empty() && !config::is_valid_confluence_space_key(&trimmed.space_key) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_SPACE_KEY.to_string());
    }
    if !trimmed.parent_page_id.is_empty()
        && !config::is_valid_confluence_parent_page_id(&trimmed.parent_page_id)
    {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_PARENT_PAGE_ID.to_string());
    }

    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let config_path = config::config_file_path(&dir);
            let mut cfg = config::read_config(&config_path).unwrap_or_default();
            cfg.confluence = trimmed;
            match config::write_config(&config_path, &cfg) {
                Ok(_) => CmdResult::ok(),
                Err(e) => CmdResult::failure(e),
            }
        }
        Err(e) => CmdResult::failure(e),
    }
}

/// 解析 Confluence API Token 本地文件的完整路径（基于应用可写目录）。
pub(crate) fn resolve_confluence_token_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    config::resolve_writable_dir(app_handle)
        .map(|dir| config::confluence_token_file_path(&dir))
}

/// 检测当前系统是否已保存 Confluence API Token。
#[tauri::command]
pub fn get_confluence_token_status(app_handle: tauri::AppHandle) -> CmdResult<ConfluenceTokenStatus> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    match config::read_confluence_token_file(&token_path) {
        Ok(token) => CmdResult::success(ConfluenceTokenStatus {
            has_token: token.map(|t| !t.trim().is_empty()).unwrap_or(false),
        }),
        Err(error) => CmdResult::failure(error),
    }
}

/// 将 Confluence API Token 写入本地文件（应用可写目录下的独立文件，见 `resolve_confluence_token_path`）。
#[tauri::command]
pub fn set_confluence_token(app_handle: tauri::AppHandle, api_token: String) -> CmdResult<()> {
    let token = api_token.trim().to_string();
    if token.is_empty() {
        return CmdResult::failure(config::ERR_CONFLUENCE_TOKEN_MISSING.to_string());
    }

    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    match config::write_confluence_token_file(&token_path, &token) {
        Ok(_) => CmdResult::ok(),
        Err(error) => CmdResult::failure(error),
    }
}

/// 清除已保存的 Confluence API Token。
#[tauri::command]
pub fn clear_confluence_token(app_handle: tauri::AppHandle) -> CmdResult<()> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    match config::delete_confluence_token_file(&token_path) {
        Ok(_) => CmdResult::ok(),
        Err(error) => CmdResult::failure(error),
    }
}

/// 清除全部已保存的 Confluence 信息（配置字段 + 安全令牌），用于测试/重新配置时一键重置。
#[tauri::command]
pub fn clear_confluence_settings(app_handle: tauri::AppHandle) -> CmdResult<()> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    if let Err(error) = config::delete_confluence_token_file(&token_path) {
        return CmdResult::failure(error);
    }

    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let _config_write_lock = CONFIG_WRITE_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let config_path = config::config_file_path(&dir);
            let mut cfg = config::read_config(&config_path).unwrap_or_default();
            cfg.confluence = ConfluenceConfig::default();
            match config::write_config(&config_path, &cfg) {
                Ok(_) => CmdResult::ok(),
                Err(e) => CmdResult::failure(e),
            }
        }
        Err(e) => CmdResult::failure(e),
    }
}

enum CommandRunResult {
    Completed(std::process::Output),
    TimedOut { stdout: Vec<u8>, stderr: Vec<u8> },
}

enum KillProcessTreeResult {
    Killed,
    AlreadyExited,
}

/// Reads at most `cap` bytes from `reader` into a `Vec`, stopping early (without erroring) once
/// the cap is reached. Used to drain a child's stdout/stderr on a background thread while the
/// main thread polls for exit — see `run_command_with_timeout` for why this draining is required.
fn read_capped(mut reader: impl std::io::Read, cap: usize) -> Vec<u8> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        match reader.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.len() >= cap {
                    break;
                }
            }
            Err(_) => break,
        }
    }
    buf
}

fn join_child_output(
    stdout_thread: std::thread::JoinHandle<Vec<u8>>,
    stderr_thread: std::thread::JoinHandle<Vec<u8>>,
) -> (Vec<u8>, Vec<u8>) {
    (
        stdout_thread.join().unwrap_or_default(),
        stderr_thread.join().unwrap_or_default(),
    )
}

#[cfg(test)]
static TEST_TIMEOUT_KILL_DELAY_MS: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0);

fn maybe_delay_before_timeout_kill() {
    #[cfg(test)]
    {
        let delay_ms = TEST_TIMEOUT_KILL_DELAY_MS.load(std::sync::atomic::Ordering::SeqCst);
        if delay_ms > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        }
    }
}

#[cfg(unix)]
// Kills the child's *process group* (this process plus any descendant that has not called
// `setsid`/changed its own group), not a fully general process tree: a descendant that
// deliberately detaches into a new session/group would survive. `md2cf` (a simple CLI/wrapper)
// is not expected to do this; this is the same scope limitation most process-group-based
// "kill the tree" implementations accept.
fn kill_process_tree(child: &std::process::Child) -> std::io::Result<KillProcessTreeResult> {
    let pgid = child.id() as libc::pid_t;
    if unsafe { libc::kill(-pgid, libc::SIGKILL) } == 0 {
        Ok(KillProcessTreeResult::Killed)
    } else {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(libc::ESRCH) {
            Ok(KillProcessTreeResult::AlreadyExited)
        } else {
            Err(error)
        }
    }
}

#[cfg(windows)]
fn kill_process_tree(child: &std::process::Child) -> std::io::Result<KillProcessTreeResult> {
    // `taskkill` is spawned rather than run via the blocking `.output()` helper and then bounded
    // with the same poll-based wait used elsewhere in this module: a hung/blocked `taskkill.exe`
    // (e.g. AV interference, an overloaded system) must not make this function block
    // indefinitely, which would defeat the whole point of the timeout it is enforcing.
    let pid = child.id().to_string();
    let mut taskkill = std::process::Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;

    let stdout = taskkill.stdout.take().expect("stdout piped");
    let stderr = taskkill.stderr.take().expect("stderr piped");
    let stdout_thread = std::thread::spawn(move || read_capped(stdout, 8192));
    let stderr_thread = std::thread::spawn(move || read_capped(stderr, 8192));

    let status = match wait_for_child_exit_after_failed_kill(&mut taskkill, MD2CF_KILL_FAILURE_WAIT)?
    {
        Some(status) => status,
        None => {
            // `taskkill` itself did not return in time: best-effort kill it so it doesn't
            // linger, then report a real failure rather than blocking further.
            let _ = taskkill.kill();
            let _ = taskkill.wait();
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(std::io::Error::other(format!(
                "taskkill /PID {pid} /T /F did not exit within {:?}",
                MD2CF_KILL_FAILURE_WAIT
            )));
        }
    };

    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = stderr_thread.join().unwrap_or_default();

    if status.success() {
        return Ok(KillProcessTreeResult::Killed);
    }
    if status.code() == Some(128) {
        return Ok(KillProcessTreeResult::AlreadyExited);
    }

    let stdout = String::from_utf8_lossy(&stdout);
    let stderr = String::from_utf8_lossy(&stderr);
    Err(std::io::Error::other(format!(
        "taskkill /PID {pid} /T /F failed with status {}: {}{}",
        status,
        stdout.trim(),
        if stderr.trim().is_empty() {
            String::new()
        } else if stdout.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            format!("; {}", stderr.trim())
        }
    )))
}

fn wait_for_child_exit_after_failed_kill(
    child: &mut std::process::Child,
    timeout: std::time::Duration,
) -> std::io::Result<Option<std::process::ExitStatus>> {
    let start = std::time::Instant::now();
    loop {
        match child.try_wait()? {
            Some(status) => return Ok(Some(status)),
            None if start.elapsed() >= timeout => return Ok(None),
            None => std::thread::sleep(MD2CF_CHECK_POLL_INTERVAL),
        }
    }
}

fn md2cf_timeout_message(stdout: &[u8], stderr: &[u8]) -> String {
    if stdout.is_empty() && stderr.is_empty() {
        "检测 md2cf 超时，将使用 REST API 直连模式。".to_string()
    } else {
        "检测 md2cf 超时；进程在被终止前已产生输出，可能接近完成，将使用 REST API 直连模式。"
            .to_string()
    }
}

/// Spawns `cmd`, polls with `try_wait()` at `MD2CF_CHECK_POLL_INTERVAL` until it exits or
/// `timeout` elapses. On timeout, kills the child and returns `TimedOut`.
///
/// stdout/stderr are drained concurrently on background threads (capped at
/// `MAX_CHILD_OUTPUT_BYTES` each) while the main thread polls: without this, a child that writes
/// more than the OS pipe buffer (commonly ~64 KiB) before exiting would block on the write,
/// `try_wait()` would never observe an exit, and the call would always resolve as `TimedOut` —
/// the classic "forgot to drain the pipes" footgun that plain `Command::output()` avoids
/// internally but a hand-rolled poll loop would otherwise reintroduce.
///
/// If the child happens to exit naturally in the tiny window between `try_wait()` returning
/// `None` and `child.kill()` being called, `kill()` may return an `Err` (the process is already
/// gone). That is NOT a real failure — treat it as "process already exited" and fall back to
/// `child.wait()` to collect its actual (non-killed) exit status instead of reporting a
/// spurious timeout. Likewise, if `try_wait()` itself returns an `Err`, the child is killed and
/// reaped before the error is propagated, so it is never leaked as an orphaned/zombie process.
/// A real timeout-kill failure gets only a bounded secondary `try_wait()` window
/// (`MD2CF_KILL_FAILURE_WAIT`); this path must never block indefinitely.
fn run_command_with_timeout(
    mut cmd: std::process::Command,
    timeout: std::time::Duration,
) -> std::io::Result<CommandRunResult> {
    const MAX_CHILD_OUTPUT_BYTES: usize = 1_048_576; // 1 MiB per stream — ample for `md2cf --version`

    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn()?;

    let stdout = child.stdout.take().expect("stdout was configured as piped");
    let stderr = child.stderr.take().expect("stderr was configured as piped");
    let stdout_thread = std::thread::spawn(move || read_capped(stdout, MAX_CHILD_OUTPUT_BYTES));
    let stderr_thread = std::thread::spawn(move || read_capped(stderr, MAX_CHILD_OUTPUT_BYTES));

    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let (stdout, stderr) = join_child_output(stdout_thread, stderr_thread);
                return Ok(CommandRunResult::Completed(std::process::Output {
                    status,
                    stdout,
                    stderr,
                }));
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    maybe_delay_before_timeout_kill();
                    match kill_process_tree(&child) {
                        Ok(KillProcessTreeResult::Killed) => {
                            let _ = child.wait()?;
                            let (stdout, stderr) = join_child_output(stdout_thread, stderr_thread);
                            return Ok(CommandRunResult::TimedOut { stdout, stderr });
                        }
                        Ok(KillProcessTreeResult::AlreadyExited) => {
                            let status = child.wait()?;
                            let (stdout, stderr) = join_child_output(stdout_thread, stderr_thread);
                            return Ok(CommandRunResult::Completed(std::process::Output {
                                status,
                                stdout,
                                stderr,
                            }));
                        }
                        Err(kill_error) => match wait_for_child_exit_after_failed_kill(
                            &mut child,
                            MD2CF_KILL_FAILURE_WAIT,
                        )? {
                            Some(status) => {
                                let (stdout, stderr) =
                                    join_child_output(stdout_thread, stderr_thread);
                                return Ok(CommandRunResult::Completed(std::process::Output {
                                    status,
                                    stdout,
                                    stderr,
                                }));
                            }
                            None => {
                                // The reader threads are intentionally left un-joined here: they
                                // block on reading from pipes tied to a child we could not
                                // confirm as terminated, so joining them could itself block
                                // indefinitely (the very thing `MD2CF_KILL_FAILURE_WAIT` exists
                                // to bound). They are effectively detached and will finish
                                // whenever the pipes eventually close (child exit or output cap).
                                return Err(std::io::Error::new(
                                    kill_error.kind(),
                                    format!(
                                        "timed out, failed to terminate process tree, and could not confirm exit within {:?}: {}",
                                        MD2CF_KILL_FAILURE_WAIT, kill_error
                                    ),
                                ));
                            }
                        },
                    }
                }
                std::thread::sleep(MD2CF_CHECK_POLL_INTERVAL);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_thread.join();
                let _ = stderr_thread.join();
                return Err(error);
            }
        }
    }
}

/// 检测 md2cf 命令行工具是否可用。
#[tauri::command]
pub fn check_md2cf_installed() -> CmdResult<Md2cfCheckResult> {
    let mut cmd = Command::new("md2cf");
    cmd.arg("--version");
    match run_command_with_timeout(cmd, MD2CF_CHECK_TIMEOUT) {
        Ok(CommandRunResult::Completed(output)) => {
            let version = first_non_empty_line(&output.stdout)
                .or_else(|| first_non_empty_line(&output.stderr));
            let installed = output.status.success();
            let message = if installed {
                format!(
                    "已检测到 md2cf{}。",
                    version
                        .as_ref()
                        .map(|value| format!("（{}）", value))
                        .unwrap_or_default()
                )
            } else {
                "检测到 md2cf 命令，但执行失败（可能安装损坏），将使用 REST API 直连模式。".to_string()
            };
            CmdResult::success(Md2cfCheckResult {
                installed,
                version,
                message,
            })
        }
        Ok(CommandRunResult::TimedOut { stdout, stderr }) => CmdResult::success(Md2cfCheckResult {
            installed: false,
            version: None,
            message: md2cf_timeout_message(&stdout, &stderr),
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            CmdResult::success(Md2cfCheckResult {
                installed: false,
                version: None,
                message: "未检测到 md2cf，将使用 REST API 直连模式。".to_string(),
            })
        }
        Err(error) => CmdResult::success(Md2cfCheckResult {
            installed: false,
            version: None,
            message: format!("检测 md2cf 失败：{}", error),
        }),
    }
}

/// 测试 Confluence REST API 连通性与权限。
#[tauri::command]
pub async fn test_confluence_connection(
    app_handle: tauri::AppHandle,
    payload: ConfluenceConnectionPayload,
) -> CmdResult<ConfluenceTestResult> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    test_confluence_connection_impl(payload, &token_path).await
}

async fn test_confluence_connection_impl(
    payload: ConfluenceConnectionPayload,
    token_path: &Path,
) -> CmdResult<ConfluenceTestResult> {
    let base_url = payload.base_url.trim().trim_end_matches('/').to_string();
    let username = payload.username.trim().to_string();
    let space_key = payload.space_key.trim().to_string();

    if base_url.is_empty() || space_key.is_empty() {
        return CmdResult::success(ConfluenceTestResult {
            success: false,
            message: "请先填写 Confluence 地址和 Space Key。".to_string(),
            status_code: None,
        });
    }

    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::success(ConfluenceTestResult {
            success: false,
            message: "Confluence Base URL 格式无效，必须为 http:// 或 https:// 开头的合法地址。".to_string(),
            status_code: None,
        });
    }

    if !config::is_valid_confluence_space_key(&space_key) {
        return CmdResult::success(ConfluenceTestResult {
            success: false,
            message: "Space Key 格式无效，仅支持字母、数字和下划线。".to_string(),
            status_code: None,
        });
    }

    let token = match resolve_connection_token(token_path, payload.api_token) {
        Ok(value) => value,
        Err(error) if error == config::ERR_CONFLUENCE_TOKEN_MISSING => {
            return CmdResult::success(ConfluenceTestResult {
                success: false,
                message: "请先输入或保存 API Token。".to_string(),
                status_code: None,
            })
        }
        Err(error) => return CmdResult::failure(error),
    };

    let url = format!("{}/rest/api/space/{}", base_url, space_key);
    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(payload.ignore_ssl)
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_CLIENT_BUILD_FAILED,
                error
            ))
        }
    };

    let response = send_confluence_get(
        &client,
        &url,
        &username,
        &token,
        None,
        Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
    )
    .await;

    match response {
        Ok(mut response) => {
            let status = response.status();
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let mut buf: Vec<u8> = Vec::new();
            let mut oversized = false;
            loop {
                match response.chunk().await {
                    Ok(Some(chunk)) => {
                        // Check before extending so `buf` never grows past the cap even when a
                        // single chunk alone would exceed it.
                        if buf.len() + chunk.len() > MAX_CONFLUENCE_TEST_BODY_BYTES {
                            oversized = true;
                            break;
                        }
                        buf.extend_from_slice(&chunk);
                    }
                    Ok(None) => break,
                    Err(error) => {
                        return CmdResult::success(ConfluenceTestResult {
                            success: false,
                            message: format_confluence_request_error(&error, payload.ignore_ssl),
                            status_code: Some(status.as_u16()),
                        });
                    }
                }
            }

            if oversized {
                loop {
                    match response.chunk().await {
                        Ok(Some(_)) => {}
                        Ok(None) | Err(_) => break,
                    }
                }
                return CmdResult::success(ConfluenceTestResult {
                    success: false,
                    message: "响应体超出大小限制，已中止读取。".to_string(),
                    status_code: Some(status.as_u16()),
                });
            }

            let body = String::from_utf8_lossy(&buf).to_string();
            CmdResult::success(build_confluence_test_result(
                status,
                content_type.as_deref(),
                &body,
                &space_key,
            ))
        }
        Err(error) => CmdResult::success(ConfluenceTestResult {
            success: false,
            message: format_confluence_request_error(&error, payload.ignore_ssl),
            status_code: None,
        }),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePatConnectionPayload {
    pub base_url: String,
    #[serde(default)]
    pub username: Option<String>,
    pub api_token: Option<String>,
    pub ignore_ssl: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePatConnectionResult {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_user_display_name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceSpaceSummary {
    pub key: String,
    pub name: String,
    #[serde(rename = "type")]
    pub space_type: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePageNode {
    pub id: String,
    pub title: String,
}

const MAX_SPACE_SEARCH_PAGES: usize = 3;
const MAX_SPACE_SEARCH_RESULTS: usize = 50;
const SPACE_LIST_PAGE_LIMIT: usize = 100;

enum CappedBody {
    Ok {
        status: StatusCode,
        content_type: Option<String>,
        body: String,
    },
    Oversized {
        status: StatusCode,
    },
}

/// 读取响应体，超出 `MAX_CONFLUENCE_TEST_BODY_BYTES` 上限时中止缓冲并排空剩余数据。
/// 供本文件内 Space/页面树相关命令共用，不影响 `test_confluence_connection` 既有的内联实现。
async fn read_capped_confluence_body(
    mut response: reqwest::Response,
) -> Result<CappedBody, reqwest::Error> {
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let mut buf: Vec<u8> = Vec::new();
    loop {
        match response.chunk().await {
            Ok(Some(chunk)) => {
                if buf.len() + chunk.len() > MAX_CONFLUENCE_TEST_BODY_BYTES {
                    loop {
                        match response.chunk().await {
                            Ok(Some(_)) => {}
                            Ok(None) | Err(_) => break,
                        }
                    }
                    return Ok(CappedBody::Oversized { status });
                }
                buf.extend_from_slice(&chunk);
            }
            Ok(None) => break,
            Err(error) => return Err(error),
        }
    }

    Ok(CappedBody::Ok {
        status,
        content_type,
        body: String::from_utf8_lossy(&buf).to_string(),
    })
}

fn confluence_status_error_message(status: StatusCode) -> &'static str {
    match status {
        StatusCode::UNAUTHORIZED => {
            "连接失败：用户名、API Token 或 Personal Access Token (PAT) 不正确。"
        }
        StatusCode::FORBIDDEN => "连接失败：当前账号没有访问权限。",
        StatusCode::NOT_FOUND => "连接失败：未找到对应的资源。",
        _ => "连接失败：Confluence 返回了异常状态码。",
    }
}

fn build_confluence_client(ignore_ssl: bool) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(ignore_ssl)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|error| format!("{}: {}", config::ERR_CONFLUENCE_CLIENT_BUILD_FAILED, error))
}

/// 测试 PAT + Base URL 的连通性（不依赖具体 Space），用于两步式向导的第一步。
#[tauri::command]
pub async fn test_confluence_pat_connection(
    app_handle: tauri::AppHandle,
    payload: ConfluencePatConnectionPayload,
) -> CmdResult<ConfluencePatConnectionResult> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    test_confluence_pat_connection_impl(payload, &token_path).await
}

async fn test_confluence_pat_connection_impl(
    payload: ConfluencePatConnectionPayload,
    token_path: &Path,
) -> CmdResult<ConfluencePatConnectionResult> {
    let base_url = payload.base_url.trim().trim_end_matches('/').to_string();
    let username = payload.username.unwrap_or_default().trim().to_string();

    if base_url.is_empty() {
        return CmdResult::success(ConfluencePatConnectionResult {
            success: false,
            message: "请先填写 Confluence Base URL。".to_string(),
            status_code: None,
            current_user_display_name: None,
        });
    }
    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::success(ConfluencePatConnectionResult {
            success: false,
            message: "Confluence Base URL 格式无效，必须为 http:// 或 https:// 开头的合法地址。"
                .to_string(),
            status_code: None,
            current_user_display_name: None,
        });
    }

    let token = match resolve_connection_token(token_path, payload.api_token) {
        Ok(value) => value,
        Err(error) if error == config::ERR_CONFLUENCE_TOKEN_MISSING => {
            return CmdResult::success(ConfluencePatConnectionResult {
                success: false,
                message: "请先输入或保存 API Token / Personal Access Token (PAT)。".to_string(),
                status_code: None,
                current_user_display_name: None,
            })
        }
        Err(error) => return CmdResult::failure(error),
    };

    let client = match build_confluence_client(payload.ignore_ssl) {
        Ok(client) => client,
        Err(error) => return CmdResult::failure(error),
    };

    let url = format!("{}/rest/api/user/current", base_url);
    let response = send_confluence_get(
        &client,
        &url,
        &username,
        &token,
        None,
        Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
    )
    .await;

    match response {
        Ok(response) => match read_capped_confluence_body(response).await {
            Ok(CappedBody::Oversized { status }) => {
                CmdResult::success(ConfluencePatConnectionResult {
                    success: false,
                    message: "响应体超出大小限制，已中止读取。".to_string(),
                    status_code: Some(status.as_u16()),
                    current_user_display_name: None,
                })
            }
            Ok(CappedBody::Ok {
                status,
                content_type,
                body,
            }) => {
                if !status.is_success() {
                    return CmdResult::success(ConfluencePatConnectionResult {
                        success: false,
                        message: format!(
                            "{}（HTTP {}）",
                            confluence_status_error_message(status),
                            status.as_u16()
                        ),
                        status_code: Some(status.as_u16()),
                        current_user_display_name: None,
                    });
                }

                let content_type_incompatible = content_type
                    .as_deref()
                    .map(|v| !v.to_ascii_lowercase().contains("json"))
                    .unwrap_or(false);
                let parsed = serde_json::from_str::<serde_json::Value>(&body).ok();
                let display_name = parsed
                    .as_ref()
                    .and_then(|v| v.as_object())
                    .and_then(|obj| {
                        obj.get("displayName")
                            .or_else(|| obj.get("username"))
                            .and_then(serde_json::Value::as_str)
                    })
                    .map(str::to_string);

                if content_type_incompatible || parsed.is_none() {
                    return CmdResult::success(ConfluencePatConnectionResult {
                        success: false,
                        message: "响应内容不是有效的 Confluence 数据，可能被代理/SSO 拦截。"
                            .to_string(),
                        status_code: Some(status.as_u16()),
                        current_user_display_name: None,
                    });
                }

                CmdResult::success(ConfluencePatConnectionResult {
                    success: true,
                    message: "连接成功，PAT 有效。".to_string(),
                    status_code: Some(status.as_u16()),
                    current_user_display_name: display_name,
                })
            }
            Err(error) => CmdResult::success(ConfluencePatConnectionResult {
                success: false,
                message: format_confluence_request_error(&error, payload.ignore_ssl),
                status_code: None,
                current_user_display_name: None,
            }),
        },
        Err(error) => CmdResult::success(ConfluencePatConnectionResult {
            success: false,
            message: format_confluence_request_error(&error, payload.ignore_ssl),
            status_code: None,
            current_user_display_name: None,
        }),
    }
}

#[derive(Debug, Deserialize)]
struct ConfluenceSpaceListItem {
    key: String,
    #[serde(default)]
    name: String,
    #[serde(rename = "type", default)]
    space_type: String,
}

#[derive(Debug, Deserialize)]
struct ConfluenceSpaceListResponse {
    #[serde(default)]
    results: Vec<ConfluenceSpaceListItem>,
}

/// 按关键词搜索 Confluence Space：分页拉取全局 Space 列表后在客户端过滤，
/// 刻意不拼接 CQL 查询字符串，避免注入类风险并兼容 Server/DC 与 Cloud。
/// 已知局限：全局 Space 总数超过 `MAX_SPACE_SEARCH_PAGES` * `SPACE_LIST_PAGE_LIMIT` 时可能搜不全。
#[tauri::command]
pub async fn search_confluence_spaces(
    app_handle: tauri::AppHandle,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    keyword: String,
) -> CmdResult<Vec<ConfluenceSpaceSummary>> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    search_confluence_spaces_impl(&token_path, base_url, username, api_token, ignore_ssl, keyword)
        .await
}

async fn search_confluence_spaces_impl(
    token_path: &Path,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    keyword: String,
) -> CmdResult<Vec<ConfluenceSpaceSummary>> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let auth_username = username.unwrap_or_default().trim().to_string();
    let keyword = keyword.trim().to_lowercase();

    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_BASE_URL.to_string());
    }
    let token = match resolve_connection_token(token_path, api_token) {
        Ok(value) => value,
        Err(error) => return CmdResult::failure(error),
    };
    let client = match build_confluence_client(ignore_ssl) {
        Ok(client) => client,
        Err(error) => return CmdResult::failure(error),
    };

    let max_pages = if keyword.is_empty() {
        1
    } else {
        MAX_SPACE_SEARCH_PAGES
    };
    let mut matches: Vec<ConfluenceSpaceSummary> = Vec::new();

    for page in 0..max_pages {
        let start = (page * SPACE_LIST_PAGE_LIMIT).to_string();
        let limit = SPACE_LIST_PAGE_LIMIT.to_string();
        let url = format!("{}/rest/api/space", base_url);
        let response = send_confluence_get(
            &client,
            &url,
            &auth_username,
            &token,
            Some(&[
                ("type", "global"),
                ("start", start.as_str()),
                ("limit", limit.as_str()),
            ]),
            Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
        )
        .await;

        let response = match response {
            Ok(response) => response,
            Err(error) => {
                return CmdResult::failure(format!(
                    "{}: {}",
                    config::ERR_CONFLUENCE_SPACE_SEARCH_FAILED,
                    format_confluence_request_error(&error, ignore_ssl)
                ))
            }
        };

        let (status, body) = match read_capped_confluence_body(response).await {
            Ok(CappedBody::Ok { status, body, .. }) => (status, body),
            Ok(CappedBody::Oversized { status }) => {
                return CmdResult::failure(format!(
                    "{}: 响应体超出大小限制（HTTP {}）。",
                    config::ERR_CONFLUENCE_SPACE_SEARCH_FAILED,
                    status.as_u16()
                ))
            }
            Err(error) => {
                return CmdResult::failure(format!(
                    "{}: {}",
                    config::ERR_CONFLUENCE_SPACE_SEARCH_FAILED,
                    format_confluence_request_error(&error, ignore_ssl)
                ))
            }
        };

        if !status.is_success() {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_SPACE_SEARCH_FAILED,
                confluence_status_error_message(status)
            ));
        }

        let parsed: ConfluenceSpaceListResponse = match serde_json::from_str(&body) {
            Ok(value) => value,
            Err(error) => {
                return CmdResult::failure(format!(
                    "{}: 解析 Space 列表失败：{}",
                    config::ERR_CONFLUENCE_SPACE_SEARCH_FAILED,
                    error
                ))
            }
        };

        let page_len = parsed.results.len();
        for item in parsed.results {
            let key_lower = item.key.to_lowercase();
            let name_lower = item.name.to_lowercase();
            if keyword.is_empty() || key_lower.contains(&keyword) || name_lower.contains(&keyword)
            {
                matches.push(ConfluenceSpaceSummary {
                    key: item.key,
                    name: item.name,
                    space_type: item.space_type,
                });
                if matches.len() >= MAX_SPACE_SEARCH_RESULTS {
                    return CmdResult::success(matches);
                }
            }
        }

        if page_len < SPACE_LIST_PAGE_LIMIT {
            break;
        }
    }

    CmdResult::success(matches)
}

#[derive(Debug, Deserialize)]
struct ConfluenceCurrentUser {
    #[serde(default, rename = "accountId")]
    account_id: Option<String>,
    #[serde(default, rename = "userKey")]
    user_key: Option<String>,
    #[serde(default)]
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConfluenceSpaceDetail {
    key: String,
    #[serde(default)]
    name: String,
}

/// 解析当前已认证用户的个人空间：依次尝试 accountId（Cloud）/ userKey（Server/DC）/
/// username 作为个人空间候选 Key（`~{候选值}`），首个可访问的即返回。
#[tauri::command]
pub async fn get_confluence_personal_space(
    app_handle: tauri::AppHandle,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
) -> CmdResult<ConfluenceSpaceSummary> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    get_confluence_personal_space_impl(&token_path, base_url, username, api_token, ignore_ssl)
        .await
}

async fn get_confluence_personal_space_impl(
    token_path: &Path,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
) -> CmdResult<ConfluenceSpaceSummary> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let auth_username = username.unwrap_or_default().trim().to_string();

    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_BASE_URL.to_string());
    }
    let token = match resolve_connection_token(token_path, api_token) {
        Ok(value) => value,
        Err(error) => return CmdResult::failure(error),
    };
    let client = match build_confluence_client(ignore_ssl) {
        Ok(client) => client,
        Err(error) => return CmdResult::failure(error),
    };

    let current_user_url = format!("{}/rest/api/user/current", base_url);
    let response = send_confluence_get(
        &client,
        &current_user_url,
        &auth_username,
        &token,
        None,
        Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
    )
    .await;

    let body = match response {
        Ok(response) => match read_capped_confluence_body(response).await {
            Ok(CappedBody::Ok { status, body, .. }) if status.is_success() => body,
            Ok(CappedBody::Ok { status, .. }) => {
                return CmdResult::failure(format!(
                    "{}: 无法获取当前用户信息（HTTP {}）。",
                    config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND,
                    status.as_u16()
                ))
            }
            Ok(CappedBody::Oversized { .. }) => {
                return CmdResult::failure(format!(
                    "{}: 当前用户信息响应体超出大小限制。",
                    config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND
                ))
            }
            Err(error) => {
                return CmdResult::failure(format!(
                    "{}: {}",
                    config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND,
                    format_confluence_request_error(&error, ignore_ssl)
                ))
            }
        },
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND,
                format_confluence_request_error(&error, ignore_ssl)
            ))
        }
    };

    let current_user: ConfluenceCurrentUser = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(_) => {
            return CmdResult::failure(config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND.to_string())
        }
    };

    let mut candidates: Vec<String> = Vec::new();
    for candidate in [
        current_user.account_id,
        current_user.user_key,
        current_user.username,
    ]
    .into_iter()
    .flatten()
    {
        let trimmed = candidate.trim().to_string();
        if !trimmed.is_empty() && !candidates.contains(&trimmed) {
            candidates.push(trimmed);
        }
    }

    for candidate in candidates {
        let url = format!("{}/rest/api/space/~{}", base_url, candidate);
        let response = send_confluence_get(
            &client,
            &url,
            &auth_username,
            &token,
            None,
            Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
        )
        .await;

        let response = match response {
            Ok(response) => response,
            Err(_) => continue,
        };
        let candidate_body = match read_capped_confluence_body(response).await {
            Ok(CappedBody::Ok { status, body, .. }) if status.is_success() => body,
            _ => continue,
        };
        if let Ok(space) = serde_json::from_str::<ConfluenceSpaceDetail>(&candidate_body) {
            return CmdResult::success(ConfluenceSpaceSummary {
                key: space.key,
                name: space.name,
                space_type: "personal".to_string(),
            });
        }
    }

    CmdResult::failure(config::ERR_CONFLUENCE_PERSONAL_SPACE_NOT_FOUND.to_string())
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentWithAncestors {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    ancestors: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentListWithAncestors {
    #[serde(default)]
    results: Vec<ConfluenceContentWithAncestors>,
}

/// 拉取指定 Space 下的根级页面（`ancestors` 为空的页面），作为页面树的首层节点。
/// 已知局限：Space 内页面数超过分页上限（100）时可能漏掉部分根页面。
#[tauri::command]
pub async fn list_confluence_space_root_pages(
    app_handle: tauri::AppHandle,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    space_key: String,
) -> CmdResult<Vec<ConfluencePageNode>> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    list_confluence_space_root_pages_impl(
        &token_path,
        base_url,
        username,
        api_token,
        ignore_ssl,
        space_key,
    )
    .await
}

async fn list_confluence_space_root_pages_impl(
    token_path: &Path,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    space_key: String,
) -> CmdResult<Vec<ConfluencePageNode>> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let auth_username = username.unwrap_or_default().trim().to_string();
    let space_key = space_key.trim().to_string();

    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_BASE_URL.to_string());
    }
    if !config::is_valid_confluence_space_key(&space_key) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_SPACE_KEY.to_string());
    }
    let token = match resolve_connection_token(token_path, api_token) {
        Ok(value) => value,
        Err(error) => return CmdResult::failure(error),
    };
    let client = match build_confluence_client(ignore_ssl) {
        Ok(client) => client,
        Err(error) => return CmdResult::failure(error),
    };

    let url = format!("{}/rest/api/content", base_url);
    let response = send_confluence_get(
        &client,
        &url,
        &auth_username,
        &token,
        Some(&[
            ("spaceKey", space_key.as_str()),
            ("type", "page"),
            ("status", "current"),
            ("limit", "100"),
            ("expand", "ancestors"),
        ]),
        Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
    )
    .await;

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                format_confluence_request_error(&error, ignore_ssl)
            ))
        }
    };

    let (status, body) = match read_capped_confluence_body(response).await {
        Ok(CappedBody::Ok { status, body, .. }) => (status, body),
        Ok(CappedBody::Oversized { status }) => {
            return CmdResult::failure(format!(
                "{}: 响应体超出大小限制（HTTP {}）。",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                status.as_u16()
            ))
        }
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                format_confluence_request_error(&error, ignore_ssl)
            ))
        }
    };

    if !status.is_success() {
        return CmdResult::failure(format!(
            "{}: {}",
            config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
            confluence_status_error_message(status)
        ));
    }

    let parsed: ConfluenceContentListWithAncestors = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: 解析页面列表失败：{}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                error
            ))
        }
    };

    let root_pages = parsed
        .results
        .into_iter()
        .filter(|item| item.ancestors.is_empty())
        .map(|item| ConfluencePageNode {
            id: item.id,
            title: item.title,
        })
        .collect();

    CmdResult::success(root_pages)
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentBasic {
    id: String,
    #[serde(default)]
    title: String,
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentListBasic {
    #[serde(default)]
    results: Vec<ConfluenceContentBasic>,
}

/// 懒加载指定页面的直接子页面，用于展开页面树节点。
#[tauri::command]
pub async fn list_confluence_page_children(
    app_handle: tauri::AppHandle,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    page_id: String,
) -> CmdResult<Vec<ConfluencePageNode>> {
    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => return CmdResult::failure(error),
    };
    list_confluence_page_children_impl(&token_path, base_url, username, api_token, ignore_ssl, page_id)
        .await
}

async fn list_confluence_page_children_impl(
    token_path: &Path,
    base_url: String,
    username: Option<String>,
    api_token: Option<String>,
    ignore_ssl: bool,
    page_id: String,
) -> CmdResult<Vec<ConfluencePageNode>> {
    let base_url = base_url.trim().trim_end_matches('/').to_string();
    let auth_username = username.unwrap_or_default().trim().to_string();
    let page_id = page_id.trim().to_string();

    if !config::is_valid_confluence_base_url(&base_url) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_BASE_URL.to_string());
    }
    if !config::is_valid_confluence_parent_page_id(&page_id) {
        return CmdResult::failure(config::ERR_INVALID_CONFLUENCE_PARENT_PAGE_ID.to_string());
    }
    let token = match resolve_connection_token(token_path, api_token) {
        Ok(value) => value,
        Err(error) => return CmdResult::failure(error),
    };
    let client = match build_confluence_client(ignore_ssl) {
        Ok(client) => client,
        Err(error) => return CmdResult::failure(error),
    };

    let url = format!("{}/rest/api/content/{}/child/page", base_url, page_id);
    let response = send_confluence_get(
        &client,
        &url,
        &auth_username,
        &token,
        Some(&[("status", "current"), ("limit", "100")]),
        Some(&[(reqwest::header::ACCEPT.as_str(), "application/json")]),
    )
    .await;

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                format_confluence_request_error(&error, ignore_ssl)
            ))
        }
    };

    let (status, body) = match read_capped_confluence_body(response).await {
        Ok(CappedBody::Ok { status, body, .. }) => (status, body),
        Ok(CappedBody::Oversized { status }) => {
            return CmdResult::failure(format!(
                "{}: 响应体超出大小限制（HTTP {}）。",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                status.as_u16()
            ))
        }
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                format_confluence_request_error(&error, ignore_ssl)
            ))
        }
    };

    if !status.is_success() {
        return CmdResult::failure(format!(
            "{}: {}",
            config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
            confluence_status_error_message(status)
        ));
    }

    let parsed: ConfluenceContentListBasic = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(error) => {
            return CmdResult::failure(format!(
                "{}: 解析子页面列表失败：{}",
                config::ERR_CONFLUENCE_PAGE_TREE_FAILED,
                error
            ))
        }
    };

    let children = parsed
        .results
        .into_iter()
        .map(|item| ConfluencePageNode {
            id: item.id,
            title: item.title,
        })
        .collect();

    CmdResult::success(children)
}

/// 调起保存目录选择指令。
#[tauri::command]
pub fn select_save_dir() -> CmdResult<String> {
    CmdResult::success("/tmp/markdown-cat-test".to_string())
}

fn normalize_confluence_config(confluence: ConfluenceConfig) -> ConfluenceConfig {
    ConfluenceConfig {
        base_url: confluence.base_url.trim().trim_end_matches('/').to_string(),
        username: confluence.username.trim().to_string(),
        space_key: confluence.space_key.trim().to_string(),
        parent_page_id: confluence.parent_page_id.trim().to_string(),
        ignore_ssl: confluence.ignore_ssl,
    }
}

/// 从指定的本地 Token 文件解析可用的 Confluence API Token：优先使用请求内显式提供的 `api_token`
/// （非空），否则回退读取本地已保存的 Token 文件。
pub(crate) fn resolve_connection_token(
    token_path: &Path,
    api_token: Option<String>,
) -> Result<String, String> {
    if let Some(api_token) = api_token {
        let token = api_token.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }

    match config::read_confluence_token_file(token_path) {
        Ok(Some(token)) if !token.trim().is_empty() => Ok(token),
        Ok(_) => Err(config::ERR_CONFLUENCE_TOKEN_MISSING.to_string()),
        Err(error) => Err(error),
    }
}

fn build_confluence_test_result(
    status: StatusCode,
    content_type: Option<&str>,
    body: &str,
    requested_space_key: &str,
) -> ConfluenceTestResult {
    let status_code = Some(status.as_u16());
    if status.is_success() {
        // Case-insensitive comparison: Confluence space keys are conventionally uppercase and
        // some deployments/proxies may normalize casing on lookup, so requiring exact
        // case-sensitive equality could false-reject an otherwise valid connection. A
        // case-insensitive match on the literal requested key remains an extremely strong
        // signal — a generic unrelated error payload accidentally containing that exact
        // identifier (in any case) as its own `key` field is not a realistic false-positive risk.
        let key_matches = serde_json::from_str::<serde_json::Value>(body)
            .ok()
            .and_then(|v| v.as_object().cloned())
            .and_then(|obj| {
                obj.get("key")
                    .and_then(serde_json::Value::as_str)
                    .map(|s| s.eq_ignore_ascii_case(requested_space_key))
            })
            .unwrap_or(false);

        let content_type_incompatible = content_type
            .map(|v| !v.to_ascii_lowercase().contains("json"))
            .unwrap_or(false);

        if key_matches && !content_type_incompatible {
            return ConfluenceTestResult {
                success: true,
                message: "连接成功，已验证空间访问权限。".to_string(),
                status_code,
            };
        }
        return ConfluenceTestResult {
            success: false,
            message: "响应内容不是有效的 Confluence 数据，可能被代理/SSO 拦截。".to_string(),
            status_code,
        };
    }

    let message = match status {
        StatusCode::UNAUTHORIZED => "连接失败：用户名、API Token 或 Personal Access Token (PAT) 不正确。",
        StatusCode::FORBIDDEN => "连接失败：当前账号没有访问该 Space 的权限。",
        StatusCode::NOT_FOUND => "连接失败：未找到对应的 Space Key。",
        _ => "连接失败：Confluence 返回了异常状态码。",
    };

    ConfluenceTestResult {
        success: false,
        message: format!("{}（HTTP {}）", message, status.as_u16()),
        status_code,
    }
}

fn format_confluence_request_error(error: &reqwest::Error, ignore_ssl: bool) -> String {
    if error.is_timeout() {
        return format!("连接失败：请求超时。{}", ssl_hint(ignore_ssl));
    }
    if error.is_connect() {
        return format!(
            "连接失败：无法连接到 Confluence 服务器。{}",
            ssl_hint(ignore_ssl)
        );
    }

    let lower = error.to_string().to_lowercase();
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return format!(
            "连接失败：SSL 证书校验未通过。{}",
            if ignore_ssl {
                "当前已开启忽略 SSL 校验，请确认服务器证书链是否完整。"
            } else {
                "如为自签名证书，可尝试开启“忽略 SSL 校验”。"
            }
        );
    }

    format!("{}: {}", config::ERR_CONFLUENCE_REQUEST_FAILED, error)
}

fn ssl_hint(ignore_ssl: bool) -> &'static str {
    if ignore_ssl {
        "请检查地址、网络代理或服务端可用性。"
    } else {
        "如使用自签名证书，可尝试开启“忽略 SSL 校验”。"
    }
}

fn first_non_empty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        build_confluence_test_result, check_md2cf_installed, md2cf_timeout_message,
        run_command_with_timeout, CommandRunResult, TEST_TIMEOUT_KILL_DELAY_MS,
    };
    use reqwest::StatusCode;
    use serde_json::json;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    static PATH_MUTATION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    static RUN_COMMAND_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    struct TimeoutKillDelayGuard {
        _lock: std::sync::MutexGuard<'static, ()>,
    }

    impl TimeoutKillDelayGuard {
        fn new(delay: Duration) -> Self {
            let lock = RUN_COMMAND_TEST_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            TEST_TIMEOUT_KILL_DELAY_MS.store(delay.as_millis() as u64, Ordering::SeqCst);
            Self { _lock: lock }
        }
    }

    impl Drop for TimeoutKillDelayGuard {
        fn drop(&mut self) {
            TEST_TIMEOUT_KILL_DELAY_MS.store(0, Ordering::SeqCst);
        }
    }

    fn lock_run_command_tests() -> std::sync::MutexGuard<'static, ()> {
        RUN_COMMAND_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn unique_test_artifact_path(label: &str) -> PathBuf {
        let mut path = std::env::current_dir().expect("read current dir");
        path.push("target");
        path.push("config-command-tests");
        fs::create_dir_all(&path).expect("create test artifact dir");
        path.push(format!(
            "{label}-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("current time after unix epoch")
                .as_nanos()
        ));
        path
    }

    fn unique_test_artifact_dir(label: &str) -> PathBuf {
        let mut path = std::env::current_dir().expect("read current dir");
        path.push("target");
        path.push("config-command-tests");
        path.push(format!(
            "{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("current time after unix epoch")
                .as_nanos()
        ));
        path
    }

    /// Holds two locks for the guard's lifetime: `PATH_MUTATION_LOCK` serializes this guard's own
    /// `PATH` mutations against each other, and `RUN_COMMAND_TEST_LOCK` additionally serializes
    /// against every `run_command_with_timeout`-based test in this module (`check_md2cf_installed`
    /// itself calls `run_command_with_timeout`), so a `PATH`-mutating test can never overlap with
    /// e.g. a `TimeoutKillDelayGuard`-held test that also drives that shared code path.
    struct PathEnvGuard {
        _path_lock: std::sync::MutexGuard<'static, ()>,
        _run_command_lock: std::sync::MutexGuard<'static, ()>,
        original_path: Option<std::ffi::OsString>,
    }

    impl PathEnvGuard {
        fn prepend(dir: &Path) -> Self {
            let path_lock = PATH_MUTATION_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let run_command_lock = RUN_COMMAND_TEST_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let original_path = std::env::var_os("PATH");
            let mut paths = vec![dir.to_path_buf()];
            if let Some(existing) = &original_path {
                paths.extend(std::env::split_paths(existing));
            }
            let joined = std::env::join_paths(paths).expect("join PATH entries");
            std::env::set_var("PATH", joined);
            Self {
                _path_lock: path_lock,
                _run_command_lock: run_command_lock,
                original_path,
            }
        }

        fn replace(dir: &Path) -> Self {
            let path_lock = PATH_MUTATION_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let run_command_lock = RUN_COMMAND_TEST_LOCK
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let original_path = std::env::var_os("PATH");
            std::env::set_var("PATH", dir);
            Self {
                _path_lock: path_lock,
                _run_command_lock: run_command_lock,
                original_path,
            }
        }
    }

    impl Drop for PathEnvGuard {
        fn drop(&mut self) {
            if let Some(path) = &self.original_path {
                std::env::set_var("PATH", path);
            } else {
                std::env::remove_var("PATH");
            }
        }
    }

    fn write_fake_md2cf(dir: &Path, unix_body: &str, windows_body: &str) {
        fs::create_dir_all(dir).expect("create fake md2cf dir");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = windows_body;

            let script_path = dir.join("md2cf");
            fs::write(&script_path, format!("#!/bin/sh\n{unix_body}\n"))
                .expect("write fake md2cf script");
            let mut permissions = fs::metadata(&script_path)
                .expect("read fake md2cf metadata")
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&script_path, permissions).expect("chmod fake md2cf script");
        }
        #[cfg(windows)]
        {
            let _ = unix_body;
            let script_path = dir.join("md2cf.bat");
            fs::write(&script_path, format!("@echo off\r\n{windows_body}\r\n"))
                .expect("write fake md2cf batch file");
        }
    }

    // `#[track_caller]` makes an assertion failure here point at the calling test's line
    // instead of this helper's, keeping test failure output actionable.
    #[track_caller]
    fn unwrap_md2cf_check_result(
        result: crate::commands::CmdResult<super::Md2cfCheckResult>,
    ) -> super::Md2cfCheckResult {
        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        result.data.expect("expected md2cf check payload")
    }

    #[test]
    fn build_confluence_test_result_accepts_matching_key_json() {
        let body = json!({ "key": "TEAM" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(result.success);
        assert_eq!(result.status_code, Some(200));
    }

    #[test]
    fn build_confluence_test_result_accepts_matching_key_json_with_name() {
        let body = json!({ "key": "TEAM", "name": "Team Space" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(result.success);
    }

    #[test]
    fn build_confluence_test_result_accepts_case_insensitive_key_match() {
        let body = json!({ "key": "team" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(result.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_mismatched_key() {
        let body = json!({ "key": "OTHER", "name": "Other Space" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(!result.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_name_only_error_payload() {
        let body = json!({ "name": "No space found with key TEAM" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(!result.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_null_key() {
        let body = json!({ "key": serde_json::Value::Null, "name": "TEAM" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(!result.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_html_body() {
        let body = "<html><body>SSO</body></html>";
        let result = build_confluence_test_result(StatusCode::OK, Some("text/html"), body, "TEAM");

        assert!(!result.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_json_without_key() {
        let body = json!({ "id": 12345, "name": "Team Space" }).to_string();
        let result = build_confluence_test_result(
            StatusCode::OK,
            Some("application/json"),
            &body,
            "TEAM",
        );

        assert!(!result.success);
    }

    #[test]
    fn build_confluence_test_result_accepts_json_content_type_variants() {
        let body = json!({ "key": "TEAM" }).to_string();
        let hal_json = build_confluence_test_result(
            StatusCode::OK,
            Some("application/hal+json"),
            &body,
            "TEAM",
        );
        let missing_content_type = build_confluence_test_result(StatusCode::OK, None, &body, "TEAM");

        assert!(hal_json.success);
        assert!(missing_content_type.success);
    }

    #[test]
    fn build_confluence_test_result_rejects_non_json_content_type() {
        let body = json!({ "key": "TEAM" }).to_string();
        let result = build_confluence_test_result(StatusCode::OK, Some("text/html"), &body, "TEAM");

        assert!(!result.success);
    }

    #[cfg(unix)]
    fn fast_command() -> Command {
        Command::new("true")
    }

    #[cfg(windows)]
    fn fast_command() -> Command {
        let mut command = Command::new("cmd");
        command.args(["/C", "exit 0"]);
        command
    }

    #[cfg(unix)]
    fn slow_command() -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 2"]);
        command
    }

    #[cfg(windows)]
    fn slow_command() -> Command {
        let mut command = Command::new("cmd");
        command.args(["/C", "ping 127.0.0.1 -n 3 > nul"]);
        command
    }

    #[test]
    fn run_command_with_timeout_completes_for_fast_command() {
        let _guard = lock_run_command_tests();
        let result = run_command_with_timeout(fast_command(), Duration::from_millis(500))
            .expect("fast command should run");

        match result {
            CommandRunResult::Completed(output) => assert!(output.status.success()),
            CommandRunResult::TimedOut { .. } => panic!("fast command unexpectedly timed out"),
        }
    }

    #[test]
    fn run_command_with_timeout_times_out_for_slow_command() {
        let _guard = lock_run_command_tests();
        let result = run_command_with_timeout(slow_command(), Duration::from_millis(200))
            .expect("slow command should spawn");

        assert!(matches!(result, CommandRunResult::TimedOut { .. }));
    }

    #[cfg(unix)]
    fn chatty_command() -> Command {
        // Writes ~200 KiB to stdout — well past a typical OS pipe buffer (~64 KiB) — then exits
        // quickly. Without concurrently draining stdout, the child would block on the write,
        // `try_wait()` would never observe the exit, and this would always resolve as
        // `TimedOut` even though the process would complete almost instantly.
        let mut command = Command::new("sh");
        command.args(["-c", "yes | head -c 204800"]);
        command
    }

    #[cfg(windows)]
    fn chatty_command() -> Command {
        let mut command = Command::new("cmd");
        command.args(["/C", "for /L %i in (1,1,20000) do @echo AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]);
        command
    }

    #[test]
    fn run_command_with_timeout_drains_large_output_without_deadlocking() {
        let _guard = lock_run_command_tests();
        let result = run_command_with_timeout(chatty_command(), Duration::from_secs(3))
            .expect("chatty command should run and be drained, not deadlock");

        match result {
            CommandRunResult::Completed(output) => {
                assert!(output.status.success());
                assert!(!output.stdout.is_empty());
            }
            CommandRunResult::TimedOut { .. } => {
                panic!("chatty command incorrectly timed out — stdout was not drained concurrently")
            }
        }
    }

    #[test]
    fn check_md2cf_installed_reports_completed_for_fake_binary_success() {
        let fake_dir = unique_test_artifact_dir("md2cf-success");
        write_fake_md2cf(
            &fake_dir,
            "printf 'md2cf 9.9.9\\n'\nexit 0",
            "echo md2cf 9.9.9\r\nexit /b 0",
        );
        let _path_guard = PathEnvGuard::prepend(&fake_dir);

        let result = unwrap_md2cf_check_result(check_md2cf_installed());

        assert!(result.installed);
        assert_eq!(result.version, Some("md2cf 9.9.9".to_string()));
        assert!(result.message.contains("已检测到 md2cf"));
    }

    #[test]
    fn check_md2cf_installed_reports_timeout_for_slow_fake_binary() {
        // This test intentionally pays a real multi-second wall-clock cost because there is no
        // test seam to shorten the production `MD2CF_CHECK_TIMEOUT` constant. The sleep duration
        // is derived from that constant (rather than a second hardcoded number) so a future
        // change to the timeout can't silently desync the two and turn this into a flaky test.
        let overshoot_secs = super::MD2CF_CHECK_TIMEOUT.as_secs() + 1;
        let fake_dir = unique_test_artifact_dir("md2cf-timeout");
        write_fake_md2cf(
            &fake_dir,
            &format!("sleep {overshoot_secs}"),
            &format!("ping -n {} 127.0.0.1 >nul", overshoot_secs + 1),
        );
        let _path_guard = PathEnvGuard::prepend(&fake_dir);

        let result = unwrap_md2cf_check_result(check_md2cf_installed());

        assert!(!result.installed);
        assert_eq!(result.version, None);
        assert_eq!(result.message, md2cf_timeout_message(b"", b""));
    }

    #[test]
    fn check_md2cf_installed_reports_completed_for_fake_binary_failure() {
        // Covers the `Completed` branch's non-zero-exit sub-case (installed but broken), which
        // complements the success sub-case above and rounds out end-to-end coverage of every
        // outcome `check_md2cf_installed` maps for a `Completed` process.
        let fake_dir = unique_test_artifact_dir("md2cf-broken");
        write_fake_md2cf(&fake_dir, "exit 1", "exit /b 1");
        let _path_guard = PathEnvGuard::prepend(&fake_dir);

        let result = unwrap_md2cf_check_result(check_md2cf_installed());

        assert!(!result.installed);
        assert!(result.message.contains("可能安装损坏"));
    }

    #[test]
    fn check_md2cf_installed_reports_not_found_when_absent_from_path() {
        let empty_dir = unique_test_artifact_dir("md2cf-missing");
        fs::create_dir_all(&empty_dir).expect("create empty PATH dir");
        let _path_guard = PathEnvGuard::replace(&empty_dir);

        let result = unwrap_md2cf_check_result(check_md2cf_installed());

        assert!(!result.installed);
        assert_eq!(result.version, None);
        assert_eq!(result.message, "未检测到 md2cf，将使用 REST API 直连模式。");
    }

    #[cfg(unix)]
    #[test]
    fn run_command_with_timeout_kills_whole_process_group() {
        let _guard = lock_run_command_tests();
        let side_effect_path = unique_test_artifact_path("grandchild-survived");
        let _ = fs::remove_file(&side_effect_path);

        let mut command = Command::new("sh");
        command
            .env("SURVIVE_PATH", &side_effect_path)
            .args(["-c", "(sleep 1; echo survived > \"$SURVIVE_PATH\") & sleep 5"]);

        let result = run_command_with_timeout(command, Duration::from_millis(200))
            .expect("wrapper command should spawn");

        assert!(matches!(result, CommandRunResult::TimedOut { .. }));
        std::thread::sleep(Duration::from_millis(1300));
        assert!(
            !side_effect_path.exists(),
            "grandchild survived timeout and wrote {:?}",
            side_effect_path
        );
    }

    #[cfg(unix)]
    #[test]
    fn run_command_with_timeout_preserves_partial_stdout_on_timeout() {
        let _guard = lock_run_command_tests();
        let mut command = Command::new("sh");
        command.args(["-c", "printf partial-output; sleep 2"]);

        let result = run_command_with_timeout(command, Duration::from_millis(200))
            .expect("command should spawn");

        match result {
            CommandRunResult::TimedOut { stdout, stderr } => {
                assert_eq!(String::from_utf8_lossy(&stdout), "partial-output");
                assert!(stderr.is_empty());
            }
            CommandRunResult::Completed(output) => {
                panic!("command unexpectedly completed with status {}", output.status)
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn run_command_with_timeout_reports_completed_when_kill_races_natural_exit() {
        let _delay_guard = TimeoutKillDelayGuard::new(Duration::from_millis(120));
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 0.15"]);

        let result = run_command_with_timeout(command, Duration::from_millis(100))
            .expect("race command should spawn");

        match result {
            CommandRunResult::Completed(output) => assert!(output.status.success()),
            CommandRunResult::TimedOut { .. } => {
                panic!("race-to-exit command should resolve as completed")
            }
        }
    }

    #[test]
    fn md2cf_timeout_message_changes_when_partial_output_exists() {
        assert_eq!(
            md2cf_timeout_message(b"", b""),
            "检测 md2cf 超时，将使用 REST API 直连模式。"
        );
        assert_ne!(
            md2cf_timeout_message(b"md2cf 1.0.0", b""),
            "检测 md2cf 超时，将使用 REST API 直连模式。"
        );
    }
}

#[cfg(test)]
mod backend_integration_tests {
    use super::{
        get_confluence_personal_space_impl, list_confluence_page_children_impl,
        list_confluence_space_root_pages_impl, search_confluence_spaces_impl,
        test_confluence_connection_impl, test_confluence_pat_connection_impl,
        ConfluenceConnectionPayload, ConfluencePatConnectionPayload, ConfluenceTestResult,
        MAX_CONFLUENCE_TEST_BODY_BYTES,
    };
    use crate::commands::CmdResult;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::thread::JoinHandle;
    use std::time::Duration;

    // None of these tests exercise the "no apiToken provided, fall back to the saved token file"
    // branch (every payload/call below supplies an explicit token), so this path never needs to
    // exist on disk — it only has to be a valid, well-formed path for `resolve_connection_token`
    // to attempt (and fail) to read.
    fn dummy_token_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "markdown-cat-test-token-placeholder-{}.dat",
            std::process::id()
        ))
    }

    // `std::env::set_var` mutates process-global state, and `NO_PROXY`/`no_proxy` are read by
    // every `reqwest::Client` built during a test run. Rust's default test harness runs `#[test]`
    // / `#[tokio::test]` functions concurrently on multiple threads within the same process, so
    // without serialization two proxy-mutating tests racing each other could transiently unset
    // the exemption for one another. All tests in this module that touch the network (and thus
    // call `allow_local_mock_server_without_proxy`) acquire this lock for their duration to make
    // that mutation effectively single-threaded.
    static ENV_MUTATION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    /// Holds the global env-mutation lock for the duration of the guard's lifetime and sets the
    /// `NO_PROXY`/`no_proxy` exemption. Verified necessary in sandboxes/CI runners that configure
    /// a system-wide HTTP(S) proxy: without this exemption, `reqwest::Client` (built exactly as
    /// production code builds it, without `.no_proxy()`) routes requests to the loopback mock
    /// server through that proxy, which either hangs or returns a gateway error instead of
    /// reaching `127.0.0.1`.
    struct ProxyExemptionGuard<'a> {
        _lock: std::sync::MutexGuard<'a, ()>,
    }

    fn allow_local_mock_server_without_proxy() -> ProxyExemptionGuard<'static> {
        let lock = ENV_MUTATION_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
        std::env::set_var("no_proxy", "127.0.0.1,localhost");
        ProxyExemptionGuard { _lock: lock }
    }

    fn http_response(status_line: &str, content_type: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status_line}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    /// Reads until the end of the HTTP request headers (`\r\n\r\n`) or the buffer/timeout is
    /// exhausted, rather than assuming a single `read()` call returns the whole request. The
    /// requests this module sends are always small enough to arrive in one TCP segment in
    /// practice, but looping here removes that assumption instead of relying on it silently.
    fn read_request_headers(stream: &mut std::net::TcpStream) -> Vec<u8> {
        let mut buf = Vec::with_capacity(4096);
        let mut chunk = [0u8; 4096];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    buf.extend_from_slice(&chunk[..n]);
                    if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() >= 64 * 1024 {
                        break;
                    }
                }
                // A timeout (see `set_read_timeout` below) or other I/O error ends the read loop
                // with whatever was captured so far, rather than blocking indefinitely.
                Err(_) => break,
            }
        }
        buf
    }

    /// Spawns a one-shot mock HTTP server bound to an ephemeral loopback port. Both `accept()`
    /// and the subsequent `read()` are bounded by `set_read_timeout`/a connect-timeout style
    /// retry loop so a misbehaving client (or a bug in this test) fails the test with a clear
    /// panic instead of hanging the whole `cargo test` process indefinitely.
    fn spawn_single_response_server(response_bytes: Vec<u8>) -> (String, JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        listener
            .set_nonblocking(true)
            .expect("set mock server non-blocking");
        let addr = listener.local_addr().expect("read mock server addr");
        let handle = std::thread::spawn(move || {
            const ACCEPT_TIMEOUT: Duration = Duration::from_secs(5);
            let deadline = std::time::Instant::now() + ACCEPT_TIMEOUT;
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() >= deadline {
                            panic!("mock server timed out waiting for a client connection");
                        }
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("failed to accept mock connection: {error}"),
                }
            };
            stream
                .set_nonblocking(false)
                .expect("clear mock connection non-blocking flag");
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("set mock connection read timeout");
            let request = read_request_headers(&mut stream);
            stream
                .write_all(&response_bytes)
                .expect("write mock response");
            stream.flush().expect("flush mock response");
            request
        });
        (format!("http://{}", addr), handle)
    }

    /// Like `spawn_single_response_server`, but accepts one connection per entry in
    /// `responses` (in order) and returns each request's raw bytes in the same order —
    /// needed for tests where a single command issues several sequential HTTP requests
    /// (e.g. personal-space candidate fallback).
    fn spawn_sequential_response_server(
        responses: Vec<Vec<u8>>,
    ) -> (String, JoinHandle<Vec<Vec<u8>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        listener
            .set_nonblocking(true)
            .expect("set mock server non-blocking");
        let addr = listener.local_addr().expect("read mock server addr");
        let handle = std::thread::spawn(move || {
            const ACCEPT_TIMEOUT: Duration = Duration::from_secs(5);
            let mut requests = Vec::with_capacity(responses.len());
            for response_bytes in responses {
                let deadline = std::time::Instant::now() + ACCEPT_TIMEOUT;
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            if std::time::Instant::now() >= deadline {
                                panic!("mock server timed out waiting for a client connection");
                            }
                            std::thread::sleep(Duration::from_millis(10));
                        }
                        Err(error) => panic!("failed to accept mock connection: {error}"),
                    }
                };
                stream
                    .set_nonblocking(false)
                    .expect("clear mock connection non-blocking flag");
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("set mock connection read timeout");
                let request = read_request_headers(&mut stream);
                stream
                    .write_all(&response_bytes)
                    .expect("write mock response");
                stream.flush().expect("flush mock response");
                requests.push(request);
            }
            requests
        });
        (format!("http://{}", addr), handle)
    }

    fn write_http_chunk(stream: &mut std::net::TcpStream, bytes: &[u8]) {
        write!(stream, "{:X}\r\n", bytes.len()).expect("write mock chunk size");
        stream.write_all(bytes).expect("write mock chunk body");
        stream.write_all(b"\r\n").expect("write mock chunk trailer");
        stream.flush().expect("flush mock chunk");
    }

    fn spawn_oversized_chunked_response_server(
        tail_delay: Duration,
    ) -> (String, JoinHandle<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        listener
            .set_nonblocking(true)
            .expect("set mock server non-blocking");
        let addr = listener.local_addr().expect("read mock server addr");
        let handle = std::thread::spawn(move || {
            const ACCEPT_TIMEOUT: Duration = Duration::from_secs(5);
            let deadline = std::time::Instant::now() + ACCEPT_TIMEOUT;
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        if std::time::Instant::now() >= deadline {
                            panic!("mock server timed out waiting for a client connection");
                        }
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    Err(error) => panic!("failed to accept mock connection: {error}"),
                }
            };
            stream
                .set_nonblocking(false)
                .expect("clear mock connection non-blocking flag");
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("set mock connection read timeout");
            let request = read_request_headers(&mut stream);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n",
                )
                .expect("write mock response headers");
            write_http_chunk(&mut stream, &vec![b'a'; MAX_CONFLUENCE_TEST_BODY_BYTES]);
            write_http_chunk(&mut stream, b"b");
            std::thread::sleep(tail_delay);
            write_http_chunk(&mut stream, b"tail-data");
            stream
                .write_all(b"0\r\n\r\n")
                .expect("write mock chunked response terminator");
            stream.flush().expect("flush mock response");
            request
        });
        (format!("http://{}", addr), handle)
    }

    fn payload_for(base_url: String) -> ConfluenceConnectionPayload {
        ConfluenceConnectionPayload {
            base_url,
            username: "user@example.com".to_string(),
            api_token: Some("token-123".to_string()),
            space_key: "TEAM".to_string(),
            ignore_ssl: false,
        }
    }

    fn unwrap_test_result(result: CmdResult<ConfluenceTestResult>) -> ConfluenceTestResult {
        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        result.data.expect("expected confluence test payload")
    }

    #[tokio::test]
    async fn test_confluence_connection_succeeds_for_matching_space_response() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"key":"TEAM","name":"Team Space"}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let request = String::from_utf8(handle.join().expect("join mock server"))
            .expect("mock request should be valid utf-8")
            .to_ascii_lowercase();

        assert!(result.success);
        assert_eq!(result.status_code, Some(200));
        assert!(request.starts_with("get /rest/api/space/team http/1.1\r\n"));
        assert!(
            request.contains("authorization: basic "),
            "request should include basic auth"
        );
        assert!(
            request.contains("accept: application/json"),
            "request should ask for json"
        );
    }

    #[tokio::test]
    async fn test_confluence_connection_uses_bearer_auth_when_username_is_empty() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"key":"TEAM","name":"Team Space"}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let mut payload = payload_for(base_url);
        payload.username = "".to_string();
        let result = unwrap_test_result(test_confluence_connection_impl(payload, &dummy_token_path()).await);
        let request = String::from_utf8(handle.join().expect("join mock server"))
            .expect("mock request should be valid utf-8")
            .to_ascii_lowercase();

        assert!(result.success);
        assert_eq!(result.status_code, Some(200));
        assert!(
            request.contains("authorization: bearer token-123"),
            "request should use bearer auth when username is empty"
        );
    }

    #[tokio::test]
    async fn test_confluence_connection_reports_unauthorized_status() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let (base_url, handle) = spawn_single_response_server(http_response(
            "401 Unauthorized",
            "application/json",
            r#"{"message":"unauthorized"}"#,
        ));

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let _ = handle.join().expect("join mock server");

        assert!(!result.success);
        assert_eq!(result.status_code, Some(401));
        assert!(result.message.contains("用户名、API Token 或 Personal Access Token (PAT) 不正确"));
    }

    #[tokio::test]
    async fn test_confluence_connection_reports_forbidden_status() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let (base_url, handle) = spawn_single_response_server(http_response(
            "403 Forbidden",
            "application/json",
            r#"{"message":"forbidden"}"#,
        ));

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let _ = handle.join().expect("join mock server");

        assert!(!result.success);
        assert_eq!(result.status_code, Some(403));
        assert!(result.message.contains("没有访问该 Space 的权限"));
    }

    #[tokio::test]
    async fn test_confluence_connection_reports_not_found_status() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let (base_url, handle) = spawn_single_response_server(http_response(
            "404 Not Found",
            "application/json",
            r#"{"message":"missing"}"#,
        ));

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let _ = handle.join().expect("join mock server");

        assert!(!result.success);
        assert_eq!(result.status_code, Some(404));
        assert!(result.message.contains("未找到对应的 Space Key"));
    }

    #[tokio::test]
    async fn test_confluence_connection_rejects_html_false_success_response() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let (base_url, handle) = spawn_single_response_server(http_response(
            "200 OK",
            "text/html; charset=utf-8",
            "<html><body>SSO login</body></html>",
        ));

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let _ = handle.join().expect("join mock server");

        assert!(!result.success);
        assert_eq!(result.status_code, Some(200));
        assert!(result
            .message
            .contains("响应内容不是有效的 Confluence 数据"));
    }

    #[tokio::test]
    async fn test_confluence_connection_drains_oversized_response_before_returning() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let tail_delay = Duration::from_millis(250);
        let (base_url, handle) = spawn_oversized_chunked_response_server(tail_delay);
        let start = std::time::Instant::now();

        let result = unwrap_test_result(test_confluence_connection_impl(payload_for(base_url), &dummy_token_path()).await);
        let elapsed = start.elapsed();
        let _ = handle.join().expect("join mock server");

        assert!(!result.success);
        assert_eq!(result.status_code, Some(200));
        assert_eq!(result.message, "响应体超出大小限制，已中止读取。");
        assert!(
            elapsed >= tail_delay,
            "oversized response returned before the delayed tail could be drained: {:?} < {:?}",
            elapsed,
            tail_delay
        );
    }

    fn pat_payload_for(base_url: String) -> ConfluencePatConnectionPayload {
        ConfluencePatConnectionPayload {
            base_url,
            username: None,
            api_token: Some("token-123".to_string()),
            ignore_ssl: false,
        }
    }

    #[tokio::test]
    async fn test_confluence_pat_connection_succeeds_and_reports_display_name() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"displayName":"Alice Doe","accountId":"acc-1"}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result = test_confluence_pat_connection_impl(pat_payload_for(base_url), &dummy_token_path()).await;
        let request = String::from_utf8(handle.join().expect("join mock server"))
            .expect("mock request should be valid utf-8")
            .to_ascii_lowercase();

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        let data = result.data.expect("expected pat connection result");
        assert!(data.success);
        assert_eq!(data.current_user_display_name, Some("Alice Doe".to_string()));
        assert!(request.starts_with("get /rest/api/user/current http/1.1\r\n"));
        assert!(
            request.contains("authorization: bearer token-123"),
            "request should use bearer auth when username is empty"
        );
    }

    #[tokio::test]
    async fn test_confluence_pat_connection_reports_failure_on_unauthorized() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let (base_url, handle) = spawn_single_response_server(http_response(
            "401 Unauthorized",
            "application/json",
            r#"{"message":"Unauthorized"}"#,
        ));

        let result = test_confluence_pat_connection_impl(pat_payload_for(base_url), &dummy_token_path()).await;
        let _ = handle.join().expect("join mock server");

        let data = result.data.expect("expected pat connection result");
        assert!(!data.success);
        assert_eq!(data.status_code, Some(401));
    }

    #[tokio::test]
    async fn search_confluence_spaces_filters_by_keyword_case_insensitively() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"results":[
            {"key":"TEAM","name":"Team Space","type":"global"},
            {"key":"DOCS","name":"Documentation Hub","type":"global"}
        ]}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result =
            search_confluence_spaces_impl(&dummy_token_path(), base_url, None, Some("token-123".to_string()), false, "doc".to_string())
                .await;
        let _ = handle.join().expect("join mock server");

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        let spaces = result.data.expect("expected space list");
        assert_eq!(spaces.len(), 1);
        assert_eq!(spaces[0].key, "DOCS");
    }

    #[tokio::test]
    async fn search_confluence_spaces_returns_first_page_unfiltered_when_keyword_empty() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"results":[
            {"key":"TEAM","name":"Team Space","type":"global"},
            {"key":"DOCS","name":"Documentation Hub","type":"global"}
        ]}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result =
            search_confluence_spaces_impl(&dummy_token_path(), base_url, None, Some("token-123".to_string()), false, "".to_string())
                .await;
        let _ = handle.join().expect("join mock server");

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        assert_eq!(result.data.expect("expected space list").len(), 2);
    }

    #[tokio::test]
    async fn get_confluence_personal_space_falls_back_through_candidates() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let current_user_body =
            r#"{"accountId":"acc-1","userKey":"key-1","username":"jdoe"}"#;
        let (base_url, handle) = spawn_sequential_response_server(vec![
            http_response("200 OK", "application/json", current_user_body),
            http_response("404 Not Found", "application/json", r#"{"message":"nope"}"#),
            http_response(
                "200 OK",
                "application/json",
                r#"{"key":"~key-1","name":"Jdoe Personal Space"}"#,
            ),
        ]);

        let result =
            get_confluence_personal_space_impl(&dummy_token_path(), base_url, None, Some("token-123".to_string()), false)
                .await;
        let requests = handle.join().expect("join mock server");

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        let space = result.data.expect("expected personal space");
        assert_eq!(space.key, "~key-1");
        assert_eq!(space.space_type, "personal");

        let second_request = String::from_utf8_lossy(&requests[1]).to_ascii_lowercase();
        let third_request = String::from_utf8_lossy(&requests[2]).to_ascii_lowercase();
        assert!(second_request.starts_with("get /rest/api/space/~acc-1 "));
        assert!(third_request.starts_with("get /rest/api/space/~key-1 "));
    }

    #[tokio::test]
    async fn list_confluence_space_root_pages_filters_pages_with_ancestors() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"results":[
            {"id":"1","title":"Root A","ancestors":[]},
            {"id":"2","title":"Child B","ancestors":[{"id":"1"}]}
        ]}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result = list_confluence_space_root_pages_impl(
            &dummy_token_path(),
            base_url,
            None,
            Some("token-123".to_string()),
            false,
            "TEAM".to_string(),
        )
        .await;
        let _ = handle.join().expect("join mock server");

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        let pages = result.data.expect("expected root page list");
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, "1");
        assert_eq!(pages[0].title, "Root A");
    }

    #[tokio::test]
    async fn list_confluence_space_root_pages_rejects_invalid_space_key() {
        let result = list_confluence_space_root_pages_impl(
            &dummy_token_path(),
            "https://example.atlassian.net/wiki".to_string(),
            None,
            Some("token-123".to_string()),
            false,
            "not a key!".to_string(),
        )
        .await;

        assert!(!result.ok);
        assert_eq!(
            result.error.as_deref(),
            Some(crate::config::ERR_INVALID_CONFLUENCE_SPACE_KEY)
        );
    }

    #[tokio::test]
    async fn list_confluence_page_children_returns_mapped_nodes() {
        let _proxy_guard = allow_local_mock_server_without_proxy();
        let body = r#"{"results":[
            {"id":"10","title":"Child One"},
            {"id":"11","title":"Child Two"}
        ]}"#;
        let (base_url, handle) =
            spawn_single_response_server(http_response("200 OK", "application/json", body));

        let result = list_confluence_page_children_impl(
            &dummy_token_path(),
            base_url,
            None,
            Some("token-123".to_string()),
            false,
            "1".to_string(),
        )
        .await;
        let _ = handle.join().expect("join mock server");

        assert!(result.ok, "command unexpectedly failed: {:?}", result.error);
        assert_eq!(result.data.expect("expected children list").len(), 2);
    }

    #[tokio::test]
    async fn list_confluence_page_children_rejects_invalid_page_id() {
        let result = list_confluence_page_children_impl(
            &dummy_token_path(),
            "https://example.atlassian.net/wiki".to_string(),
            None,
            Some("token-123".to_string()),
            false,
            "not-numeric".to_string(),
        )
        .await;

        assert!(!result.ok);
        assert_eq!(
            result.error.as_deref(),
            Some(crate::config::ERR_INVALID_CONFLUENCE_PARENT_PAGE_ID)
        );
    }
}
