#[cfg(target_os = "windows")]
pub use windows::core as windows_core;

mod commands;
mod config;
mod doc;

use chrono::Local;
use std::backtrace::Backtrace;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::panic::{self, PanicHookInfo};
use std::path::PathBuf;
use std::sync::{Mutex, Once};

static PANIC_HOOK: Once = Once::new();
// Holds the current crash-log path and serializes concurrent panic writes.
// Seeded with a best-effort guess before Tauri initializes; upgraded to the
// app's canonical `app_data_dir` once the AppHandle becomes available in
// `.setup()`, so logs stay consistent with the rest of the app.
static PANIC_LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logger();
    tracing_subscriber::fmt::try_init().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::init_app,
            commands::config::get_app_dir,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::set_confluence_config,
            commands::config::select_save_dir,
            commands::config::update_last_opened_file,
            commands::config::get_confluence_token_status,
            commands::config::set_confluence_token,
            commands::config::clear_confluence_token,
            commands::config::clear_confluence_settings,
            commands::config::check_md2cf_installed,
            commands::config::test_confluence_connection,
            commands::config::test_confluence_pat_connection,
            commands::config::search_confluence_spaces,
            commands::config::get_confluence_personal_space,
            commands::config::list_confluence_space_root_pages,
            commands::config::list_confluence_page_children,
            commands::confluence::publish_confluence,
            commands::doc::generate_document_name,
            commands::doc::get_blank_document,
            commands::doc::read_external_document,
            commands::doc::read_image_asset,
            commands::doc::save_document,
            commands::doc::save_document_as,
            commands::doc::write_export_file,
            commands::doc::save_image_asset,
            commands::doc::copy_asset_file,
            commands::pdf_export::export_pdf,
            commands::pdf_export::pdf_export_supported
        ])
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            // Realign crash-log destination with the app's canonical data dir
            // (matches `resolve_writable_dir`'s app_data_dir fallback) now that
            // an AppHandle exists; the pre-init guess above remains a fallback
            // if this resolution fails.
            {
                use tauri::Manager;
                if let Ok(app_data_dir) = _app.path().app_data_dir() {
                    if let Ok(mut path) = PANIC_LOG_PATH.lock() {
                        *path = Some(app_data_dir.join("logs").join("app.log"));
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn install_panic_logger() {
    PANIC_HOOK.call_once(|| {
        let previous_hook = panic::take_hook();
        panic::set_hook(Box::new(move |panic_info| {
            log_panic_to_file(panic_info);
            previous_hook(panic_info);
        }));
    });
}

fn log_panic_to_file(panic_info: &PanicHookInfo<'_>) {
    // Hold the lock for the whole path-resolution + write so concurrent
    // panics on different threads cannot interleave their log entries.
    let Ok(mut path_guard) = PANIC_LOG_PATH.lock() else {
        return;
    };

    if path_guard.is_none() {
        *path_guard = config::panic_log_file_path();
    }

    let Some(log_path) = path_guard.as_ref() else {
        return;
    };

    let Some(parent) = log_path.parent() else {
        return;
    };

    if fs::create_dir_all(parent).is_err() {
        return;
    }

    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) else {
        return;
    };

    let payload = if let Some(message) = panic_info.payload().downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = panic_info.payload().downcast_ref::<String>() {
        message.clone()
    } else {
        "panic payload unavailable".to_string()
    };

    let location = panic_info
        .location()
        .map(|location| format!("{}:{}:{}", location.file(), location.line(), location.column()))
        .unwrap_or_else(|| "unknown".to_string());
    let thread = std::thread::current()
        .name()
        .map(|name| name.to_string())
        .unwrap_or_else(|| "unnamed".to_string());
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f %:z");
    let backtrace = Backtrace::force_capture();

    let _ = writeln!(
        file,
        "[{timestamp}] panic on thread '{thread}': {payload}\nlocation: {location}\nbacktrace:\n{backtrace}\n"
    );
}
