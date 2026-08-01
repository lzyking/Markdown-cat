/// 统一结果结构，所有后端命令返回此类型。
///
/// 无数据成功响应通过 `CmdResult::ok()` 构造，序列化后为 `{ ok: true }`。
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct CmdResult<T> {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> CmdResult<T> {
    pub fn success(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn failure<E: ToString>(err: E) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(err.to_string()),
        }
    }
}

impl CmdResult<()> {
    /// 返回无 data 的成功响应，序列化后为 `{ ok: true }`。
    pub fn ok() -> Self {
        Self {
            ok: true,
            data: None,
            error: None,
        }
    }
}

pub mod config;
pub mod confluence;
pub mod doc;
pub mod pdf_export;

/// 后端命令注册入口。
#[tauri::command]
pub fn ping() -> CmdResult<String> {
    CmdResult::success("pong".to_string())
}

/// 初始化时调用，确认后端就绪。
#[tauri::command]
pub fn init_app() -> CmdResult<()> {
    CmdResult::ok()
}
