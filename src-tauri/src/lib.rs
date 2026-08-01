mod commands;
mod config;
mod doc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::init_app,
            commands::config::get_app_dir,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::select_save_dir,
            commands::config::update_last_opened_file,
            commands::doc::generate_document_name,
            commands::doc::get_blank_document,
            commands::doc::read_external_document,
            commands::doc::read_image_asset,
            commands::doc::save_document,
            commands::doc::save_document_as,
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
