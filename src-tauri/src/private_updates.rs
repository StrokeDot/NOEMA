//! Private GitHub Actions updater for NOEMA's first Windows releases.
 //! Downloads ONLY successful main-branch workflow artifacts and verifies the
 //! artifact SHA-256 from authenticated GitHub metadata before extracting.
 //! An app-specific token stays in Windows Credential Manager, never in SQLite.
 //! This is NOT a Tauri-signature or Windows Authenticode verified release.
use crate::Database;
use keyring::Entry;
use reqwest::{Client, StatusCode};
use semver::Version;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, io::Read, process::Command, time::Duration};
use tauri::Manager;

const OWNER_REPO: &str = "StrokeDot/NOEMA";
const WORKFLOW: &str = "windows.yml";
const SERVICE: &str = "NOEMA-private-GitHub-updater";
const USER: &str = "StrokeDot-NOEMA";
const MAX_ZIP_BYTES: usize = 80 * 1024 * 1024;
const MAX_INSTALLER_BYTES: u64 = 160 * 1024 * 1024;

fn credential() -> Result<Entry, String> {
    Entry::new(SERVICE, USER).map_err(|_| "Windows credential storage unavailable.".into())
}
fn get_token() -> Result<String, String> {
    credential()?.get_password().map_err(|_| "Connect private GitHub access in Settings first.".into())
}
fn client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NOEMA-Windows-Updater/0.1")
        .timeout(Duration::from_secs(45))
        .build().map_err(|_| "Could not initialize secure GitHub connection.".into())
}
fn api(url: &str) -> String {
    format!("https://api.github.com/repos/{OWNER_REPO}/{url}")
}
async fn get_json(client: &Client, token: &str, url: &str) -> Result<Value, String> {
    let response = client.get(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send().await.map_err(|e|format!("Cannot connect to GitHub: {e}"))?;
    let status=response.status();
    if !status.is_success() {
        return Err(match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN =>
                "GitHub authorization failed. Use a non-expired fine-grained token with Actions: Read on StrokeDot/NOEMA.".into(),
            StatusCode::NOT_FOUND =>
                "The private NOEMA repository or update workflow is not accessible with this token.".into(),
            _ => format!("GitHub returned HTTP {status}. Try again later.")
        });
    }
    response.json().await.map_err(|_| "GitHub returned an invalid API response.".into())
}
fn parse_version(name: &str) -> Option<Version> {
    name.strip_prefix("NOEMA-")?.strip_suffix("-Windows-installer")
        .and_then(|s|Version::parse(s).ok())
}
fn metadata_version(current: &str, artifact: &Value) -> Option<Version> {
    let name=artifact["name"].as_str()?;
    let version=parse_version(name)?;
    let installed=Version::parse(current).ok()?;
    if version > installed && artifact["expired"].as_bool()==Some(false) &&
       artifact["digest"].as_str()?.starts_with("sha256:") {Some(version)}
    else {None}
}
async fn discover(client: &Client, token: &str, current: &str) -> Result<Option<Value>, String> {
    let runs=get_json(client,token,&api(&format!(
        "actions/workflows/{WORKFLOW}/runs?branch=main&status=success&per_page=25"
    ))).await?;
    let Some(list)=runs["workflow_runs"].as_array() else {
        return Err("GitHub did not return workflow runs.".into());
    };
    let mut best:Option<(Version,Value)>=None;
    for run in list {
        if run["conclusion"]!="success" || run["head_branch"]!="main" {continue;}
        let Some(run_id)=run["id"].as_u64() else {continue;};
        let artifacts=get_json(client,token,&api(&format!("actions/runs/{run_id}/artifacts?per_page=100"))).await?;
        let Some(items)=artifacts["artifacts"].as_array() else {continue;};
        for item in items {
            if item["workflow_run"]["id"].as_u64()!=Some(run_id) {continue;}
            let Some(ver)=metadata_version(current,item) else {continue;};
            if best.as_ref().is_none_or(|(found,_)|&ver>found) {
                let version_label=ver.to_string();
                best=Some((ver,json!({
                    "available":true,"version":version_label,"installed":current,
                    "run_id":run_id,"artifact_id":item["id"],"digest":item["digest"],
                    "name":item["name"],"url":run["html_url"]
                })));
            }
        }
        // The most recent successful run usually contains the newest version.
        // Still allow later runs in the first page if their semver is higher.
    }
    Ok(best.map(|(_,v)|v))
}
async fn fetch_update() -> Result<(Client,String,Value),String> {
    let client=client()?;
    let token=get_token()?;
    let current=env!("CARGO_PKG_VERSION");
    let update=discover(&client,&token,current).await?.ok_or("NOEMA is already up to date.")?;
    Ok((client,token,update))
}
#[tauri::command]
pub fn update_status() -> Value {
    json!({"installed":env!("CARGO_PKG_VERSION"),"authorized":get_token().is_ok(),
        "source":"Private GitHub Actions","requires_manual_approval":true})
}
#[tauri::command]
pub async fn update_connect(token:String) -> Result<Value,String> {
    let token=token.trim();
    if token.len()<20 || token.len()>512 || token.chars().any(|c|c.is_whitespace()) {
        return Err("Enter a valid fine-grained GitHub token. Do not paste it into a chat.".into());
    }
    let client=client()?;
    // Confirm private workflow access before saving the credential.
    get_json(&client,token,&api(&format!(
        "actions/workflows/{WORKFLOW}/runs?branch=main&status=success&per_page=1"
    ))).await?;
    credential()?.set_password(token).map_err(|_|"Could not save access in Windows Credential Manager.".to_string())?;
    Ok(json!({"authorized":true}))
}
#[tauri::command]
pub fn update_disconnect() -> Result<Value,String> {
    let cred=credential()?;
    if cred.get_password().is_ok() {
        cred.delete_credential().map_err(|_|"Could not remove stored GitHub credential.".to_string())?;
    }
    Ok(json!({"authorized":false}))
}
#[tauri::command]
pub async fn update_check() -> Result<Value,String> {
    let client=client()?;
    let token=get_token()?;
    let current=env!("CARGO_PKG_VERSION");
    Ok(discover(&client,&token,current).await?.unwrap_or(json!({
        "available":false,"installed":current
    })))
}
fn archive_installer(content:&[u8], expected:&str) -> Result<Vec<u8>,String> {
    let cursor=std::io::Cursor::new(content);
    let mut archive=zip::ZipArchive::new(cursor).map_err(|_|"The update download is not a valid ZIP archive.".to_string())?;
    if archive.len()!=1 {return Err("Expected exactly one installer inside the signed-off GitHub artifact.".into());}
    let entry=archive.by_index(0).map_err(|_|"Could not read the Windows installer.".to_string())?;
    if entry.name().map_err(|_|"Invalid installer filename.".to_string())?.as_ref()!=expected || entry.size()>MAX_INSTALLER_BYTES {
        return Err("The artifact contains an unexpected installer or an oversized file.".into());
    }
    let mut bytes=Vec::new();
    entry.take(MAX_INSTALLER_BYTES+1).read_to_end(&mut bytes).map_err(|_|"Cannot read the downloaded installer.".to_string())?;
    if bytes.len() as u64>MAX_INSTALLER_BYTES || !bytes.starts_with(b"MZ") {
        return Err("The downloaded installer failed Windows executable validation.".into());
    }
    Ok(bytes)
}
fn ps_literal(path:&std::path::Path)->String {
    format!("'{}'",path.to_string_lossy().replace('\'',"''"))
}
#[tauri::command]
pub async fn update_install(
    app:tauri::AppHandle,
    db:tauri::State<'_,Database>,
    expected_version:String
) -> Result<Value,String> {
    let requested=Version::parse(&expected_version).map_err(|_|"Invalid requested update version.".to_string())?;
    let (client,token,info)=fetch_update().await?;
    if info["version"]!=requested.to_string() {
        return Err("A newer release became available. Check again before installing.".into());
    }
    let id=info["artifact_id"].as_u64().ok_or("Missing artifact ID")?;
    let url=api(&format!("actions/artifacts/{id}/zip"));
    let response=client.get(url).bearer_auth(token).header("Accept","application/octet-stream")
        .timeout(Duration::from_secs(120)).send().await
        .map_err(|e|format!("Update download failed: {e}"))?;
    if !response.status().is_success() {return Err(format!("GitHub download failed: HTTP {}",response.status()));}
    let bytes=response.bytes().await.map_err(|_|"Update download was interrupted.".to_string())?;
    if bytes.len()>MAX_ZIP_BYTES {return Err("Downloaded update is unexpectedly large.".into());}
    let expected=info["digest"].as_str().ok_or("Missing artifact digest")?
        .strip_prefix("sha256:").ok_or("GitHub did not supply a SHA-256 digest")?;
    let computed=format!("{:x}",Sha256::digest(&bytes));
    if !computed.eq_ignore_ascii_case(expected) {return Err("Update checksum mismatch. Installation cancelled.".into());}
    let installer_name=format!("NOEMA_{}_x64-setup.exe",requested);
    let installer=archive_installer(&bytes,&installer_name)?;

    // Before any installed files are changed, make a complete local archive backup.
    let backup_path={
        let mut store=db.lock().map_err(|_|"NOEMA cannot prepare the archive backup.".to_string())?;
        let parent=store.root.parent().ok_or("NOEMA data folder has no parent directory")?;
        let filename=format!("NOEMA-backup-before-{}-{}",requested,std::process::id());
        let backup=parent.join(filename);
        store.request("backup",json!({"path":backup.to_string_lossy()}))
            .map_err(|e|format!("Update stopped because the safety backup failed: {e}"))?;
        backup
    };
    let dir=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("updates");
    fs::create_dir_all(&dir).map_err(|e|format!("Cannot prepare update folder: {e}"))?;
    let exe=dir.join(&installer_name);
    fs::write(&exe,&installer).map_err(|e|format!("Cannot write downloaded update: {e}"))?;
    let ps=dir.join(format!("install-noema-{}.ps1",requested));
    // Launch installation after NOEMA exits so NSIS can replace the executable.
    // Never accept an arbitrary command or download URL from frontend input.
    let contents=format!(
        "$ErrorActionPreference='Stop'\nStart-Sleep -Seconds 3\nStart-Process -FilePath {} -ArgumentList '/S' -Wait\n",
        ps_literal(&exe)
    );
    fs::write(&ps,contents).map_err(|e|format!("Cannot prepare update installer: {e}"))?;
    Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass",
        "-WindowStyle","Hidden","-File"]).arg(&ps).spawn()
        .map_err(|e|format!("Could not start update installer: {e}"))?;
    // The frontend has already flushed pending manuscript edits before invoking.
    // The NSIS installer runs only after the current process exits.
    let result=json!({"installing":true,"backup_path":backup_path.to_string_lossy()});
    app.exit(0);
    Ok(result)
}
