use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// 错误码常量：文件名生成失败。
pub const ERR_DOC_NAME_FAILED: &str = "ERR_DOC_NAME_FAILED";

/// 错误码常量：文档保存失败。
pub const ERR_SAVE_FAILED: &str = "ERR_SAVE_FAILED";

/// 默认 Markdown 文档内容。
pub const DEFAULT_CONTENT: &str = "";

/// 生成一个格式为 `New_YYYYMMDD_HHMMSS_mmm.md` 的唯一文件名。
///
/// 文件名基于当前系统时间的毫秒时间戳，并在 `save_dir` 中检测是否已存在。
/// 若同一毫秒内发生冲突，则等待下一毫秒后重试，直到生成唯一文件名。
pub fn generate_unique_name(save_dir: &Path) -> Result<String, String> {
    loop {
        let name = generate_name_without_conflict_check()?;

        let full_path = save_dir.join(&name);
        if !full_path.exists() {
            return Ok(name);
        }

        // 同一毫秒内检测到冲突，等待下一毫秒后重试
        thread::sleep(Duration::from_millis(1));
    }
}

/// 基于当前时间生成文件名，不检查文件系统是否存在。
/// 在保存目录不可写时作为降级方案使用。
pub fn generate_name_without_conflict_check() -> Result<String, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ERR_DOC_NAME_FAILED.to_string())?;
    let millis = now.as_millis() as i64;

    let dt = chrono::DateTime::from_timestamp_millis(millis)
        .ok_or_else(|| ERR_DOC_NAME_FAILED.to_string())?;
    let local = dt.with_timezone(&chrono::Local);
    let formatted = local.format("%Y%m%d_%H%M%S_%3f").to_string();

    Ok(format!("New_{}.md", formatted))
}

/// 返回默认的空白 Markdown 文档内容。
pub fn blank_content() -> String {
    DEFAULT_CONTENT.to_string()
}

/// 将 Markdown 文档内容保存到指定目录中的特定文件。
/// 若目录不存在则尝试创建，成功后返回完整物理路径字符串。
pub fn save_document_to_dir(
    save_dir: &Path,
    filename: &str,
    content: &str,
) -> Result<String, String> {
    if !save_dir.exists() {
        fs::create_dir_all(save_dir).map_err(|_| ERR_SAVE_FAILED.to_string())?;
    }
    let file_path = save_dir.join(filename);
    fs::write(&file_path, content).map_err(|_| ERR_SAVE_FAILED.to_string())?;
    Ok(file_path.to_string_lossy().to_string())
}
