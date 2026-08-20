use crate::commands::config::{resolve_confluence_token_path, resolve_connection_token};
use crate::commands::CmdResult;
use crate::config;
use base64::Engine as _;
use reqwest::header::{ACCEPT, CONTENT_TYPE};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::Emitter;

pub const ERR_CONFLUENCE_PAGE_LOOKUP_FAILED: &str = "ERR_CONFLUENCE_PAGE_LOOKUP_FAILED";
pub const ERR_CONFLUENCE_PAGE_CREATE_FAILED: &str = "ERR_CONFLUENCE_PAGE_CREATE_FAILED";
pub const ERR_CONFLUENCE_PAGE_UPDATE_FAILED: &str = "ERR_CONFLUENCE_PAGE_UPDATE_FAILED";
pub const ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED: &str = "ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED";
pub const ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE: &str =
    "ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluenceImageUpload {
    pub filename: String,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePublishPayload {
    pub base_url: String,
    pub username: String,
    pub api_token: Option<String>,
    pub space_key: String,
    pub parent_page_id: String,
    pub ignore_ssl: bool,
    pub page_title: String,
    pub storage_xhtml: String,
    pub images: Vec<ConfluenceImageUpload>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePublishResult {
    pub page_id: String,
    pub page_url: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfluencePublishProgress {
    pub step: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentListResponse {
    results: Vec<ConfluenceContentSummary>,
}

#[derive(Debug, Deserialize)]
struct ConfluenceContentSummary {
    id: String,
    #[serde(default)]
    version: Option<ConfluenceVersion>,
}

#[derive(Debug, Deserialize)]
struct ConfluenceVersion {
    number: u64,
}

#[derive(Debug, Deserialize)]
struct ConfluenceLinks {
    #[serde(default)]
    webui: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ConfluenceCreateOrUpdateResponse {
    id: String,
    #[serde(default, rename = "_links")]
    links: Option<ConfluenceLinks>,
}

#[tauri::command]
pub async fn publish_confluence(
    app_handle: tauri::AppHandle,
    payload: ConfluencePublishPayload,
) -> CmdResult<ConfluencePublishResult> {
    let base_url = payload.base_url.trim().trim_end_matches('/').to_string();
    let username = payload.username.trim().to_string();
    let space_key = payload.space_key.trim().to_string();
    let parent_page_id = payload.parent_page_id.trim().to_string();
    let page_title = payload.page_title.trim().to_string();
    let storage_xhtml = payload.storage_xhtml.trim().to_string();

    if base_url.is_empty()
        || space_key.is_empty()
        || page_title.is_empty()
    {
        return CmdResult::failure(format!(
            "{}: 请先填写 Confluence 地址、Space Key 与页面标题。",
            ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE
        ));
    }

    if !config::is_valid_confluence_space_key(&space_key) {
        return CmdResult::failure(format!(
            "{}: Space Key 格式无效，仅支持字母、数字和下划线。",
            ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE
        ));
    }

    if !parent_page_id.is_empty() && !config::is_valid_confluence_parent_page_id(&parent_page_id) {
        return CmdResult::failure(format!(
            "{}: Parent Page ID 格式无效，仅支持数字。",
            ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE
        ));
    }

    emit_progress(
        &app_handle,
        "环境检测",
        "running",
        "正在初始化 Confluence 发布请求…",
    );

    let token_path = match resolve_confluence_token_path(&app_handle) {
        Ok(path) => path,
        Err(error) => {
            emit_progress(&app_handle, "环境检测", "error", &format!("无法解析 Token 存储路径：{}", error));
            return CmdResult::failure(error);
        }
    };

    let token = match resolve_connection_token(&token_path, payload.api_token) {
        Ok(value) => value,
        Err(error) if error == config::ERR_CONFLUENCE_TOKEN_MISSING => {
            emit_progress(
                &app_handle,
                "环境检测",
                "error",
                "未找到可用的 API Token，请先在设置中保存令牌。",
            );
            return CmdResult::failure(format!(
                "{}: 请先在设置中保存 Confluence API Token，或在本次请求中提供覆盖令牌。",
                ERR_CONFLUENCE_PUBLISH_CONFIG_INCOMPLETE
            ));
        }
        Err(error) => {
            emit_progress(
                &app_handle,
                "环境检测",
                "error",
                &format!("读取 Confluence Token 失败：{}", error),
            );
            return CmdResult::failure(error);
        }
    };

    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(payload.ignore_ssl)
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            emit_progress(
                &app_handle,
                "环境检测",
                "error",
                "Confluence HTTP 客户端初始化失败。",
            );
            return CmdResult::failure(format!(
                "{}: {}",
                config::ERR_CONFLUENCE_CLIENT_BUILD_FAILED,
                error
            ));
        }
    };

    emit_progress(
        &app_handle,
        "环境检测",
        "done",
        "Confluence 地址、凭据与网络客户端已准备就绪。",
    );
    emit_progress(
        &app_handle,
        "页面发布",
        "running",
        &format!("正在检查页面“{}”是否已存在…", page_title),
    );

    let existing_page = match lookup_existing_page(
        &client,
        &base_url,
        &username,
        &token,
        &space_key,
        &page_title,
        payload.ignore_ssl,
    )
    .await
    {
        Ok(page) => page,
        Err(error) => {
            emit_progress(&app_handle, "页面发布", "error", &error);
            return CmdResult::failure(error);
        }
    };

    let publish_response = match existing_page {
        Some(existing_page) => {
            let current_version = existing_page
                .version
                .as_ref()
                .map(|version| version.number)
                .unwrap_or(1);
            emit_progress(
                &app_handle,
                "页面发布",
                "running",
                &format!("检测到同名页面，正在更新第 {} 版内容…", current_version + 1),
            );
            match update_page(
                &client,
                &base_url,
                &username,
                &token,
                &existing_page.id,
                current_version + 1,
                &page_title,
                &storage_xhtml,
                payload.ignore_ssl,
            )
            .await
            {
                Ok(response) => response,
                Err(error) => {
                    emit_progress(&app_handle, "页面发布", "error", &error);
                    return CmdResult::failure(error);
                }
            }
        }
        None => {
            emit_progress(
                &app_handle,
                "页面发布",
                "running",
                "未找到同名页面，正在创建新页面…",
            );
            match create_page(
                &client,
                &base_url,
                &username,
                &token,
                &space_key,
                &parent_page_id,
                &page_title,
                &storage_xhtml,
                payload.ignore_ssl,
            )
            .await
            {
                Ok(response) => response,
                Err(error) => {
                    emit_progress(&app_handle, "页面发布", "error", &error);
                    return CmdResult::failure(error);
                }
            }
        }
    };

    let page_id = publish_response.id.clone();
    let page_url = build_page_url(&base_url, publish_response.links.as_ref(), &page_id);

    emit_progress(
        &app_handle,
        "页面发布",
        "done",
        &format!("页面内容已发布，页面 ID：{}。", page_id),
    );
    emit_progress(
        &app_handle,
        "附件上传",
        "running",
        if payload.images.is_empty() {
            "未检测到需要上传的本地图片附件。"
        } else {
            "正在上传本地图片附件…"
        },
    );

    let mut warnings = Vec::new();
    let total_images = payload.images.len();
    let mut uploaded_images = 0usize;

    for image in payload.images {
        match upload_attachment(
            &client,
            &base_url,
            &username,
            &token,
            &page_id,
            image,
            payload.ignore_ssl,
        )
        .await
        {
            Ok(filename) => {
                uploaded_images += 1;
                emit_progress(
                    &app_handle,
                    "附件上传",
                    "running",
                    &format!("附件已上传：{}", filename),
                );
            }
            Err(error) => {
                warnings.push(error.clone());
                emit_progress(&app_handle, "附件上传", "error", &error);
            }
        }
    }

    let attachment_message = if total_images == 0 {
        "无需上传附件，已跳过该步骤。".to_string()
    } else if warnings.is_empty() {
        format!("附件上传完成，共上传 {} 个文件。", uploaded_images)
    } else {
        format!(
            "附件上传完成，成功 {} 个，失败 {} 个。",
            uploaded_images,
            warnings.len()
        )
    };
    emit_progress(&app_handle, "附件上传", "done", &attachment_message);

    CmdResult::success(ConfluencePublishResult {
        page_id,
        page_url,
        warnings,
    })
}

fn emit_progress(app_handle: &tauri::AppHandle, step: &str, status: &str, message: &str) {
    let _ = app_handle.emit(
        "confluence-publish-progress",
        ConfluencePublishProgress {
            step: step.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

pub(crate) async fn send_confluence_get(
    client: &reqwest::Client,
    url: &str,
    username: &str,
    token: &str,
    query: Option<&[(&str, &str)]>,
    headers: Option<&[(&str, &str)]>,
) -> Result<reqwest::Response, reqwest::Error> {
    let make_req = |use_bearer: bool| {
        let mut req = client.get(url);
        if let Some(q) = query {
            req = req.query(q);
        }
        if let Some(hdrs) = headers {
            for (k, v) in hdrs {
                req = req.header(*k, *v);
            }
        }
        if use_bearer || username.trim().is_empty() {
            req.bearer_auth(token)
        } else {
            req.basic_auth(username, Some(token))
        }
    };

    let res = make_req(false).send().await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED && !username.trim().is_empty() {
        if let Ok(bearer_res) = make_req(true).send().await {
            return Ok(bearer_res);
        }
    }
    Ok(res)
}

pub(crate) async fn send_confluence_post_json(
    client: &reqwest::Client,
    url: &str,
    username: &str,
    token: &str,
    json_body: &Value,
) -> Result<reqwest::Response, reqwest::Error> {
    let make_req = |use_bearer: bool| {
        let req = client
            .post(url)
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/json")
            .json(json_body);
        if use_bearer || username.trim().is_empty() {
            req.bearer_auth(token)
        } else {
            req.basic_auth(username, Some(token))
        }
    };

    let res = make_req(false).send().await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED && !username.trim().is_empty() {
        if let Ok(bearer_res) = make_req(true).send().await {
            return Ok(bearer_res);
        }
    }
    Ok(res)
}

pub(crate) async fn send_confluence_put_json(
    client: &reqwest::Client,
    url: &str,
    username: &str,
    token: &str,
    json_body: &Value,
) -> Result<reqwest::Response, reqwest::Error> {
    let make_req = |use_bearer: bool| {
        let req = client
            .put(url)
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/json")
            .json(json_body);
        if use_bearer || username.trim().is_empty() {
            req.bearer_auth(token)
        } else {
            req.basic_auth(username, Some(token))
        }
    };

    let res = make_req(false).send().await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED && !username.trim().is_empty() {
        if let Ok(bearer_res) = make_req(true).send().await {
            return Ok(bearer_res);
        }
    }
    Ok(res)
}

pub(crate) async fn send_confluence_post_multipart(
    client: &reqwest::Client,
    url: &str,
    username: &str,
    token: &str,
    bytes: Vec<u8>,
    filename: &str,
) -> Result<reqwest::Response, reqwest::Error> {
    let make_req = |use_bearer: bool| {
        let part = Part::bytes(bytes.clone()).file_name(filename.to_string());
        let form = Form::new().part("file", part);
        let req = client
            .post(url)
            .header(ACCEPT, "application/json")
            .header("X-Atlassian-Token", "nocheck")
            .multipart(form);
        if use_bearer || username.trim().is_empty() {
            req.bearer_auth(token)
        } else {
            req.basic_auth(username, Some(token))
        }
    };

    let res = make_req(false).send().await?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED && !username.trim().is_empty() {
        if let Ok(bearer_res) = make_req(true).send().await {
            return Ok(bearer_res);
        }
    }
    Ok(res)
}

async fn lookup_existing_page(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    token: &str,
    space_key: &str,
    page_title: &str,
    ignore_ssl: bool,
) -> Result<Option<ConfluenceContentSummary>, String> {
    let url = format!("{}/rest/api/content", base_url);
    let query = [
        ("title", page_title),
        ("spaceKey", space_key),
        ("expand", "version"),
    ];
    let response = send_confluence_get(
        client,
        &url,
        username,
        token,
        Some(&query),
        Some(&[(ACCEPT.as_str(), "application/json")]),
    )
    .await
    .map_err(|error| {
        format!(
            "{}: {}",
            ERR_CONFLUENCE_PAGE_LOOKUP_FAILED,
            format_confluence_request_error(&error, ignore_ssl)
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "{}: 页面查询失败（HTTP {}）{}",
            ERR_CONFLUENCE_PAGE_LOOKUP_FAILED,
            status.as_u16(),
            format_error_body(&body)
        ));
    }

    let payload = response
        .json::<ConfluenceContentListResponse>()
        .await
        .map_err(|error| {
            format!(
                "{}: 无法解析页面查询响应：{}",
                ERR_CONFLUENCE_PAGE_LOOKUP_FAILED, error
            )
        })?;

    Ok(payload.results.into_iter().next())
}

async fn create_page(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    token: &str,
    space_key: &str,
    parent_page_id: &str,
    page_title: &str,
    storage_xhtml: &str,
    ignore_ssl: bool,
) -> Result<ConfluenceCreateOrUpdateResponse, String> {
    let url = format!("{}/rest/api/content", base_url);
    let mut body = Map::new();
    body.insert("type".to_string(), Value::String("page".to_string()));
    body.insert("title".to_string(), Value::String(page_title.to_string()));
    body.insert("space".to_string(), json!({ "key": space_key }));
    body.insert(
        "body".to_string(),
        json!({
            "storage": {
                "value": storage_xhtml,
                "representation": "storage"
            }
        }),
    );
    if !parent_page_id.is_empty() {
        body.insert(
            "ancestors".to_string(),
            json!([{ "id": parent_page_id }]),
        );
    }

    let response = send_confluence_post_json(
        client,
        &url,
        username,
        token,
        &Value::Object(body),
    )
    .await
    .map_err(|error| {
        format!(
            "{}: {}",
            ERR_CONFLUENCE_PAGE_CREATE_FAILED,
            format_confluence_request_error(&error, ignore_ssl)
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "{}: 页面创建失败（HTTP {}）{}",
            ERR_CONFLUENCE_PAGE_CREATE_FAILED,
            status.as_u16(),
            format_error_body(&body)
        ));
    }

    response
        .json::<ConfluenceCreateOrUpdateResponse>()
        .await
        .map_err(|error| {
            format!(
                "{}: 无法解析页面创建响应：{}",
                ERR_CONFLUENCE_PAGE_CREATE_FAILED, error
            )
        })
}

async fn update_page(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    token: &str,
    page_id: &str,
    next_version: u64,
    page_title: &str,
    storage_xhtml: &str,
    ignore_ssl: bool,
) -> Result<ConfluenceCreateOrUpdateResponse, String> {
    let url = format!("{}/rest/api/content/{}", base_url, page_id);
    let body = json!({
        "id": page_id,
        "type": "page",
        "title": page_title,
        "version": {
            "number": next_version
        },
        "body": {
            "storage": {
                "value": storage_xhtml,
                "representation": "storage"
            }
        }
    });

    let response = send_confluence_put_json(
        client,
        &url,
        username,
        token,
        &body,
    )
    .await
    .map_err(|error| {
        format!(
            "{}: {}",
            ERR_CONFLUENCE_PAGE_UPDATE_FAILED,
            format_confluence_request_error(&error, ignore_ssl)
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "{}: 页面更新失败（HTTP {}）{}",
            ERR_CONFLUENCE_PAGE_UPDATE_FAILED,
            status.as_u16(),
            format_error_body(&body)
        ));
    }

    response
        .json::<ConfluenceCreateOrUpdateResponse>()
        .await
        .map_err(|error| {
            format!(
                "{}: 无法解析页面更新响应：{}",
                ERR_CONFLUENCE_PAGE_UPDATE_FAILED, error
            )
        })
}

async fn upload_attachment(
    client: &reqwest::Client,
    base_url: &str,
    username: &str,
    token: &str,
    page_id: &str,
    image: ConfluenceImageUpload,
    ignore_ssl: bool,
) -> Result<String, String> {
    let ConfluenceImageUpload {
        filename,
        data_base64,
    } = image;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|error| {
            format!(
                "{}: 附件 {} 的 Base64 数据无效：{}",
                ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED, filename, error
            )
        })?;

    let url = format!(
        "{}/rest/api/content/{}/child/attachment",
        base_url, page_id
    );

    let response = send_confluence_post_multipart(
        client,
        &url,
        username,
        token,
        bytes,
        &filename,
    )
    .await
    .map_err(|error| {
        format!(
            "{}: 附件 {} 上传失败：{}",
            ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED,
            filename,
            format_confluence_request_error(&error, ignore_ssl)
        )
    })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "{}: 附件 {} 上传失败（HTTP {}）{}",
            ERR_CONFLUENCE_ATTACHMENT_UPLOAD_FAILED,
            filename,
            status.as_u16(),
            format_error_body(&body)
        ));
    }

    Ok(filename)
}

fn build_page_url(base_url: &str, links: Option<&ConfluenceLinks>, page_id: &str) -> String {
    if let Some(webui) = links.and_then(|links| links.webui.as_ref()) {
        if webui.starts_with("http://") || webui.starts_with("https://") {
            return webui.to_string();
        }
        if webui.starts_with('/') {
            return format!("{}{}", base_url, webui);
        }
        return format!("{}/{}", base_url, webui);
    }

    format!("{}/pages/viewpage.action?pageId={}", base_url, page_id)
}

fn format_confluence_request_error(error: &reqwest::Error, ignore_ssl: bool) -> String {
    if error.is_timeout() {
        return format!("请求超时。{}", ssl_hint(ignore_ssl));
    }
    if error.is_connect() {
        return format!("无法连接到 Confluence 服务器。{}", ssl_hint(ignore_ssl));
    }

    let lower = error.to_string().to_lowercase();
    if lower.contains("certificate") || lower.contains("tls") || lower.contains("ssl") {
        return format!(
            "SSL 证书校验未通过。{}",
            if ignore_ssl {
                "当前已开启忽略 SSL 校验，请确认服务器证书链是否完整。"
            } else {
                "如为自签名证书，可尝试开启“忽略 SSL 校验”。"
            }
        );
    }

    error.to_string()
}

fn ssl_hint(ignore_ssl: bool) -> &'static str {
    if ignore_ssl {
        "请检查地址、网络代理或服务端可用性。"
    } else {
        "如使用自签名证书，可尝试开启“忽略 SSL 校验”。"
    }
}

fn format_error_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("：{}", trimmed)
    }
}
