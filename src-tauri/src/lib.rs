mod private_updates;
mod ai_chat;
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
            let imported=store.commit_import(pid, prepared).map_err(|e|e.to_string())?;
            if let Some(origin)=args["origin"].as_str() {
                store.request("source_origin",serde_json::json!({
                    "project_id":pid,"id":imported["id"],"origin":origin
                })).map_err(|e|e.to_string())?;
            }
            Ok(imported)
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
#[tauri::command]
fn open_github_token_setup() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg("https://github.com/settings/personal-access-tokens/new")
            .spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Private GitHub updater setup is currently supported on Windows.".into())
}
// Safe help action: only two pre-approved official provider URLs can open.
#[tauri::command]
fn open_ai_provider_setup(provider:String)->Result<(),String>{
    let url=match provider.as_str(){
        "openai"=>"https://platform.openai.com/api-keys",
        "anthropic"=>"https://console.anthropic.com/settings/keys",
        _=>return Err("Unknown AI provider".into())
    };
    #[cfg(target_os="windows")]
    {
        std::process::Command::new("explorer.exe").arg(url).spawn()
            .map_err(|_|"Could not open the provider's website".to_string())?;
        Ok(())
    }
    #[cfg(not(target_os="windows"))]
    {
        let _=url;
        Err("Open the provider's developer console in your browser".into())
    }
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
        .invoke_handler(tauri::generate_handler![
            request, open_update_downloads, open_github_token_setup,
            private_updates::update_status,
            private_updates::update_connect,
            private_updates::update_disconnect,
            private_updates::update_check,
            private_updates::update_install,
            ai_chat::ai_status,
            ai_chat::ai_configure,
            ai_chat::ai_disconnect,
            ai_chat::ai_configure_provider,
            ai_chat::ai_disconnect_provider,
            open_ai_provider_setup,
            ai_chat::ai_reply,
            ai_chat::ai_local_models,
            ai_chat::ai_start_ollama,
            ai_chat::ai_pull_model,
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start NOEMA; check your data-folder permissions");
}
