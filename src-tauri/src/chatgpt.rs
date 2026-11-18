//! Supported Sign in with ChatGPT (SIWC), directly to the public Responses API.
//! Passwords, browser cookies and other applications' credentials are never read.
use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, DecodingKey, Validation, Algorithm};
use keyring::Entry;
use reqwest::{Client, Url};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, State};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener, sync::{watch, Mutex as AsyncMutex}};
use uuid::Uuid;

const AUTH: &str = "https://auth.openai.com";
const RESOURCE: &str = "https://api.openai.com/v1";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const SCOPE: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const SERVICE: &str = "NOEMA-ChatGPT-SIWC";

#[derive(Default)]
pub struct ChatGptState {
    // Also serialize refresh and credential rotation. The desktop single-instance
    // plugin prevents a second process from racing the same rotating session.
    operation: AsyncMutex<()>,
    cancel: Mutex<Option<watch::Sender<bool>>>,
}
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() }
fn secret(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|_| "Windows credential storage is unavailable".into())
}
fn client() -> Result<Client, String> {
    Client::builder().redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15)).timeout(Duration::from_secs(30))
        .build().map_err(|_| "Could not initialize the ChatGPT connection".into())
}
fn required<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().filter(|s| !s.is_empty()).ok_or_else(|| format!("ChatGPT returned no {key}"))
}
fn has_scope(scope: &str) -> bool { scope.split_whitespace().any(|s| s == "chatgpt.tokens.use.direct") }
fn empty_vault() -> Value { json!({"accounts": [], "active": null}) }
fn read_manifest() -> Result<Option<Value>, String> {
    match secret("vault")?.get_password() {
        Ok(s) => serde_json::from_str(&s).map(Some).map_err(|_| "ChatGPT credential index is damaged".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Could not read ChatGPT credentials".into()),
    }
}
fn manifest_parts(v: &Value) -> Result<(&str, usize), String> {
    let generation = required(v, "generation")?;
    let parts = v["parts"].as_u64().filter(|n| *n > 0 && *n <= 256)
        .ok_or("Invalid ChatGPT credential index")? as usize;
    Ok((generation, parts))
}
fn load_vault() -> Result<Value, String> {
    let Some(manifest) = read_manifest()? else { return Ok(empty_vault()) };
    let (generation, parts) = manifest_parts(&manifest)?;
    let mut encoded = String::new();
    for i in 0..parts {
        encoded.push_str(&secret(&format!("{generation}/{i}"))?.get_password()
            .map_err(|_| "Could not read protected ChatGPT credentials")?);
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| "ChatGPT credentials are damaged")?;
    let vault: Value = serde_json::from_slice(&bytes).map_err(|_| "ChatGPT credentials are damaged")?;
    if !vault["accounts"].is_array() { return Err("ChatGPT account list is damaged".into()) }
    Ok(vault)
}
fn delete_parts(manifest: &Value) {
    if let Ok((generation, parts)) = manifest_parts(manifest) {
        for i in 0..parts { if let Ok(e) = secret(&format!("{generation}/{i}")) { let _ = e.delete_credential(); } }
    }
}
fn save_vault(vault: &Value) -> Result<(), String> {
    let old = read_manifest()?;
    // Windows generic credentials have a small per-entry limit. Encode to ASCII
    // and split into conservative chunks. Switch the index only after all chunks
    // are saved, so failed writes cannot overwrite a working token set.
    let encoded = STANDARD.encode(serde_json::to_vec(vault).map_err(|_| "Cannot save ChatGPT accounts")?);
    let chunks: Vec<_> = encoded.as_bytes().chunks(1000).collect();
    if chunks.len() > 256 { return Err("Too many saved ChatGPT accounts".into()) }
    let generation = Uuid::new_v4().to_string();
    let manifest = json!({"generation": generation, "parts": chunks.len()});
    for (i, chunk) in chunks.iter().enumerate() {
        let value = std::str::from_utf8(chunk).map_err(|_| "Cannot encode credentials")?;
        if secret(&format!("{generation}/{i}"))?.set_password(value).is_err() {
            delete_parts(&manifest); return Err("Could not protect ChatGPT credentials".into());
        }
    }
    if secret("vault")?.set_password(&manifest.to_string()).is_err() {
        delete_parts(&manifest); return Err("Could not save ChatGPT credential index".into());
    }
    if let Some(old) = old { delete_parts(&old); }
    Ok(())
}
fn host_id() -> Result<String, String> {
    let e = secret("host-id")?;
    match e.get_password() {
        Ok(id) => Ok(id),
        Err(keyring::Error::NoEntry) => {
            let id = format!("urn:uuid:{}", Uuid::new_v4());
            e.set_password(&id).map_err(|_| "Could not save this installation's host ID")?; Ok(id)
        }
        Err(_) => Err("Could not read this installation's host ID".into()),
    }
}
fn public_status(vault: &Value) -> Value {
    let accounts: Vec<Value> = vault["accounts"].as_array().into_iter().flatten().map(|a| json!({
        "id": a["client_id"], "label": a["label"], "connected": a["access_token"].as_str().is_some()
    })).collect();
    let connected = vault["accounts"].as_array().into_iter().flatten().any(|a|
        a["client_id"] == vault["active"] && a["access_token"].as_str().is_some());
    json!({"accounts": accounts, "active": vault["active"], "connected": connected})
}
#[tauri::command]
pub async fn chatgpt_status(state: State<'_, ChatGptState>) -> Result<Value, String> {
    let _guard = state.operation.lock().await; Ok(public_status(&load_vault()?))
}
fn random_string() -> String { format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple()) }
fn authorization_url(host: &str, redirect: &str, state: &str, nonce: &str, verifier: &str, saved: Option<&Value>) -> Result<Url, String> {
    let mut url = Url::parse(&format!("{AUTH}/api/accounts/authorize")).map_err(|_| "Invalid authorization address")?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", saved.and_then(|v| v["client_id"].as_str()).unwrap_or("dynamic_agent_client"))
            .append_pair("ext_agent_host_id", host).append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect).append_pair("scope", SCOPE).append_pair("resource", RESOURCE)
            .append_pair("state", state).append_pair("nonce", nonce).append_pair("code_challenge_method", "S256")
            .append_pair("code_challenge", &challenge);
        if let Some(saved) = saved {
            if let Some(hint) = saved["id_token"].as_str() { q.append_pair("id_token_hint", hint); }
        } else { q.append_pair("agent_name_hint", "NOEMA"); }
    }
    Ok(url)
}
async fn open_browser(app: &AppHandle, url: &Url) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::ptr::null;
        use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

        // Both URLs are constructed by NOEMA. Pass the URL as the Shell's
        // target so Windows dispatches it to the registered HTTPS handler.
        let url: Vec<u16> = url.as_str().encode_utf16().chain([0]).collect();
        let verb: Vec<u16> = "open".encode_utf16().chain([0]).collect();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            // SAFETY: Both UTF-16 buffers are NUL-terminated and live through
            // this call. The optional parameters and directory are null.
            let result = unsafe {
                ShellExecuteW(
                    std::ptr::null_mut(),
                    verb.as_ptr(),
                    url.as_ptr(),
                    null(),
                    null(),
                    SW_SHOWNORMAL,
                )
            } as isize;
            let _ = sender.send(result);
        })
        .map_err(|_| "NOEMA could not request a browser window. Restart NOEMA and try again.")?;

        let result = receiver.await.map_err(|_| "The browser launch was interrupted.")?;
        if result <= 32 {
            return Err(format!(
                "Windows could not open your browser (code {result}). Choose a default browser in Windows Settings → Apps → Default apps, then try again."
            ));
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, url);
        Err("ChatGPT sign-in is currently supported in NOEMA for Windows".into())
    }
}
fn callback_fields(target: &str, expected_state: &str, selected: Option<&str>) -> Result<(String, String), String> {
    if !target.starts_with("/auth/callback?") { return Err("Unexpected callback path".into()) }
    let url = Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| "Invalid callback")?;
    let mut fields = HashMap::new();
    for (k, v) in url.query_pairs() {
        if fields.insert(k.to_string(), v.to_string()).is_some() { return Err("Duplicate callback field".into()) }
    }
    if fields.get("state").map(String::as_str) != Some(expected_state) { return Err("Sign-in state did not match".into()) }
    if fields.contains_key("error") { return Err("ChatGPT sign-in was declined. You can try again and allow plan usage.".into()) }
    let code = fields.get("code").filter(|s| !s.is_empty()).ok_or("ChatGPT returned no authorization code")?.clone();
    let client_id = match (selected, fields.get("client_id")) {
        (Some(saved), Some(id)) if saved != id => return Err("ChatGPT returned a different account registration".into()),
        (Some(saved), _) => saved.to_string(),
        (None, Some(id)) if !id.is_empty() && id != "dynamic_agent_client" => id.clone(),
        _ => return Err("ChatGPT registration did not return an issued client ID".into()),
    };
    Ok((code, client_id))
}
async fn receive_callback(listener: &TcpListener, state: &str, selected: Option<&str>) -> Result<(String, String), String> {
    loop {
        let (mut socket, _) = listener.accept().await.map_err(|_| "Sign-in callback listener stopped")?;
        let mut bytes = Vec::new();
        let read = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                let mut buffer = [0; 1024];
                let n = socket.read(&mut buffer).await.map_err(|_| "Cannot read sign-in callback")?;
                if n == 0 { return Err("Incomplete callback") }
                bytes.extend_from_slice(&buffer[..n]);
                if bytes.len() > 16384 { return Err("Callback too large") }
                if bytes.windows(4).any(|s| s == b"\r\n\r\n") { return Ok(()) }
            }
        }).await;
        if !matches!(read, Ok(Ok(()))) { continue }
        let Ok(request) = std::str::from_utf8(&bytes) else { continue };
        let mut line = request.lines().next().unwrap_or("").split_whitespace();
        if line.next() != Some("GET") { continue }
        let target = line.next().unwrap_or("");
        if !target.starts_with("/auth/callback?") { continue }
        let result = callback_fields(target, state, selected);
        // Invalid-state requests must not consume the real pending attempt.
        let valid_state = Url::parse(&format!("http://127.0.0.1{target}")).ok().is_some_and(|u|
            u.query_pairs().filter(|(k, _)| k == "state").map(|(_, v)| v.to_string()).collect::<Vec<_>>() == vec![state.to_string()]);
        let body = if result.is_ok() { "Sign-in received. Return to NOEMA to finish connecting." } else { "Sign-in could not be accepted. Return to NOEMA." };
        let response = format!("HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        let _ = tokio::time::timeout(Duration::from_secs(2), socket.write_all(response.as_bytes())).await;
        if valid_state { return result }
    }
}
async fn token_request(http: &Client, fields: &[(&str, &str)]) -> Result<Value, String> {
    let response = http.post(TOKEN).form(fields).send().await.map_err(|_| "Could not contact ChatGPT sign-in. Check your connection and try again.")?;
    if !response.status().is_success() {
        return Err("ChatGPT could not renew or finish this sign-in. Continue with the saved account to sign in again.".into())
    }
    response.json().await.map_err(|_| "ChatGPT returned unreadable credentials".into())
}
fn trusted_auth_endpoint(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|_| "Invalid OpenAI identity endpoint")?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("auth.openai.com") || parsed.port().is_some()
        || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Unexpected OpenAI identity endpoint".into())
    }
    Ok(parsed)
}
async fn discovery(http: &Client) -> Result<Value, String> {
    let r = http.get(format!("{AUTH}/.well-known/openid-configuration")).send().await
        .map_err(|_| "Could not verify the OpenAI sign-in service")?;
    if !r.status().is_success() { return Err("OpenAI sign-in discovery failed".into()) }
    let v: Value = r.json().await.map_err(|_| "Unreadable OpenAI sign-in configuration")?;
    if v["issuer"] != AUTH { return Err("Unexpected OpenAI identity issuer".into()) } Ok(v)
}
async fn validated_identity(http: &Client, token: &str, client_id: &str, nonce: &str) -> Result<Value, String> {
    let config = discovery(http).await?;
    let url = trusted_auth_endpoint(required(&config, "jwks_uri")?)?;
    let r = http.get(url).send().await.map_err(|_| "Could not download OpenAI signing keys")?;
    if !r.status().is_success() { return Err("Could not verify OpenAI signing keys".into()) }
    let keys: JwkSet = r.json().await.map_err(|_| "Invalid OpenAI signing keys")?;
    let header = decode_header(token).map_err(|_| "Invalid OpenAI identity token")?;
    if !matches!(header.alg, Algorithm::RS256 | Algorithm::ES256) { return Err("Unsupported identity signature".into()) }
    let key = keys.find(header.kid.as_deref().ok_or("Identity token has no signing key")?).ok_or("Unknown OpenAI signing key")?;
    let key = DecodingKey::from_jwk(key).map_err(|_| "Invalid OpenAI signing key")?;
    let mut validation = Validation::new(header.alg);
    validation.set_audience(&[client_id]); validation.set_issuer(&[AUTH]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.validate_nbf = true;
    let claims = decode::<Value>(token, &key, &validation).map_err(|_| "OpenAI identity verification failed")?.claims;
    if claims["nonce"].as_str() != Some(nonce) { return Err("OpenAI identity nonce did not match".into()) }
    required(&claims, "sub")?; Ok(claims)
}
fn apply_tokens(account: &mut Value, token: &Value, refreshing: bool) -> Result<(), String> {
    let access = required(token, "access_token")?;
    let refresh = required(token, "refresh_token")?;
    let scope = token["scope"].as_str().or_else(|| if refreshing { account["scope"].as_str() } else { None }).ok_or("ChatGPT did not grant plan access")?;
    if !has_scope(scope) { return Err("ChatGPT plan usage was not authorized. Sign in again and allow NOEMA to use your plan.".into()) }
    if !token["token_type"].as_str().is_some_and(|s| s.eq_ignore_ascii_case("Bearer")) {
        return Err("ChatGPT returned an unsupported credential type".into())
    }
    let expiry = token["expires_in"].as_u64().filter(|n| *n > 0 && *n <= 86400).ok_or("Invalid ChatGPT credential expiry")?;
    let scope = scope.to_string();
    account["access_token"] = json!(access); account["refresh_token"] = json!(refresh);
    account["scope"] = json!(scope); account["expires_at"] = json!(now() + expiry);
    if !refreshing { account["id_token"] = json!(required(token, "id_token")?); }
    Ok(())
}
#[tauri::command]
pub async fn chatgpt_login(app: AppHandle, state: State<'_, ChatGptState>, account_id: Option<String>) -> Result<Value, String> {
    let _guard = state.operation.try_lock().map_err(|_| "A ChatGPT operation is already in progress")?;
    let mut vault = load_vault()?;
    let saved = if let Some(id) = account_id {
        Some(vault["accounts"].as_array().unwrap().iter().find(|a| a["client_id"] == id).cloned().ok_or("Unknown saved ChatGPT account")?)
    } else { None };
    let host = host_id()?;
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|_| "Could not start local sign-in callback")?;
    let port = listener.local_addr().map_err(|_| "Could not read callback port")?.port();
    let redirect = format!("http://127.0.0.1:{port}/auth/callback");
    let oauth_state = random_string(); let nonce = random_string(); let verifier = random_string();
    let url = authorization_url(&host, &redirect, &oauth_state, &nonce, &verifier, saved.as_ref())?;
    let (cancel, mut canceled) = watch::channel(false);
    *state.cancel.lock().map_err(|_| "Sign-in lock unavailable")? = Some(cancel);
    let flow = async {
        open_browser(&app, &url).await?;
        let selected = saved.as_ref().and_then(|a| a["client_id"].as_str());
        let (code, issued) = receive_callback(&listener, &oauth_state, selected).await?;
        let suffix: String = issued.chars().rev().take(8).collect::<String>().chars().rev().collect();
        // Keep a newly issued registration even if exchanging its one-use code
        // fails. A retry must reuse it instead of creating duplicate clients.
        if saved.is_none() && !vault["accounts"].as_array().unwrap().iter().any(|a| a["client_id"] == issued) {
            vault["accounts"].as_array_mut().unwrap().push(json!({
                "client_id": issued, "label": format!("Pending ChatGPT sign-in · {suffix}")
            }));
            save_vault(&vault)?;
        }
        let http = client()?;
        let token = token_request(&http, &[("grant_type", "authorization_code"), ("client_id", &issued),
            ("code", &code), ("code_verifier", &verifier), ("redirect_uri", &redirect), ("resource", RESOURCE)]).await?;
        let claims = validated_identity(&http, required(&token, "id_token")?, &issued, &nonce).await?;
        if let Some(saved) = &saved { if saved["subject"].is_string() && saved["subject"] != claims["sub"] { return Err("The signed-in account does not match the selected registration".into()) } }
        let mut account = saved.clone().unwrap_or_else(|| json!({"client_id": issued, "subject": claims["sub"]}));
        account["subject"] = claims["sub"].clone();
        let email = claims["email"].as_str().unwrap_or("ChatGPT account");
        account["label"] = json!(format!("{email} · {suffix}"));
        apply_tokens(&mut account, &token, false)?;
        let accounts = vault["accounts"].as_array_mut().unwrap();
        if let Some(index) = accounts.iter().position(|a| a["client_id"] == issued) { accounts[index] = account; }
        else { accounts.push(account); }
        vault["active"] = json!(issued); save_vault(&vault)?; Ok(public_status(&vault))
    };
    let result = tokio::select! {
        result = tokio::time::timeout(Duration::from_secs(300), flow) => result.unwrap_or_else(|_| Err("ChatGPT sign-in timed out. Try again.".into())),
        _ = canceled.changed() => Err("ChatGPT sign-in canceled".into()),
    };
    *state.cancel.lock().map_err(|_| "Sign-in lock unavailable")? = None;
    result
}
#[tauri::command]
pub fn chatgpt_cancel_login(state: State<'_, ChatGptState>) -> Result<(), String> {
    if let Some(sender) = state.cancel.lock().map_err(|_| "Sign-in lock unavailable")?.as_ref() { let _ = sender.send(true); } Ok(())
}
#[tauri::command]
pub async fn chatgpt_select(state: State<'_, ChatGptState>, account_id: String) -> Result<Value, String> {
    let _guard = state.operation.lock().await; let mut vault = load_vault()?;
    if !vault["accounts"].as_array().unwrap().iter().any(|a| a["client_id"] == account_id && a["access_token"].is_string()) {
        return Err("Sign in to that saved account first".into())
    }
    vault["active"] = json!(account_id); save_vault(&vault)?; Ok(public_status(&vault))
}
async fn active_token(vault: &mut Value, http: &Client) -> Result<String, String> {
    let index = vault["accounts"].as_array().unwrap().iter().position(|a| a["client_id"] == vault["active"])
        .ok_or("Continue with ChatGPT in NOEMA first")?;
    if vault["accounts"][index]["expires_at"].as_u64().unwrap_or(0) <= now() + 60 {
        let a = &vault["accounts"][index];
        let token = token_request(http, &[("grant_type", "refresh_token"), ("client_id", required(a, "client_id")?),
            ("refresh_token", required(a, "refresh_token")?), ("resource", RESOURCE)]).await?;
        apply_tokens(&mut vault["accounts"][index], &token, true)?; save_vault(vault)?;
    }
    required(&vault["accounts"][index], "access_token").map(str::to_string)
}
fn request_error(status: reqwest::StatusCode) -> String {
    match status.as_u16() {
        401 => "ChatGPT authorization expired or was revoked. Continue with your saved account to sign in again.".into(),
        403 => "ChatGPT plan access is unavailable for this account or model. Check access in ChatGPT Settings → Usage.".into(),
        429 => "Your ChatGPT plan allowance is currently unavailable. Check ChatGPT Settings → Usage and try later. NOEMA will not switch to paid API billing.".into(),
        _ => format!("ChatGPT request failed ({status}). Your original message is preserved."),
    }
}
#[tauri::command]
pub async fn chatgpt_models(state: State<'_, ChatGptState>) -> Result<Value, String> {
    let _guard = state.operation.lock().await; let mut vault = load_vault()?; let http = client()?;
    let token = active_token(&mut vault, &http).await?;
    let r = http.get(format!("{RESOURCE}/models")).bearer_auth(token).send().await.map_err(|_| "Could not load ChatGPT models")?;
    if !r.status().is_success() { return Err(request_error(r.status())) }
    let body: Value = r.json().await.map_err(|_| "Unreadable ChatGPT model list")?;
    let models: Vec<_> = body["models"].as_array().ok_or("ChatGPT returned no model catalog")?.iter()
        .filter(|m| m["visibility"] == "list" && m["slug"].is_string() && m["display_name"].is_string())
        .map(|m| json!({"id": m["slug"], "label": m["display_name"]})).collect();
    Ok(json!({"models": models}))
}
#[tauri::command]
pub async fn chatgpt_open_usage(app: AppHandle) -> Result<(), String> {
    let url = Url::parse("https://chatgpt.com/settings/usage").map_err(|_| "Invalid usage URL")?;
    open_browser(&app, &url).await
}
#[tauri::command]
pub async fn chatgpt_logout(state: State<'_, ChatGptState>, account_id: String) -> Result<Value, String> {
    let _guard = state.operation.lock().await; let mut vault = load_vault()?;
    let index = vault["accounts"].as_array().unwrap().iter().position(|a| a["client_id"] == account_id).ok_or("Unknown ChatGPT account")?;
    let a = &vault["accounts"][index];
    let refresh = a["refresh_token"].as_str().map(str::to_string);
    let http = client()?;
    let revoked = if let Some(refresh) = refresh {
        let attempt = async {
            let config = discovery(&http).await?;
            let url = trusted_auth_endpoint(required(&config, "revocation_endpoint")?)?;
            for delay in [0, 1, 2] {
                tokio::time::sleep(Duration::from_secs(delay)).await;
                match http.post(url.clone()).form(&[("token", refresh.as_str()), ("token_type_hint", "refresh_token"), ("client_id", account_id.as_str())]).send().await {
                    Ok(r) if r.status().as_u16() == 200 => return Ok::<bool, String>(true),
                    Ok(r) if !r.status().is_server_error() => return Ok(false),
                    _ => (),
                }
            } Ok(false)
        };
        tokio::time::timeout(Duration::from_secs(35), attempt).await.ok().and_then(Result::ok).unwrap_or(false)
    } else { true };
    let account = &mut vault["accounts"][index];
    for key in ["access_token", "refresh_token", "id_token", "expires_at", "scope"] { account.as_object_mut().unwrap().remove(key); }
    if vault["active"] == account_id { vault["active"] = Value::Null; }
    save_vault(&vault)?;
    let mut status = public_status(&vault); status["revoked"] = json!(revoked); Ok(status)
}

/// Byte-based SSE framing tolerates network chunks splitting UTF-8 or CRLF.
#[derive(Default)]
struct ResponseStream { line: Vec<u8>, data: Vec<String>, text: String, completed: bool }
impl ResponseStream {
    fn event(&mut self) -> Result<(), String> {
        if self.data.is_empty() { return Ok(()) }
        let data = self.data.join("\n"); self.data.clear();
        if data == "[DONE]" { return Ok(()) }
        let event: Value = serde_json::from_str(&data).map_err(|_| "ChatGPT returned an invalid stream event")?;
        match event["type"].as_str().unwrap_or("") {
            "response.output_text.delta" => {
                self.text.push_str(event["delta"].as_str().ok_or("Invalid ChatGPT text event")?);
                if self.text.len() > 2_000_000 { return Err("ChatGPT reply was too large".into()) }
            }
            "response.completed" => self.completed = true,
            "response.failed" | "response.incomplete" | "error" => {
                let code = event["response"]["error"]["code"].as_str().or_else(|| event["code"].as_str()).unwrap_or("");
                return Err(if matches!(code, "subscription_sharing_usage_limit_exceeded" | "subscription_sharing_usage_unavailable") {
                    "Your ChatGPT plan allowance is unavailable. Check ChatGPT Settings → Usage. Your original message is preserved."
                } else { "ChatGPT did not complete the reply. Your original message is preserved; try again." }.into());
            }
            _ => (),
        } Ok(())
    }
    fn push(&mut self, bytes: &[u8], eof: bool) -> Result<(), String> {
        for byte in bytes {
            if *byte == b'\n' {
                let line = std::str::from_utf8(&self.line).map_err(|_| "Invalid ChatGPT stream encoding")?.trim_end_matches('\r').to_string();
                self.line.clear();
                if line.is_empty() { self.event()?; }
                else if let Some(data) = line.strip_prefix("data:") {
                    self.data.push(data.strip_prefix(' ').unwrap_or(data).to_string());
                    if self.data.iter().map(String::len).sum::<usize>() > 8_000_000 { return Err("ChatGPT stream event was too large".into()) }
                }
            } else {
                self.line.push(*byte);
                if self.line.len() > 8_000_000 { return Err("ChatGPT stream event was too large".into()) }
            }
        }
        if eof { if !self.line.is_empty() { self.push(b"\n", false)?; } self.event()?; } Ok(())
    }
    fn finish(self) -> Result<String, String> {
        if !self.completed || self.text.trim().is_empty() { return Err("ChatGPT stream ended without a complete reply. Your original message is preserved.".into()) }
        Ok(self.text)
    }
}
pub async fn reply(state: &ChatGptState, model: &str, instructions: &str, messages: &[Value]) -> Result<String, String> {
    let _guard = state.operation.lock().await; let mut vault = load_vault()?; let http = client()?;
    let token = active_token(&mut vault, &http).await?;
    let input: Vec<Value> = messages.iter().filter(|m| m["role"] == "user" || m["role"] == "assistant").cloned().collect();
    let mut r = http.post(format!("{RESOURCE}/responses")).timeout(Duration::from_secs(240)).bearer_auth(token).json(&json!({
        "model": model, "instructions": instructions, "input": input, "store": false, "stream": true
    })).send().await.map_err(|_| "Could not contact ChatGPT. Your original message is preserved.")?;
    if !r.status().is_success() { return Err(request_error(r.status())) }
    let mut stream = ResponseStream::default();
    while let Some(chunk) = r.chunk().await.map_err(|_| "ChatGPT connection was interrupted. Your original message is preserved.")? {
        stream.push(&chunk, false)?;
    }
    stream.push(&[], true)?; stream.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn oauth_requires_state_and_issued_registration() {
        assert!(callback_fields("/auth/callback?state=wrong&code=c&client_id=oaiapp_a", "right", None).is_err());
        assert!(callback_fields("/auth/callback?state=s&code=c", "s", None).is_err());
        assert!(callback_fields("/auth/callback?state=s&code=c&client_id=dynamic_agent_client", "s", None).is_err());
        assert!(callback_fields("/auth/callback?state=s&state=s&code=c&client_id=x", "s", None).is_err());
        assert!(callback_fields("/auth/callback?state=s&error=access_denied", "s", None).is_err());
        assert!(callback_fields("/auth/callback?state=s&code=c&client_id=other", "s", Some("original")).is_err());
        assert_eq!(callback_fields("/auth/callback?state=s&code=c", "s", Some("original")).unwrap(), ("c".into(), "original".into()));
    }
    #[test]
    fn oauth_uses_pkce_and_reuses_registration() {
        let url = authorization_url("urn:uuid:host", "http://127.0.0.1:1234/auth/callback", "s", "n", "verifier", None).unwrap();
        let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "dynamic_agent_client"); assert_eq!(q["agent_name_hint"], "NOEMA");
        assert_eq!(q["code_challenge"], URL_SAFE_NO_PAD.encode(Sha256::digest(b"verifier")));
        let saved = json!({"client_id":"oaiapp_saved", "id_token":"hint"});
        let url = authorization_url("host", "http://127.0.0.1:2/auth/callback", "s", "n", "v", Some(&saved)).unwrap();
        let q: HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "oaiapp_saved"); assert!(!q.contains_key("agent_name_hint"));
    }
    #[test]
    fn identity_endpoints_cannot_redirect_tokens() {
        for u in ["http://auth.openai.com/keys", "https://evil.com/keys", "https://auth.openai.com.evil.com/keys", "https://auth.openai.com:8443/keys", "https://person@auth.openai.com/keys"] { assert!(trusted_auth_endpoint(u).is_err()); }
    }
    #[test]
    fn stream_handles_split_utf8_and_requires_completion() {
        let data = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"café\"}\r\n\r\ndata: {\"type\":\"response.completed\"}\n\n";
        let mut stream = ResponseStream::default();
        for byte in data.as_bytes() { stream.push(&[*byte], false).unwrap(); }
        stream.push(&[], true).unwrap(); assert_eq!(stream.finish().unwrap(), "café");
        let mut broken = ResponseStream::default(); broken.push(b"data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}\n\n", true).unwrap();
        assert!(broken.finish().is_err());
    }
    #[test]
    fn late_plan_failure_never_saves_partial_output() {
        let mut stream = ResponseStream::default();
        assert!(stream.push(b"data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}\n\n", true).unwrap_err().contains("allowance"));
    }
    #[test]
    fn public_status_never_exposes_tokens() {
        let status = public_status(&json!({"active":"a", "accounts":[{"client_id":"a","label":"Writer","access_token":"secret", "refresh_token":"refresh", "id_token":"identity"}]}));
        assert_eq!(status["connected"], true); assert!(!status.to_string().contains("secret"));
    }
    #[test]
    fn missing_plan_permission_does_not_replace_saved_credentials() {
        let mut account = json!({"access_token":"original", "refresh_token":"original-refresh", "scope":"chatgpt.tokens.use.direct"});
        let before = account.clone();
        let denied = json!({"access_token":"new", "refresh_token":"new-refresh", "scope":"openid email", "token_type":"Bearer", "expires_in":3600});
        assert!(apply_tokens(&mut account, &denied, true).is_err());
        assert_eq!(account, before);
        let renewed = json!({"access_token":"new", "refresh_token":"rotated", "token_type":"Bearer", "expires_in":3600});
        apply_tokens(&mut account, &renewed, true).unwrap();
        assert_eq!(account["refresh_token"], "rotated");
        assert_eq!(account["scope"], "chatgpt.tokens.use.direct");
    }
}
