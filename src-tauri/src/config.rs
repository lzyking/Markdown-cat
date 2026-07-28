use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 错误码常量，用于统一返回结构中的 error 字段，避免硬编码自然语言。
pub const ERR_APP_DIR_NOT_WRITABLE: &str = "ERR_APP_DIR_NOT_WRITABLE";
pub const ERR_CONFIG_WRITE_FAILED: &str = "ERR_CONFIG_WRITE_FAILED";
pub const ERR_CONFIG_READ_FAILED: &str = "ERR_CONFIG_READ_FAILED";

const CONFIG_FILE_NAME: &str = "config.json";
const FALLBACK_DIR_NAME: &str = "My Markdown";

/// 应用配置结构。
/// 新增未知字段默认忽略，以保证向后兼容。
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AppConfig {
    /// 默认保存路径，null 表示使用系统默认规则。
    #[serde(rename = "savePath")]
    pub save_path: Option<String>,
    /// 上次打开的文件完整路径，null 表示无。
    #[serde(rename = "lastOpenedFile")]
    pub last_opened_file: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            save_path: None,
            last_opened_file: None,
        }
    }
}

impl AppConfig {
    /// 使用指定保存路径构造配置。
    pub fn with_save_path(save_path: String) -> Self {
        Self {
            save_path: Some(save_path),
            last_opened_file: None,
        }
    }
}

/// 检测目录是否可写：不存在则尝试创建，然后使用系统临时目录验证。
/// 通过 tempfile crate 在目标目录创建临时文件，验证后自动清理，避免在应用目录中残留 `.write_test` 文件。
pub fn is_dir_writable(dir: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dir)?;

    let temp_file = tempfile::NamedTempFile::new_in(dir)?;
    temp_file.close()?;
    Ok(())
}

/// 解析并返回应用可写目录。
///
/// 优先使用用户文档目录下的 My Markdown 子目录 (~/Documents/My Markdown)；
/// 若该目录不可用，尝试使用 Tauri 提供的 app_data_dir；
/// 若两者均不可用，返回错误码 ERR_APP_DIR_NOT_WRITABLE。
pub fn resolve_writable_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(documents_dir) = app_handle.path().document_dir() {
        let my_markdown_dir = documents_dir.join(FALLBACK_DIR_NAME);
        if is_dir_writable(&my_markdown_dir).is_ok() {
            return Ok(my_markdown_dir);
        }
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("{}: {}", ERR_APP_DIR_NOT_WRITABLE, e))?;

    if is_dir_writable(&app_data_dir).is_ok() {
        return Ok(app_data_dir);
    }

    Err(ERR_APP_DIR_NOT_WRITABLE.to_string())
}

/// 解析并返回保存文件的最终有效目录。
/// 优先使用 config.json 中读取到的自定义 save_path（需验证可写）；
/// 若未配置 save_path 或配置路径不可写，则回退使用 resolve_writable_dir 默认规则。
pub fn resolve_save_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = resolve_writable_dir(app_handle) {
        let config_path = config_file_path(&dir);
        if let Ok(config) = read_config(&config_path) {
            if let Some(ref custom_path) = config.save_path {
                let custom_dir = PathBuf::from(custom_path);
                if is_dir_writable(&custom_dir).is_ok() {
                    return Ok(custom_dir);
                }
            }
        }
    }

    resolve_writable_dir(app_handle)
}

/// 读取配置文件。
///
/// 文件不存在时返回默认配置；
/// 文件存在但解析失败时记录警告并返回默认配置，不阻断应用启动；
/// 其他读取错误返回错误码。
pub fn read_config(config_path: &Path) -> Result<AppConfig, String> {
    match fs::read_to_string(config_path) {
        Ok(content) => match serde_json::from_str::<AppConfig>(&content) {
            Ok(config) => Ok(config),
            Err(e) => {
                eprintln!("Config parse failed, using defaults: {}", e);
                Ok(AppConfig::default())
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(AppConfig::default()),
        Err(e) => Err(format!("{}: {}", ERR_CONFIG_READ_FAILED, e)),
    }
}

/// 将配置以 JSON 格式写入指定路径。
pub fn write_config(config_path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("{}: {}", ERR_CONFIG_WRITE_FAILED, e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("{}: {}", ERR_CONFIG_WRITE_FAILED, e))?;

    fs::write(config_path, content)
        .map_err(|e| format!("{}: {}", ERR_CONFIG_WRITE_FAILED, e))
}

/// 返回配置文件的完整路径。
pub fn config_file_path(writable_dir: &Path) -> PathBuf {
    writable_dir.join(CONFIG_FILE_NAME)
}
