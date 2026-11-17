import {useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {errorText} from "./api";
export type HarnessModel={id:string;label:string};
export default function HarnessConnection({models,selected,onSelect,onModels,onContinue}:{
  models:HarnessModel[];selected:string;onSelect:(id:string)=>void;onModels:(models:HarnessModel[])=>void;onContinue?:()=>void;
}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [directory,setDirectory]=useState("");
  async function prepare(){
    setBusy(true);setError("");
    try{
      if(!isTauri())throw new Error("Open NOEMA for Windows to prepare the Harness connection.");
      const result=await invoke<{directory:string}>("harness_prepare");
      setDirectory(result.directory);
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  async function reconnect(){
    setBusy(true);setError("");onModels([]);
    try{
      const result=await invoke<{models:HarnessModel[]}>("harness_models");
      onModels(result.models);
      if(!result.models.length)setError("Sign in to DeepSeek in Harness and enable a DeepSeek model, then reconnect.");
    }catch(e){setError(errorText(e))}finally{setBusy(false)}
  }
  return <section className="chatgpt-connection" aria-label="DeepSeek Harness connection">
    <p>Use your DeepSeek account or API connection managed by DeepSeek Harness on this computer.</p>
    <p className="muted">Harness must be running with the NOEMA writing plugin enabled. Usage follows the account or API balance selected in Harness.</p>
    <div className="dialogue-model-row">
      <button type="button" disabled={busy} onClick={()=>void prepare()}>Prepare Harness connection</button>
      <button type="button" disabled={busy} onClick={()=>void reconnect()}>{busy?"Connecting…":"Reconnect Harness"}</button>
    </div>
    {directory&&<div className="notice">
      <p>One-time setup: install this prepared plugin folder through Harness Plugins, then restart Harness and sign in to DeepSeek there.</p>
      <small>Requires a compatible Harness 0.2.2 preview (0.2.2-rc.4 or later in the 0.2 series).</small>
      <code style={{overflowWrap:"anywhere"}}>{directory}</code>
      <button type="button" onClick={()=>void invoke("harness_open_setup").catch(e=>setError(errorText(e)))}>Open prepared plugin folder</button>
      <details><summary>Install using the Harness launcher</summary>
        <p>If the <code>dsh</code> launcher is installed, run this in PowerShell and restart Harness:</p>
        <code style={{overflowWrap:"anywhere"}}>dsh plugin --profile desktop add '{directory.replaceAll("'","''")}'</code>
      </details>
    </div>}
    {models.length>0&&<label>Harness model<select aria-label="DeepSeek Harness model" value={selected} onChange={e=>onSelect(e.target.value)}>
      {models.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}
    </select></label>}
    {error&&<p role="alert" className="dialogue-connect-error">{error}</p>}
    {onContinue&&<button type="button" className="primary" disabled={busy||!models.some(m=>m.id===selected)} onClick={onContinue}>Continue to your dialogue</button>}
  </section>;
}
