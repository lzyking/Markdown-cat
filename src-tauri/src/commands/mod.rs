/// 统一结果结构，所有后端命令返回此类型。
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

    #[allow(dead_code)]
    pub fn failure<E: ToString>(err: E) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(err.to_string()),
        }
    }
}

/// 后端命令注册入口。
#[tauri::command]
pub async fn ping() -> CmdResult<String> {
    CmdResult::success("pong".to_string())
}

/// 初始化时调用，确认后端就绪。
#[tauri::command]
pub fn init_app() -> CmdResult<()> {
    CmdResult::success(())
}
