use crate::commands::CmdResult;
use crate::config;
use crate::doc;

/// 前端文档初始状态。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DocumentState {
    pub filename: String,
    pub content: String,
}

/// 生成新的默认 Markdown 文件名。
/// 文件名格式为 `New_YYYYMMDD_HHMMSS_mmm.md`。
///
/// 优先使用可写目录检测同名冲突；若目录不可写，仍基于当前时间生成文件名，
/// 不阻断启动。
#[tauri::command]
pub fn generate_document_name(app_handle: tauri::AppHandle) -> CmdResult<String> {
    match config::resolve_save_dir(&app_handle) {
        Ok(save_dir) => match doc::generate_unique_name(&save_dir) {
            Ok(name) => CmdResult::success(name),
            Err(e) => CmdResult::failure(e),
        },
        Err(_) => match doc::generate_name_without_conflict_check() {
            Ok(name) => CmdResult::success(name),
            Err(e) => CmdResult::failure(e),
        },
    }
}

/// 获取空白文档的默认状态（文件名 + 空内容）。
/// 前端启动时调用，确保标题栏与编辑器初始状态一致。
#[tauri::command]
pub fn get_blank_document(app_handle: tauri::AppHandle) -> CmdResult<DocumentState> {
    let filename = match config::resolve_save_dir(&app_handle) {
        Ok(save_dir) => doc::generate_unique_name(&save_dir).unwrap_or_else(|_| {
            doc::generate_name_without_conflict_check()
                .unwrap_or_else(|_| "New_*.md".to_string())
        }),
        Err(_) => doc::generate_name_without_conflict_check()
            .unwrap_or_else(|_| "New_*.md".to_string()),
    };

    CmdResult::success(DocumentState {
        filename,
        content: doc::blank_content(),
    })
}

/// 文档保存成功结果。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct SaveResult {
    pub filename: String,
    pub path: String,
}

/// 保存 Markdown 文档。
/// 前端在防抖触发后调用，保存成功后返回 SaveResult 包含文件名与绝对路径。
#[tauri::command]
pub fn save_document(
    app_handle: tauri::AppHandle,
    filename: String,
    content: String,
    save_path: Option<String>,
) -> CmdResult<SaveResult> {
    let target_dir = if let Some(ref path_str) = save_path {
        let custom_dir = std::path::PathBuf::from(path_str);
        if config::is_dir_writable(&custom_dir).is_ok() {
            custom_dir
        } else {
            match config::resolve_save_dir(&app_handle) {
                Ok(dir) => dir,
                Err(e) => return CmdResult::failure(e),
            }
        }
    } else {
        match config::resolve_save_dir(&app_handle) {
            Ok(dir) => dir,
            Err(e) => return CmdResult::failure(e),
        }
    };

    match doc::save_document_to_dir(&target_dir, &filename, &content) {
        Ok(full_path) => CmdResult::success(SaveResult {
            filename,
            path: full_path,
        }),
        Err(e) => CmdResult::failure(e),
    }
}

/// 读取外部文件路径的内容与文件名。
#[tauri::command]
pub fn read_external_document(path: String) -> CmdResult<DocumentState> {
    let p = std::path::Path::new(&path);
    if !p.exists() || !p.is_file() {
        return CmdResult::failure("ERR_FILE_NOT_FOUND".to_string());
    }
    match std::fs::read_to_string(p) {
        Ok(content) => {
            let filename = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled.md".to_string());
            CmdResult::success(DocumentState { filename, content })
        }
        Err(e) => CmdResult::failure(format!("ERR_READ_FILE_FAILED: {}", e)),
    }
}

/// 将文档另存为指定绝对路径。
#[tauri::command]
pub fn save_document_as(target_path: String, content: String) -> CmdResult<SaveResult> {
    let path = std::path::Path::new(&target_path);
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return CmdResult::failure(format!("ERR_DIR_CREATE_FAILED: {}", e));
        }
    }
    match std::fs::write(path, &content) {
        Ok(_) => {
            let filename = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled.md".to_string());
            CmdResult::success(SaveResult {
                filename,
                path: target_path,
            })
        }
        Err(e) => CmdResult::failure(format!("ERR_SAVE_FAILED: {}", e)),
    }
}
