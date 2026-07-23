use crate::commands::CmdResult;
use crate::config::{self, AppConfig};

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
                    eprintln!("Config read failed, using defaults: {}", e);
                    CmdResult::success(AppConfig::default())
                }
            }
        }
        Err(e) => {
            eprintln!("Writable dir resolve failed, using defaults: {}", e);
            CmdResult::success(AppConfig::default())
        }
    }
}

/// 设置默认保存路径并写入配置。
#[tauri::command]
pub fn set_config(app_handle: tauri::AppHandle, save_path: String) -> CmdResult<()> {
    match config::resolve_writable_dir(&app_handle) {
        Ok(dir) => {
            let config_path = config::config_file_path(&dir);
            let cfg = AppConfig::with_save_path(save_path);
            match config::write_config(&config_path, &cfg) {
                Ok(_) => CmdResult::ok(),
                Err(e) => CmdResult::failure(e),
            }
        }
        Err(e) => CmdResult::failure(e),
    }
}

/// 调起保存目录选择指令。
#[tauri::command]
pub fn select_save_dir() -> CmdResult<String> {
    CmdResult::success("/tmp/markdown-cat-test".to_string())
}
