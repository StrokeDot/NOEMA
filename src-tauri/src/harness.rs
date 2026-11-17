//! Explicit, paired loopback connection to the optional Harness writing plugin.
use keyring::Entry;
use reqwest::{Client,Url};
use serde_json::{json,Value};
use std::{fs,path::PathBuf,time::Duration};
use tauri::{AppHandle,Manager};
use uuid::Uuid;
const SERVICE:&str="NOEMA-DeepSeek-Harness";
const DEFAULT_URL:&str="http://127.0.0.1:17879";
fn entry()->Result<Entry,String>{Entry::new(SERVICE,"connection").map_err(|_|"Windows credential storage is unavailable".into())}
fn load()->Result<Value,String>{
    let text=entry()?.get_password().map_err(|_|"Prepare the Harness connection in NOEMA first")?;
    serde_json::from_str(&text).map_err(|_|"Harness connection settings are unreadable".into())
}
fn endpoint(raw:&str)->Result<String,String>{
    let url=Url::parse(raw).map_err(|_|"Enter a local Harness address")?;
    if url.scheme()!="http"||url.host_str()!=Some("127.0.0.1")||!url.username().is_empty()||url.password().is_some()
        ||url.path()!="/"||url.query().is_some()||url.fragment().is_some()||url.port().unwrap_or(80)<1024{
        return Err("The Harness connection must use http://127.0.0.1 with a local port and no extra path".into());
    }
    Ok(raw.trim_end_matches('/').to_string())
}
fn client()->Result<Client,String>{Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
    .connect_timeout(Duration::from_secs(3)).timeout(Duration::from_secs(15)).build().map_err(|_|"Cannot create the local Harness connection".into())}
fn setup_dir(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_data_dir().map_err(|_|"Cannot locate NOEMA settings")?.join("harness-writing-bridge"))}
#[tauri::command]
pub fn harness_prepare(app:AppHandle)->Result<Value,String>{
    let config=match entry()?.get_password(){
        Ok(text)=>serde_json::from_str::<Value>(&text).map_err(|_|"Harness connection settings are unreadable")?,
        Err(keyring::Error::NoEntry)=>json!({"url":DEFAULT_URL,"token":format!("{}{}",Uuid::new_v4().simple(),Uuid::new_v4().simple())}),
        Err(_)=>return Err("Could not read Harness pairing settings".into())
    };
    let url=endpoint(config["url"].as_str().ok_or("Missing Harness address")?)?;
    let token=config["token"].as_str().filter(|s|s.len()==64&&s.bytes().all(|b|b.is_ascii_hexdigit())).ok_or("Invalid Harness pairing")?;
    let port=Url::parse(&url).map_err(|_|"Invalid Harness address")?.port().ok_or("Missing Harness port")?;
    let dir=setup_dir(&app)?;fs::create_dir_all(&dir).map_err(|_|"Could not prepare the Harness connection folder")?;
    fs::write(dir.join("package.json"),include_str!("../harness-bridge/package.json")).map_err(|_|"Could not prepare the Harness plugin")?;
    fs::write(dir.join("index.mjs"),include_str!("../harness-bridge/index.mjs")).map_err(|_|"Could not prepare the Harness plugin")?;
    // This is a bridge-only pairing token, never a DeepSeek/ChatGPT credential.
    let patch=format!("- insert:\n    - id: noema-writing-bridge\n      name: noema-dsh-writing-bridge\n      config:\n        port: {port}\n        token: '{token}'\n");
    fs::write(dir.join("cordis.patch.yml"),patch).map_err(|_|"Could not prepare Harness pairing")?;
    entry()?.set_password(&config.to_string()).map_err(|_|"Could not protect the Harness pairing settings")?;
    Ok(json!({"directory":dir.to_string_lossy(),"url":url}))
}
#[tauri::command]
pub fn harness_open_setup(app:AppHandle)->Result<(),String>{
    let dir=setup_dir(&app)?;
    if !dir.join("package.json").is_file(){return Err("Prepare the Harness connection first".into());}
    #[cfg(target_os="windows")]
    {std::process::Command::new("explorer.exe").arg(&dir).spawn().map_err(|_|"Could not open the connection folder")?;Ok(())}
    #[cfg(not(target_os="windows"))]
    {let _=dir;Err("Open the prepared connection folder in your file manager".into())}
}
fn model_id(raw:&str)->bool{
    raw.split_once('/').is_some_and(|(route,model)|matches!(route,"deepseek-account"|"deepseek-official")&&!model.is_empty()
        &&model.len()<=110&&model.bytes().all(|b|b.is_ascii_alphanumeric()||b"-._:/".contains(&b)))
}
fn checked_body(body:Value)->Result<Value,String>{
    if body["bridge"]!="noema-dsh-writing"||body["protocol"]!=1{return Err("The local service is not the NOEMA Harness bridge".into())}Ok(body)
}
#[tauri::command]
pub async fn harness_models()->Result<Value,String>{
    let c=load()?;let url=endpoint(c["url"].as_str().ok_or("Missing Harness address")?)?;
    let response=client()?.get(format!("{url}/noema/v1/models")).bearer_auth(c["token"].as_str().ok_or("Missing Harness pairing")?)
        .send().await.map_err(|_|"Start DeepSeek Harness with the NOEMA bridge enabled, then reconnect")?;
    if !response.status().is_success(){return Err("Harness pairing failed. Reinstall the prepared NOEMA plugin in Harness and reconnect".into())}
    let body=checked_body(response.json().await.map_err(|_|"Harness returned unreadable model information")?)?;
    let models:Vec<Value>=body["models"].as_array().ok_or("Harness returned no model catalog")?.iter()
        .filter(|m|m["id"].as_str().is_some_and(model_id)&&m["label"].is_string()).cloned().collect();
    Ok(json!({"models":models}))
}
pub async fn reply(model:&str,messages:&[Value])->Result<String,String>{
    if !model_id(model){return Err("Choose an available DeepSeek Harness model".into())}
    let c=load()?;let url=endpoint(c["url"].as_str().ok_or("Missing Harness address")?)?;
    let response=client()?.post(format!("{url}/noema/v1/reply")).timeout(Duration::from_secs(245))
        .bearer_auth(c["token"].as_str().ok_or("Missing Harness pairing")?)
        .json(&json!({"model":model,"messages":messages})).send().await
        .map_err(|_|"Harness could not finish the writing request. Your original input is preserved")?;
    if !response.status().is_success(){return Err("Harness could not complete this request. Check its DeepSeek sign-in, selected model and account balance; your original input is preserved".into())}
    let body=checked_body(response.json().await.map_err(|_|"Harness returned an unreadable reply")?)?;
    if body["model"]!=model{return Err("Harness returned a different model".into())}
    body["content"].as_str().filter(|s|!s.trim().is_empty()&&s.len()<=2_000_000).map(str::to_string).ok_or("Harness returned no complete writing reply".into())
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn connection_stays_on_fixed_loopback(){
        assert!(endpoint(DEFAULT_URL).is_ok());
        for raw in ["http://example.com:17879","http://127.0.0.1:17879/other","http://person@127.0.0.1:17879","https://127.0.0.1:17879","http://127.0.0.1:17879?token=secret","http://127.0.0.1"]{assert!(endpoint(raw).is_err(),"{raw}");}
    }
    #[test]fn routes_are_explicit_and_third_party_subscription_routes_are_not_relayed(){
        assert!(model_id("deepseek-account/deepseek-flash"));assert!(model_id("deepseek-official/deepseek-v4-pro"));
        for id in ["anthropic/claude-sonnet","openai-codex/gpt-6","deepseek-account/","deepseek-account/model?token=x"]{assert!(!model_id(id));}
        assert!(checked_body(json!({"bridge":"other","protocol":1})).is_err());
    }
}
