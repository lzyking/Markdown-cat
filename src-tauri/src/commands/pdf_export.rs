use crate::commands::doc::SaveResult;
use crate::commands::CmdResult;

#[cfg(target_os = "macos")]
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, Receiver, RecvTimeoutError},
        Arc, Mutex,
    },
    time::Duration,
};

#[cfg(target_os = "macos")]
use block2::RcBlock;
#[cfg(target_os = "macos")]
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSData, NSError, NSString, NSURL};
#[cfg(target_os = "macos")]
use objc2_web_kit::WKWebView;
#[cfg(target_os = "macos")]
use tauri::{
    webview::{PageLoadEvent, Url, WebviewWindow},
    AppHandle, Runtime, WebviewUrl, WebviewWindowBuilder,
};
#[cfg(target_os = "macos")]
use tempfile::{Builder as TempFileBuilder, NamedTempFile};

#[cfg(target_os = "macos")]
static NEXT_PDF_EXPORT_WINDOW_ID: AtomicU64 = AtomicU64::new(1);

/// Cheap, synchronous capability probe so the frontend can fail fast (before
/// paying the cost of rendering markdown and inlining images into a
/// self-contained HTML document) when PDF export isn't supported on this
/// platform, instead of discovering that only after doing all that work.
#[tauri::command]
pub fn pdf_export_supported() -> bool {
    cfg!(target_os = "macos")
}

#[tauri::command]
pub async fn export_pdf(
    app_handle: tauri::AppHandle,
    html: String,
    save_path: String,
) -> CmdResult<SaveResult> {
    #[cfg(target_os = "macos")]
    {
        match export_pdf_macos(app_handle, html, save_path).await {
            Ok(result) => result,
            Err(error) => CmdResult::failure(error),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, html, save_path);
        CmdResult::failure(
            "ERR_PDF_EXPORT_UNSUPPORTED_PLATFORM: 当前平台暂不支持 PDF 导出".to_string(),
        )
    }
}

#[cfg(target_os = "macos")]
async fn export_pdf_macos(
    app_handle: AppHandle,
    html: String,
    save_path: String,
) -> Result<CmdResult<SaveResult>, String> {
    let save_path_buf = PathBuf::from(&save_path);
    ensure_parent_directory(&save_path_buf)?;

    let temp_parent = save_path_buf.parent().map(Path::to_path_buf).unwrap_or(
        std::env::current_dir().map_err(|e| format!("ERR_PDF_EXPORT_TEMP_DIR_FAILED: {}", e))?,
    );
    let temp_html = create_temp_html_file(&temp_parent, &html)?;
    let temp_html_path = temp_html.path().to_path_buf();
    let temp_html_url = Url::from_file_path(&temp_html_path).map_err(|_| {
        format!(
            "ERR_PDF_EXPORT_TEMP_URL_FAILED: {}",
            temp_html_path.display()
        )
    })?;

    let load_signal = Arc::new(Mutex::new(None));
    let (load_tx, load_rx) = mpsc::channel::<Result<(), String>>();
    if let Ok(mut slot) = load_signal.lock() {
        *slot = Some(load_tx.clone());
    }

    let window_label = format!(
        "pdf-export-{}",
        NEXT_PDF_EXPORT_WINDOW_ID.fetch_add(1, Ordering::Relaxed)
    );

    // WKWebView refuses to navigate to `file://` URLs via a plain `loadRequest:`
    // (Tauri's normal `WebviewUrl` navigation path) for sandbox security reasons --
    // it silently fails to load real content. The window must first come up on an
    // inert placeholder, then be explicitly re-navigated on the main thread via the
    // native `loadFileURL:allowingReadAccessToURL:` API (see `dispatch_load_file_url`
    // below), which is the only API that grants WKWebView read access to a local
    // file. We only treat a `Finished` event as "our" load once its URL matches the
    // temp HTML file, so the placeholder's own load-finished event is ignored.
    let expected_url = temp_html_url.clone();
    let hidden_window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        WebviewUrl::External(Url::parse("about:blank").expect("about:blank is a valid URL")),
    )
    .visible(false)
    .on_page_load(move |_window, payload| {
        let is_expected_navigation = payload.url().scheme() == "file"
            && payload
                .url()
                .to_file_path()
                .ok()
                .zip(expected_url.to_file_path().ok())
                .is_some_and(|(actual, expected)| actual == expected);
        if payload.event() == PageLoadEvent::Finished && is_expected_navigation {
            if let Ok(mut slot) = load_signal.lock() {
                if let Some(sender) = slot.take() {
                    let _ = sender.send(Ok(()));
                }
            }
        }
    })
    .build()
    .map_err(|e| format!("ERR_PDF_EXPORT_WINDOW_CREATE_FAILED: {}", e))?;

    if let Err(error) = dispatch_load_file_url(&hidden_window, &temp_html_path, load_tx) {
        cleanup_hidden_window(&hidden_window);
        let _ = temp_html.close();
        return Err(error);
    }

    match recv_with_timeout(
        load_rx,
        Duration::from_secs(60),
        "ERR_PDF_EXPORT_LOAD_TIMEOUT: PDF 预览加载超时",
    )
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) | Err(error) => {
            cleanup_hidden_window(&hidden_window);
            let _ = temp_html.close();
            return Err(error);
        }
    }

    let (pdf_tx, pdf_rx) = mpsc::channel();
    let window_for_pdf = hidden_window.clone();
    if let Err(error) = hidden_window
        .run_on_main_thread(move || {
            let pdf_tx_for_webview = pdf_tx.clone();
            if let Err(error) = window_for_pdf.with_webview(move |platform_webview| {
                let mtm = match MainThreadMarker::new() {
                    Some(marker) => marker,
                    None => {
                        let _ = pdf_tx_for_webview.send(Err(
                            "ERR_PDF_EXPORT_MAIN_THREAD_REQUIRED: PDF 导出必须在主线程执行"
                                .to_string(),
                        ));
                        return;
                    }
                };
                let _ = mtm;

                let raw_webview = platform_webview.inner() as *mut WKWebView;
                if raw_webview.is_null() {
                    let _ = pdf_tx_for_webview.send(Err(
                        "ERR_PDF_EXPORT_WEBVIEW_UNAVAILABLE: 无法访问原生 WebView".to_string(),
                    ));
                    return;
                }

                let completion = RcBlock::new(move |pdf_data: *mut NSData, error: *mut NSError| {
                    if !error.is_null() {
                        let ns_error = unsafe { &*error };
                        let _ = pdf_tx_for_webview
                            .send(Err(format!("ERR_PDF_EXPORT_FAILED: {}", ns_error)));
                        return;
                    }

                    if pdf_data.is_null() {
                        let _ = pdf_tx_for_webview
                            .send(Err("ERR_PDF_EXPORT_EMPTY_DATA: 未收到 PDF 数据".to_string()));
                        return;
                    }

                    let pdf_bytes = unsafe { (&*pdf_data).to_vec() };
                    let _ = pdf_tx_for_webview.send(Ok(pdf_bytes));
                });

                let webview = unsafe { &*raw_webview };
                unsafe {
                    webview.createPDFWithConfiguration_completionHandler(None, &completion);
                }
            }) {
                let _ = pdf_tx.send(Err(format!(
                    "ERR_PDF_EXPORT_WEBVIEW_ACCESS_FAILED: {}",
                    error
                )));
            }
        })
        .map_err(|e| format!("ERR_PDF_EXPORT_MAIN_THREAD_DISPATCH_FAILED: {}", e))
    {
        cleanup_hidden_window(&hidden_window);
        let _ = temp_html.close();
        return Err(error);
    }

    let pdf_bytes = match recv_with_timeout(
        pdf_rx,
        Duration::from_secs(60),
        "ERR_PDF_EXPORT_RENDER_TIMEOUT: PDF 渲染超时",
    )
    .await
    {
        Ok(bytes) => bytes,
        Err(error) => {
            cleanup_hidden_window(&hidden_window);
            let _ = temp_html.close();
            return Err(error);
        }
    }?;

    cleanup_hidden_window(&hidden_window);
    let _ = temp_html.close();

    write_pdf_atomically(&save_path_buf, &pdf_bytes)?;

    let filename = save_path_buf
        .file_name()
        .map(|segment| segment.to_string_lossy().to_string())
        .unwrap_or_else(|| "Untitled.pdf".to_string());

    Ok(CmdResult::success(SaveResult {
        filename,
        path: save_path,
    }))
}

#[cfg(target_os = "macos")]
fn ensure_parent_directory(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("ERR_DIR_CREATE_FAILED: {}", e))?;
    }
    Ok(())
}

/// Writes the rendered PDF via a same-directory temp file + rename rather than
/// truncating `save_path` directly, so a write failure (disk full, permission
/// revoked mid-write, etc.) cannot leave a previously-good destination file
/// empty or partially overwritten -- the rename only happens once the full
/// PDF is confirmed written to disk.
#[cfg(target_os = "macos")]
fn write_pdf_atomically(save_path: &Path, pdf_bytes: &[u8]) -> Result<(), String> {
    let parent = save_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let mut temp_file = TempFileBuilder::new()
        .prefix("markdown-cat-pdf-export-out-")
        .suffix(".pdf")
        .tempfile_in(&parent)
        .map_err(|e| format!("ERR_SAVE_FAILED: {}", e))?;
    {
        use std::io::Write;
        temp_file
            .write_all(pdf_bytes)
            .map_err(|e| format!("ERR_SAVE_FAILED: {}", e))?;
        temp_file
            .flush()
            .map_err(|e| format!("ERR_SAVE_FAILED: {}", e))?;
    }
    temp_file
        .persist(save_path)
        .map_err(|e| format!("ERR_SAVE_FAILED: {}", e.error))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn create_temp_html_file(parent_dir: &Path, html: &str) -> Result<NamedTempFile, String> {
    use std::io::Write;

    let mut file = TempFileBuilder::new()
        .prefix("markdown-cat-pdf-export-")
        .suffix(".html")
        .tempfile_in(parent_dir)
        .map_err(|e| format!("ERR_PDF_EXPORT_TEMPFILE_CREATE_FAILED: {}", e))?;
    file.write_all(html.as_bytes())
        .map_err(|e| format!("ERR_PDF_EXPORT_TEMPFILE_WRITE_FAILED: {}", e))?;
    file.flush()
        .map_err(|e| format!("ERR_PDF_EXPORT_TEMPFILE_WRITE_FAILED: {}", e))?;
    Ok(file)
}

/// Forces the hidden window's native `WKWebView` to navigate to `file_path` via
/// `loadFileURL:allowingReadAccessToURL:`, the only WKWebView API that is granted
/// filesystem read access for local file navigation (plain `loadRequest:`/Tauri's
/// `WebviewUrl` navigation silently fails for `file://` URLs -- see the comment at
/// the call site). Must run on the main thread. Both the dispatch itself (queuing
/// the closure) and a `with_webview` access failure inside the closure are reported
/// back to the caller via `load_error_tx` so a real failure (e.g. the native webview
/// becoming unavailable) surfaces immediately instead of masquerading as the
/// `on_page_load` load timeout 60 seconds later.
#[cfg(target_os = "macos")]
fn dispatch_load_file_url<R: Runtime>(
    window: &WebviewWindow<R>,
    file_path: &Path,
    load_error_tx: mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    let file_path_string = file_path.to_string_lossy().to_string();
    // Grant read access to the temp HTML file's *parent directory*, not just the
    // file itself. The exported HTML is normally fully self-contained (images
    // inlined as base64 data URIs), but when an image fails to inline it is left
    // as a relative `src` with only a warning (see `export-html.ts`); scoping
    // access to just the single file would make WKWebView silently refuse to
    // load those already-warned sibling image files too.
    let read_access_dir_string = file_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("/"))
        .to_string_lossy()
        .to_string();
    let window_for_load = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = MainThreadMarker::new();
            let path_ns_string = NSString::from_str(&file_path_string);
            let file_url = NSURL::fileURLWithPath(&path_ns_string);
            let read_access_ns_string = NSString::from_str(&read_access_dir_string);
            let read_access_url = NSURL::fileURLWithPath(&read_access_ns_string);

            let webview_access_result = window_for_load.with_webview(move |platform_webview| {
                let raw_webview = platform_webview.inner() as *mut WKWebView;
                if raw_webview.is_null() {
                    eprintln!("PDF export: native WKWebView pointer was null, cannot navigate");
                    return;
                }
                let webview = unsafe { &*raw_webview };
                unsafe {
                    webview.loadFileURL_allowingReadAccessToURL(&file_url, &read_access_url);
                }
            });
            if let Err(error) = webview_access_result {
                let _ = load_error_tx.send(Err(format!(
                    "ERR_PDF_EXPORT_WEBVIEW_ACCESS_FAILED: {}",
                    error
                )));
            }
        })
        .map_err(|e| format!("ERR_PDF_EXPORT_MAIN_THREAD_DISPATCH_FAILED: {}", e))
}

#[cfg(target_os = "macos")]
async fn recv_with_timeout<T: Send + 'static>(
    receiver: Receiver<T>,
    timeout: Duration,
    timeout_error: &'static str,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(timeout))
        .await
        .map_err(|e| format!("ERR_PDF_EXPORT_RUNTIME_FAILED: {}", e))?
        .map_err(|e| match e {
            RecvTimeoutError::Timeout => timeout_error.to_string(),
            RecvTimeoutError::Disconnected => {
                "ERR_PDF_EXPORT_CHANNEL_CLOSED: 导出通道意外关闭".to_string()
            }
        })
}

#[cfg(target_os = "macos")]
fn cleanup_hidden_window<R: Runtime>(window: &WebviewWindow<R>) {
    if let Err(error) = window.destroy() {
        eprintln!(
            "Failed to destroy PDF export window {}: {error}",
            window.label()
        );
        let _ = window.close();
    }
}
