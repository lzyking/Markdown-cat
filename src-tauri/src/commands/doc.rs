use crate::commands::CmdResult;
use crate::config;
use crate::doc;
use base64::Engine as _;

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
            doc::generate_name_without_conflict_check().unwrap_or_else(|_| "New_*.md".to_string())
        }),
        Err(_) => {
            doc::generate_name_without_conflict_check().unwrap_or_else(|_| "New_*.md".to_string())
        }
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

/// 剪贴板图片保存成功结果。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ImageSaveResult {
    pub filename: String,
    pub path: String,
}

/// 本地图片读取结果。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReadImageAssetResult {
    pub mime_type: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_base64: Option<String>,
    pub skipped_large: bool,
}

fn guess_image_mime_type(path: &std::path::Path) -> String {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "tif" | "tiff" => "image/tiff",
        _ => "application/octet-stream",
    }
    .to_string()
}

/// 仅允许已知的图片扩展名被 `read_image_asset` 读取。
/// 导出功能会跟随 Markdown 中的绝对路径读取任意本地文件，
/// 若不做扩展名白名单校验，攻击者可构造一个指向任意本地文件
/// （如 `/etc/passwd`）的 `![](/etc/passwd)` 图片引用，
/// 借助导出流程把文件内容当作“图片”窃取进导出的 HTML 中。
fn is_supported_image_extension(path: &std::path::Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "avif" | "tif" | "tiff"
    )
}

/// 通过文件内容的魔数（magic bytes）二次确认其确实是图片格式，
/// 而不仅仅依赖可被伪造的扩展名，进一步防止任意文件被伪装成图片读取。
/// SVG 是纯文本格式没有统一魔数，仅做扩展名白名单校验（且预览已对危险 HTML 做过滤）。
fn looks_like_image_content(path: &std::path::Path, bytes: &[u8]) -> bool {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if extension == "svg" {
        return true;
    }
    match bytes {
        [0x89, 0x50, 0x4e, 0x47, ..] => true, // PNG
        [0xff, 0xd8, 0xff, ..] => true,       // JPEG
        [0x47, 0x49, 0x46, 0x38, ..] => true, // GIF87a/89a
        [0x42, 0x4d, ..] => true,             // BMP
        [0x00, 0x00, 0x01, 0x00, ..] => true, // ICO
        b if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" => true,
        b if b.len() >= 12 && &b[4..8] == b"ftyp" => true, // AVIF/HEIF family
        b if b.len() >= 4 && (&b[0..2] == b"II" || &b[0..2] == b"MM") => true, // TIFF
        _ => false,
    }
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
/// 读取成功后动态放宽该文件所在目录的 asset:// 协议可访问范围，
/// 使文档中已存在的相对路径图片（非本次会话粘贴产生）也能在预览中正常渲染，
/// 而不必等到本次会话内首次粘贴/迁移图片才被动放宽。
#[tauri::command]
pub fn read_external_document(
    app_handle: tauri::AppHandle,
    path: String,
) -> CmdResult<DocumentState> {
    use tauri::Manager;

    let p = std::path::Path::new(&path);
    if !p.exists() || !p.is_file() {
        return CmdResult::failure("ERR_FILE_NOT_FOUND".to_string());
    }
    let ext = p
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "md" && ext != "markdown" && ext != "txt" {
        return CmdResult::failure(
            "ERR_UNSUPPORTED_FILE_TYPE: 仅支持打开 .md, .markdown, .txt 格式文件".to_string(),
        );
    }
    match std::fs::read_to_string(p) {
        Ok(content) => {
            let filename = p
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Untitled.md".to_string());
            if let Some(parent) = p.parent() {
                if let Err(e) = app_handle
                    .asset_protocol_scope()
                    .allow_directory(parent, true)
                {
                    eprintln!(
                        "Failed to widen asset protocol scope for {}: {e}",
                        parent.display()
                    );
                }
            }
            CmdResult::success(DocumentState { filename, content })
        }
        Err(e) => CmdResult::failure(format!("ERR_READ_FILE_FAILED: {}", e)),
    }
}

/// 将文档另存为指定绝对路径。
/// 保存成功后动态放宽目标目录的 asset:// 协议可访问范围，
/// 使新目录中已存在的相对路径图片也能在预览中正常渲染。
#[tauri::command]
pub fn save_document_as(
    app_handle: tauri::AppHandle,
    target_path: String,
    content: String,
) -> CmdResult<SaveResult> {
    use tauri::Manager;

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
            if let Some(parent) = path.parent() {
                if let Err(e) = app_handle
                    .asset_protocol_scope()
                    .allow_directory(parent, true)
                {
                    eprintln!(
                        "Failed to widen asset protocol scope for {}: {e}",
                        parent.display()
                    );
                }
            }
            CmdResult::success(SaveResult {
                filename,
                path: target_path,
            })
        }
        Err(e) => CmdResult::failure(format!("ERR_SAVE_FAILED: {}", e)),
    }
}

/// 读取用于 HTML 导出的本地图片。超过给定大小限制时仅返回元数据，不回传 base64 内容。
#[tauri::command]
pub fn read_image_asset(
    path: String,
    max_inline_size_bytes: Option<u64>,
) -> CmdResult<ReadImageAssetResult> {
    let image_path = std::path::Path::new(&path);
    if !image_path.exists() || !image_path.is_file() {
        return CmdResult::failure("ERR_FILE_NOT_FOUND".to_string());
    }
    if !is_supported_image_extension(image_path) {
        return CmdResult::failure("ERR_UNSUPPORTED_IMAGE_TYPE".to_string());
    }

    let metadata = match std::fs::metadata(image_path) {
        Ok(metadata) => metadata,
        Err(e) => return CmdResult::failure(format!("ERR_READ_FILE_FAILED: {}", e)),
    };
    let size_bytes = metadata.len();
    let mime_type = guess_image_mime_type(image_path);
    let max_inline_size_bytes = max_inline_size_bytes.unwrap_or(10 * 1024 * 1024);

    if size_bytes > max_inline_size_bytes {
        return CmdResult::success(ReadImageAssetResult {
            mime_type,
            size_bytes,
            data_base64: None,
            skipped_large: true,
        });
    }

    match std::fs::read(image_path) {
        Ok(bytes) => {
            if !looks_like_image_content(image_path, &bytes) {
                return CmdResult::failure("ERR_UNSUPPORTED_IMAGE_TYPE".to_string());
            }
            CmdResult::success(ReadImageAssetResult {
                mime_type,
                size_bytes,
                data_base64: Some(base64::engine::general_purpose::STANDARD.encode(bytes)),
                skipped_large: false,
            })
        }
        Err(e) => CmdResult::failure(format!("ERR_READ_FILE_FAILED: {}", e)),
    }
}

/// 将剪贴板图片以二进制形式写入指定目录。
/// 写入成功后会动态放宽 asset:// 协议的可访问范围，
/// 使目标目录之外（例如 $HOME/$APPDATA 之外的自定义保存目录）中的图片也能在预览中正常渲染。
fn save_image_asset_impl<R: tauri::Runtime>(
    manager: &impl tauri::Manager<R>,
    target_dir: &str,
    filename: &str,
    bytes: &[u8],
) -> CmdResult<ImageSaveResult> {
    let directory = std::path::Path::new(target_dir);
    match doc::save_binary_asset_to_dir(directory, filename, bytes) {
        Ok((final_name, full_path)) => {
            if let Err(e) = manager
                .asset_protocol_scope()
                .allow_directory(directory, true)
            {
                // 文件已成功落盘；这里只是 asset:// 预览放宽失败，不应反向打断保存结果。
                eprintln!("Failed to widen asset protocol scope for {target_dir}: {e}");
            }
            CmdResult::success(ImageSaveResult {
                filename: final_name,
                path: full_path,
            })
        }
        Err(e) => CmdResult::failure(e),
    }
}

fn save_image_asset_base64_impl<R: tauri::Runtime>(
    manager: &impl tauri::Manager<R>,
    target_dir: &str,
    filename: &str,
    bytes_base64: &str,
) -> CmdResult<ImageSaveResult> {
    let bytes = match base64::engine::general_purpose::STANDARD.decode(bytes_base64) {
        Ok(bytes) => bytes,
        Err(_) => return CmdResult::failure("ERR_INVALID_IMAGE_DATA".to_string()),
    };

    save_image_asset_impl(manager, target_dir, filename, &bytes)
}

#[tauri::command]
pub fn save_image_asset(
    app_handle: tauri::AppHandle,
    target_dir: String,
    filename: String,
    bytes: String,
) -> CmdResult<ImageSaveResult> {
    save_image_asset_base64_impl(&app_handle, &target_dir, &filename, &bytes)
}

/// 将暂存资源文件从旧目录迁移到新目录（用于文档“另存为”后同步图片位置）。
/// 若源文件不存在，视为无需迁移，返回成功但 `migrated: false`。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct AssetMigrationResult {
    pub migrated: bool,
}

fn copy_asset_file_impl<R: tauri::Runtime>(
    manager: &impl tauri::Manager<R>,
    from_dir: &str,
    to_dir: &str,
    filename: &str,
) -> CmdResult<AssetMigrationResult> {
    let from = std::path::Path::new(from_dir);
    let to = std::path::Path::new(to_dir);
    match doc::copy_asset_between_dirs(from, to, filename) {
        Ok(Some(_path)) => {
            if let Err(e) = manager.asset_protocol_scope().allow_directory(to, true) {
                eprintln!("Failed to widen asset protocol scope for {to_dir}: {e}");
            }
            CmdResult::success(AssetMigrationResult { migrated: true })
        }
        Ok(None) => CmdResult::success(AssetMigrationResult { migrated: false }),
        Err(e) => CmdResult::failure(e),
    }
}

#[tauri::command]
pub fn copy_asset_file(
    app_handle: tauri::AppHandle,
    from_dir: String,
    to_dir: String,
    filename: String,
) -> CmdResult<AssetMigrationResult> {
    copy_asset_file_impl(&app_handle, &from_dir, &to_dir, &filename)
}

#[cfg(test)]
mod tests {
    use super::{copy_asset_file_impl, save_image_asset_base64_impl, save_image_asset_impl};
    use crate::doc;
    use std::fs;
    use tauri::Manager;

    #[test]
    fn save_image_asset_impl_writes_file_and_allows_asset_directory() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("images");

        // 写入前先确认 mock app 的默认作用域尚未放行该目录，
        // 这样后续的 is_allowed 断言才能真正证明是本次调用触发了放宽。
        assert!(!app.asset_protocol_scope().is_allowed(&asset_dir));

        let result = save_image_asset_impl(
            &app,
            &asset_dir.to_string_lossy(),
            "paste.png",
            &[1, 2, 3, 4],
        );

        assert!(result.ok);
        let data = result.data.expect("save result data");
        assert_eq!(data.filename, "paste.png");
        assert_eq!(
            fs::read(asset_dir.join("paste.png")).unwrap(),
            vec![1, 2, 3, 4]
        );
        assert!(app.asset_protocol_scope().is_allowed(&asset_dir));
    }

    #[test]
    fn save_image_asset_impl_avoids_name_collision_at_command_level() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("images");

        let first = save_image_asset_impl(&app, &asset_dir.to_string_lossy(), "paste.png", &[1, 2]);
        let second =
            save_image_asset_impl(&app, &asset_dir.to_string_lossy(), "paste.png", &[3, 4]);

        assert!(first.ok);
        assert!(second.ok);

        let first_data = first.data.expect("first save result");
        let second_data = second.data.expect("second save result");
        assert_eq!(first_data.filename, "paste.png");
        assert_ne!(second_data.filename, first_data.filename);
        assert_eq!(
            fs::read(asset_dir.join(&first_data.filename)).unwrap(),
            vec![1, 2]
        );
        assert_eq!(
            fs::read(asset_dir.join(&second_data.filename)).unwrap(),
            vec![3, 4]
        );
    }

    #[test]
    fn save_image_asset_decodes_valid_base64_and_writes_file() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("images");

        let result = save_image_asset_base64_impl(
            &app,
            &asset_dir.to_string_lossy(),
            "paste.png",
            "iVBORw==",
        );

        assert!(result.ok);
        let data = result.data.expect("save result data");
        assert_eq!(data.filename, "paste.png");
        assert_eq!(
            fs::read(asset_dir.join("paste.png")).unwrap(),
            vec![0x89, 0x50, 0x4e, 0x47]
        );
    }

    #[test]
    fn save_image_asset_rejects_invalid_base64_without_writing_file() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("images");

        let result = save_image_asset_base64_impl(
            &app,
            &asset_dir.to_string_lossy(),
            "paste.png",
            "%%%not-base64%%%",
        );

        assert!(!result.ok);
        assert_eq!(result.error, Some("ERR_INVALID_IMAGE_DATA".to_string()));
        assert!(!asset_dir.exists());
    }

    #[test]
    fn copy_asset_file_impl_copies_file_and_allows_target_directory() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let from_dir = temp_dir.path().join("from");
        let to_dir = temp_dir.path().join("to");

        fs::create_dir_all(&from_dir).expect("create source dir");
        fs::write(from_dir.join("move.png"), [5, 6, 7]).expect("seed source asset");

        // 迁移前目标目录尚不存在，作用域也理应尚未放行。
        assert!(!app.asset_protocol_scope().is_allowed(&to_dir));

        let result = copy_asset_file_impl(
            &app,
            &from_dir.to_string_lossy(),
            &to_dir.to_string_lossy(),
            "move.png",
        );

        assert!(result.ok);
        let data = result.data.expect("migration result");
        assert!(data.migrated);
        assert_eq!(fs::read(to_dir.join("move.png")).unwrap(), vec![5, 6, 7]);
        assert!(app.asset_protocol_scope().is_allowed(&to_dir));
    }

    #[test]
    fn copy_asset_file_impl_skips_missing_source_without_creating_target_dir() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let from_dir = temp_dir.path().join("from");
        let to_dir = temp_dir.path().join("to");

        let result = copy_asset_file_impl(
            &app,
            &from_dir.to_string_lossy(),
            &to_dir.to_string_lossy(),
            "missing.png",
        );

        assert!(result.ok);
        let data = result.data.expect("migration result");
        assert!(!data.migrated);
        assert!(!to_dir.exists());
    }

    #[test]
    fn copy_asset_file_impl_returns_failure_when_target_path_is_occupied_by_file() {
        let app = tauri::test::mock_app();
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let from_dir = temp_dir.path().join("from");
        let to_dir = temp_dir.path().join("occupied");

        fs::create_dir_all(&from_dir).expect("create source dir");
        fs::write(from_dir.join("move.png"), [8, 9]).expect("seed source asset");
        fs::write(&to_dir, b"not a directory").expect("occupy target path with file");

        let result = copy_asset_file_impl(
            &app,
            &from_dir.to_string_lossy(),
            &to_dir.to_string_lossy(),
            "move.png",
        );

        assert!(!result.ok);
        assert_eq!(result.error, Some(doc::ERR_SAVE_FAILED.to_string()));
    }
}
