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

/// 错误码常量：文件名不合法（包含路径分隔符/上级目录穿越）。
pub const ERR_INVALID_FILENAME: &str = "ERR_INVALID_FILENAME";

/// 校验文件名是否为“纯文件名”：不含路径分隔符、不含 `..`、非空。
/// 用于阻止通过文件名参数进行目录穿越写入（Path Traversal）。
pub fn is_safe_filename(filename: &str) -> bool {
    if filename.is_empty() || filename == "." || filename == ".." {
        return false;
    }
    if filename.contains('/') || filename.contains('\\') {
        return false;
    }
    let candidate = Path::new(filename);
    matches!(
        candidate.components().collect::<Vec<_>>().as_slice(),
        [std::path::Component::Normal(_)]
    )
}

/// 在目标目录中为给定文件名寻找一个不冲突的最终文件名，并原子化写入内容。
/// 使用 `create_new` 原子创建文件，避免"检测存在性 -> 写入"之间的竞态窗口
/// （例如两次几乎同时的粘贴生成了相同的候选文件名）导致互相覆盖。
/// 若原文件名已被占用，在扩展名前追加递增序号直至写入成功。
fn write_unique_file(save_dir: &Path, filename: &str, bytes: &[u8]) -> Result<String, String> {
    use std::io::Write;

    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| filename.to_string());
    let ext = path.extension().map(|s| s.to_string_lossy().to_string());

    let mut counter: u32 = 0;
    loop {
        let candidate = if counter == 0 {
            filename.to_string()
        } else {
            match &ext {
                Some(ext) => format!("{}_{}.{}", stem, counter, ext),
                None => format!("{}_{}", stem, counter),
            }
        };
        let candidate_path = save_dir.join(&candidate);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate_path)
        {
            Ok(mut file) => {
                return file
                    .write_all(bytes)
                    .map(|_| candidate)
                    .map_err(|_| ERR_SAVE_FAILED.to_string());
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                counter += 1;
                continue;
            }
            Err(_) => return Err(ERR_SAVE_FAILED.to_string()),
        }
    }
}

/// 将二进制资源写入指定目录中的文件。
/// 文件名会被校验以阻止目录穿越；若发生同名冲突，会自动生成不冲突的新文件名。
/// 返回实际写入的文件名与完整物理路径。
pub fn save_binary_asset_to_dir(
    save_dir: &Path,
    filename: &str,
    bytes: &[u8],
) -> Result<(String, String), String> {
    if !is_safe_filename(filename) {
        return Err(ERR_INVALID_FILENAME.to_string());
    }
    if !save_dir.exists() {
        fs::create_dir_all(save_dir).map_err(|_| ERR_SAVE_FAILED.to_string())?;
    }
    let final_name = write_unique_file(save_dir, filename, bytes)?;
    let file_path = save_dir.join(&final_name);
    Ok((final_name, file_path.to_string_lossy().to_string()))
}

/// 将资源文件从一个目录复制到另一个目录（用于文档“另存为”时迁移暂存资源）。
/// 若源文件不存在，视为无需迁移，静默跳过（返回 Ok(None)）。
/// 文件名同样会被校验以阻止目录穿越。
pub fn copy_asset_between_dirs(
    from_dir: &Path,
    to_dir: &Path,
    filename: &str,
) -> Result<Option<String>, String> {
    if !is_safe_filename(filename) {
        return Err(ERR_INVALID_FILENAME.to_string());
    }
    let source = from_dir.join(filename);
    if !source.exists() {
        return Ok(None);
    }
    if !to_dir.exists() {
        fs::create_dir_all(to_dir).map_err(|_| ERR_SAVE_FAILED.to_string())?;
    }
    let dest = to_dir.join(filename);
    if source != dest {
        fs::copy(&source, &dest).map_err(|_| ERR_SAVE_FAILED.to_string())?;
    }
    Ok(Some(dest.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::{copy_asset_between_dirs, is_safe_filename, save_binary_asset_to_dir};

    #[test]
    fn saves_binary_asset_into_target_directory() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("assets");
        let (name, saved_path) =
            save_binary_asset_to_dir(&asset_dir, "img_test.png", &[1, 2, 3, 4])
                .expect("save binary asset");

        assert_eq!(name, "img_test.png");
        assert!(asset_dir.join("img_test.png").exists());
        assert_eq!(
            std::fs::read(asset_dir.join("img_test.png")).unwrap(),
            vec![1, 2, 3, 4]
        );
        assert_eq!(saved_path, asset_dir.join("img_test.png").to_string_lossy());
    }

    #[test]
    fn rejects_path_traversal_filenames() {
        assert!(!is_safe_filename("../evil.png"));
        assert!(!is_safe_filename("sub/evil.png"));
        assert!(!is_safe_filename("sub\\evil.png"));
        assert!(!is_safe_filename(""));
        assert!(!is_safe_filename(".."));
        assert!(is_safe_filename("img_test.png"));
    }

    #[test]
    fn save_binary_asset_rejects_unsafe_filename() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("assets");
        let result = save_binary_asset_to_dir(&asset_dir, "../evil.png", &[1]);
        assert!(result.is_err());
    }

    #[test]
    fn save_binary_asset_avoids_overwriting_on_name_collision() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let asset_dir = temp_dir.path().join("assets");
        let (first_name, _) =
            save_binary_asset_to_dir(&asset_dir, "img_dup.png", &[1, 2]).expect("first save");
        let (second_name, _) =
            save_binary_asset_to_dir(&asset_dir, "img_dup.png", &[3, 4]).expect("second save");

        assert_eq!(first_name, "img_dup.png");
        assert_ne!(second_name, first_name);
        assert_eq!(
            std::fs::read(asset_dir.join(&first_name)).unwrap(),
            vec![1, 2]
        );
        assert_eq!(
            std::fs::read(asset_dir.join(&second_name)).unwrap(),
            vec![3, 4]
        );
    }

    #[test]
    fn copy_asset_between_dirs_migrates_file() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let from_dir = temp_dir.path().join("old_assets");
        let to_dir = temp_dir.path().join("new_assets");
        save_binary_asset_to_dir(&from_dir, "img_move.png", &[5, 6]).expect("seed source file");

        let result = copy_asset_between_dirs(&from_dir, &to_dir, "img_move.png")
            .expect("copy should succeed");

        assert!(result.is_some());
        assert!(to_dir.join("img_move.png").exists());
        assert_eq!(
            std::fs::read(to_dir.join("img_move.png")).unwrap(),
            vec![5, 6]
        );
    }

    #[test]
    fn copy_asset_between_dirs_skips_missing_source() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let from_dir = temp_dir.path().join("old_assets");
        let to_dir = temp_dir.path().join("new_assets");

        let result = copy_asset_between_dirs(&from_dir, &to_dir, "missing.png")
            .expect("missing source should not error");

        assert!(result.is_none());
    }
}
