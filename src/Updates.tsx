import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { errorText } from "./api";

type Status = {installed:string;authorized:boolean;source:string;requires_manual_approval:boolean};
type UpdateInfo = {available:boolean;installed:string;version?:string;run_id?:number;url?:string};
export default function Updates({
  beforeInstall, onError,
}:{
  beforeInstall:()=>Promise<void>;
  onError:(message:string)=>void;
}) {
  const [state,setState]=useState<Status|null>(null);
  const [newVersion,setNewVersion]=useState<UpdateInfo|null>(null);
  const [token,setToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    if(!isTauri())return;
    const current=await invoke<Status>("update_status");
    setState(current);
    try{setNewVersion(await invoke<UpdateInfo>("update_check"))}
    catch(e){setMessage("Automatic check: "+errorText(e)+". If this repository is private, connect GitHub access below.")}
  },[]);
  useEffect(()=>{void load().catch(e=>onError(errorText(e)))},[load,onError]);
  async function saveToken(){
    setBusy(true);setMessage("");
    try{
      await invoke("update_connect",{token});
      setToken("");
      setMessage("Private GitHub access saved in Windows Credential Manager.");
      await load();
    }catch(e){onError(errorText(e))}
    finally{setBusy(false)}
  }
  async function disconnect(){
    setBusy(true);
    try{
      await invoke("update_disconnect");
      setState(s=>s?{...s,authorized:false}:s);
      setNewVersion(null);setMessage("Private GitHub access removed.");
    }catch(e){onError(errorText(e))}
    finally{setBusy(false)}
  }
  async function check(){
    setBusy(true);setMessage("Checking successful private GitHub builds…");
    try{
      setNewVersion(await invoke<UpdateInfo>("update_check"));
      setMessage("");
    }catch(e){onError(errorText(e));setMessage("")}
    finally{setBusy(false)}
  }
  async function install(){
    if(!newVersion?.version)return;
    if(!window.confirm("Install NOEMA "+newVersion.version+" now? NOEMA will save your writing, make a complete local backup, and close while Windows installs it. Open NOEMA again afterward."))return;
    setBusy(true);
    try{
      await beforeInstall();
      setMessage("Downloading and verifying update, then backing up your writing. Keep NOEMA open until it closes itself.");
      await invoke("update_install",{expectedVersion:newVersion.version});
    }catch(e){onError(errorText(e));setBusy(false)}
  }
  if(!isTauri())return <section><h2>NOEMA updates</h2><p>Private Windows updates are only available inside the installed desktop app.</p></section>;
  return <section className="noema-updater">
    <div className="eyebrow">GITHUB IN-APP UPDATE SERVICE</div>
    <h2>NOEMA updates</h2>
    <p>Installed version: <strong>{state?.installed??"Checking…"}</strong></p>
    <p>Check GitHub for a newer Windows build, download it inside NOEMA, verify the SHA-256 artifact digest,
      create a safety backup, then update after closing the editor. No browser download is needed once this updater is installed.</p>
    <div className="row"><button className="primary" onClick={()=>void check()} disabled={busy}>
      {busy?"Working…":"Check GitHub for updates"}</button></div>
    {!state?.authorized ? <details className="updater-auth"><summary>Connect GitHub token if updates are private or access fails</summary>
      <h3>Optional private GitHub access</h3>
      <p>To keep NOEMA private, authorize downloads with a <strong>fine-grained GitHub access token</strong> for
        <code>StrokeDot/NOEMA</code>. Grant only <strong>Actions: Read</strong> for this repository.
        Set an expiration and never share the token in chat or commit it to GitHub.</p>
      <button type="button" disabled={busy} onClick={()=>void invoke("open_github_token_setup")
        .catch(e=>onError(errorText(e)))}>Open GitHub token setup</button>
      <label>GitHub access token
        <input type="password" autoComplete="off" spellCheck={false}
          placeholder="Paste your fine-grained read-only GitHub token"
          aria-label="GitHub access token" value={token} onChange={e=>setToken(e.target.value)} />
      </label>
      <button className="primary" disabled={busy||token.trim().length<20} onClick={()=>void saveToken()}>
        {busy?"Connecting…":"Save private GitHub access"}
      </button>
      <p className="muted">The token is stored in Windows Credential Manager, not your manuscript database or application package.
        You may disconnect at any time.</p>
    </details> : <div className="updater-connected">
      <p><span className="local-dot"/> GitHub authorization is saved securely.</p>
      <div className="row">
        <button onClick={()=>void check()} disabled={busy}>{busy?"Checking…":"Check for updates"}</button>
        <button onClick={()=>void disconnect()} disabled={busy}>Disconnect GitHub</button>
      </div>
    </div>}
    {newVersion?.available ? <div className="updater-available">
        <h3>NOEMA {newVersion.version} is available</h3>
        <p>A successful main-branch Windows installer was found. Your writing will be backed up before installation.</p>
        <button className="primary" disabled={busy} onClick={()=>void install()}>
          {busy?"Preparing update…":"Install update and close NOEMA"}
        </button>
        {newVersion.url && <p className="micro">Build: {newVersion.url}</p>}
      </div> : newVersion && <p className="notice">You are using the newest successful Windows version available to this updater.</p>}
    {message&&<p className="notice" role="status">{message}</p>}
    <p className="muted">Security limitation: this updater verifies GitHub Actions artifacts by SHA-256 (optionally authenticated).
      It does not yet verify a Tauri update-signing signature or Windows publisher certificate.
      Updates require your approval and a working GitHub connection. Never install an unexpected release. For publicly accessible artifacts a token is not needed; if repository visibility changes to private, configure one above.</p>
  </section>;
}
