use noema_core::Store;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::Manager;
type Database = Arc<Mutex<Store>>;
#[tauri::command]
async fn request(
    db: tauri::State<'_, Database>,
    action: String,
    args: Value,
) -> Result<Value, String> {
    let db = db.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if action == "import" {
            let path = args["path"].as_str().ok_or("Missing file path")?;
            let pid = args["project_id"].as_str().ok_or("Missing project")?;
            let root = db
                .lock()
                .map_err(|_| "Database lock unavailable")?
                .root
                .clone();
            // Parsing never holds the database lock, so manuscript saves can continue.
            let prepared = noema_core::import::prepare(&root, std::path::Path::new(path))
                .map_err(|e| e.to_string())?;
            let mut store = db.lock().map_err(|_| "Database lock unavailable")?;
            store
                .commit_import(pid, prepared)
                .map_err(|e| e.to_string())
        } else {
            let mut store = db.lock().map_err(|_| "Database lock unavailable")?;
            store.request(&action, args).map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
// Only this fixed project URL may be opened; no arbitrary shell command is accepted.
#[tauri::command]
fn open_update_downloads() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("https://github.com/StrokeDot/NOEMA/actions/workflows/windows.yml")
            .spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Update downloads are currently supported on Windows.".into())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            let store = Store::open(root).map_err(|e| std::io::Error::other(e.to_string()))?;
            app.manage(Arc::new(Mutex::new(store)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![request, open_update_downloads])
        .run(tauri::generate_context!())
        .expect("Unable to start NOEMA; check your data-folder permissions");
}
