use crate::commands::CmdResult;
use crate::config::{self, AppConfig, ConfluenceConfig};
use keyring::{Entry, Error as KeyringError};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use std::process::Command;

const CONFLUENCE_TOKEN_SERVICE: &str = "markdown-cat-confluence";
const CONFLUENCE_TOKEN_ACCOUNT: &str = "confluence-api-token";

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

/// 检测当前系统是否已保存 Confluence API Token。
#[tauri::command]
pub fn get_confluence_token_status() -> CmdResult<ConfluenceTokenStatus> {
    match read_saved_confluence_token() {
        Ok(token) => CmdResult::success(ConfluenceTokenStatus {
            has_token: !token.trim().is_empty(),
        }),
        Err(TokenReadState::Missing) => {
            CmdResult::success(ConfluenceTokenStatus { has_token: false })
        }
        Err(TokenReadState::Failed(error)) => CmdResult::failure(error),
    }
}

/// 将 Confluence API Token 写入系统安全凭据存储。
#[tauri::command]
pub fn set_confluence_token(api_token: String) -> CmdResult<()> {
    let token = api_token.trim().to_string();
    if token.is_empty() {
        return CmdResult::failure(config::ERR_CONFLUENCE_TOKEN_MISSING.to_string());
    }

    match token_entry() {
        Ok(entry) => match entry.set_password(&token) {
            Ok(_) => CmdResult::ok(),
            Err(error) => CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_TOKEN_WRITE_FAILED,
                error
            )),
        },
        Err(error) => CmdResult::failure(error),
    }
}

/// 清除已保存的 Confluence API Token。
#[tauri::command]
pub fn clear_confluence_token() -> CmdResult<()> {
    match token_entry() {
        Ok(entry) => match entry.delete_credential() {
            Ok(_) => CmdResult::ok(),
            Err(error) if is_missing_entry_error(&error) => CmdResult::ok(),
            Err(error) => CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_TOKEN_DELETE_FAILED,
                error
            )),
        },
        Err(error) => CmdResult::failure(error),
    }
}

/// 检测 md2cf 命令行工具是否可用。
#[tauri::command]
pub fn check_md2cf_installed() -> CmdResult<Md2cfCheckResult> {
    match Command::new("md2cf").arg("--version").output() {
        Ok(output) => {
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
    payload: ConfluenceConnectionPayload,
) -> CmdResult<ConfluenceTestResult> {
    let base_url = payload.base_url.trim().trim_end_matches('/').to_string();
    let username = payload.username.trim().to_string();
    let space_key = payload.space_key.trim().to_string();

    if base_url.is_empty() || username.is_empty() || space_key.is_empty() {
        return CmdResult::success(ConfluenceTestResult {
            success: false,
            message: "请先填写 Confluence 地址、用户名和 Space Key。".to_string(),
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

    let token = match resolve_connection_token(payload.api_token) {
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

    let response = client
        .get(&url)
        .basic_auth(username, Some(token))
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await;

    match response {
        Ok(response) => CmdResult::success(build_confluence_test_result(response.status())),
        Err(error) => CmdResult::success(ConfluenceTestResult {
            success: false,
            message: format_confluence_request_error(&error, payload.ignore_ssl),
            status_code: None,
        }),
    }
}

/// 调起保存目录选择指令。
#[tauri::command]
pub fn select_save_dir() -> CmdResult<String> {
    CmdResult::success("/tmp/markdown-cat-test".to_string())
}

fn normalize_confluence_config(confluence: ConfluenceConfig) -> ConfluenceConfig {
    ConfluenceConfig {
        base_url: confluence.base_url.trim().to_string(),
        username: confluence.username.trim().to_string(),
        space_key: confluence.space_key.trim().to_string(),
        parent_page_id: confluence.parent_page_id.trim().to_string(),
        ignore_ssl: confluence.ignore_ssl,
    }
}

fn token_entry() -> Result<Entry, String> {
    Entry::new(CONFLUENCE_TOKEN_SERVICE, CONFLUENCE_TOKEN_ACCOUNT)
        .map_err(|error| format!("{}: {}", config::ERR_CONFLUENCE_TOKEN_ENTRY_FAILED, error))
}

enum TokenReadState {
    Missing,
    Failed(String),
}

fn read_saved_confluence_token() -> Result<String, TokenReadState> {
    let entry = token_entry().map_err(TokenReadState::Failed)?;
    match entry.get_password() {
        Ok(token) => Ok(token),
        Err(error) if is_missing_entry_error(&error) => Err(TokenReadState::Missing),
        Err(error) => Err(TokenReadState::Failed(format!(
            "{}: {}",
            config::ERR_CONFLUENCE_TOKEN_READ_FAILED,
            error
        ))),
    }
}

pub(crate) fn resolve_connection_token(api_token: Option<String>) -> Result<String, String> {
    if let Some(api_token) = api_token {
        let token = api_token.trim().to_string();
        if !token.is_empty() {
            return Ok(token);
        }
    }

    match read_saved_confluence_token() {
        Ok(token) if !token.trim().is_empty() => Ok(token),
        Ok(_) | Err(TokenReadState::Missing) => {
            Err(config::ERR_CONFLUENCE_TOKEN_MISSING.to_string())
        }
        Err(TokenReadState::Failed(error)) => Err(error),
    }
}

fn build_confluence_test_result(status: StatusCode) -> ConfluenceTestResult {
    let status_code = Some(status.as_u16());
    if status.is_success() {
        return ConfluenceTestResult {
            success: true,
            message: "连接成功，已验证空间访问权限。".to_string(),
            status_code,
        };
    }

    let message = match status {
        StatusCode::UNAUTHORIZED => "连接失败：用户名或 API Token 不正确。",
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

fn is_missing_entry_error(error: &KeyringError) -> bool {
    matches!(error, KeyringError::NoEntry)
        || error.to_string().to_ascii_lowercase().contains("no entry")
}

fn first_non_empty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}
