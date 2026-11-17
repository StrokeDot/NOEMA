import {useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {errorText} from "./api";

export type ChatGptAccount={id:string;label:string;connected:boolean};
export type ChatGptStatus={accounts:ChatGptAccount[];active:string|null;connected:boolean;revoked?:boolean};
export type ChatGptModel={id:string;label:string};
export const emptyChatGptStatus:ChatGptStatus={accounts:[],active:null,connected:false};

export default function ChatGptConnection({status,onChange,onContinue,ready=false}:{
  status:ChatGptStatus;onChange:(status:ChatGptStatus)=>void;onContinue?:()=>void;ready?:boolean;
}){
  const [working,setWorking]=useState(false);
  const [signingIn,setSigningIn]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{
    mounted.current=false;
    if(isTauri())void invoke("chatgpt_cancel_login").catch(()=>{});
  }},[]);
  async function perform(action:()=>Promise<ChatGptStatus>){
    if(working)return;
    setWorking(true);setError("");setNotice("");
    try{
      if(!isTauri())throw new Error("Open NOEMA for Windows to connect your ChatGPT account.");
      const result=await action();
      if(!mounted.current)return;
      onChange(result);
      if(result.revoked===false)setNotice("Signed out on this computer. Remote revocation was not confirmed; disconnect NOEMA in ChatGPT Settings → Usage.");
    }catch(e){if(mounted.current)setError(errorText(e))}
    finally{if(mounted.current){setWorking(false);setSigningIn(false)}}
  }
  function login(accountId:string|null){
    setSigningIn(true);
    void perform(()=>invoke<ChatGptStatus>("chatgpt_login",{accountId}));
  }
  return <section className="chatgpt-connection" aria-label="ChatGPT subscription connection">
    <p>Use your eligible ChatGPT plan to write in NOEMA. Sign in and authorize NOEMA in your browser.</p>
    <p className="muted">Usage shares your ChatGPT plan allowance. Your writing context comes from NOEMA; your ChatGPT conversations and memory are not imported.</p>
    {status.accounts.length>0&&<div className="chatgpt-accounts">
      {status.accounts.map(account=><div key={account.id} className="chatgpt-account">
        <span>{account.label}{status.active===account.id?" · active":""}</span>
        <div>
          {account.connected&&status.active!==account.id&&<button type="button" disabled={working}
            onClick={()=>void perform(()=>invoke("chatgpt_select",{accountId:account.id}))}>Use account</button>}
          <button type="button" disabled={working} onClick={()=>login(account.id)}>Continue with saved account</button>
          {account.connected&&<button type="button" disabled={working}
            onClick={()=>void perform(()=>invoke("chatgpt_logout",{accountId:account.id}))}>Sign out</button>}
        </div>
      </div>)}
    </div>}
    <div className="dialogue-model-row">
      <button type="button" className="primary" disabled={working} onClick={()=>login(null)}>Continue with ChatGPT</button>
      <button type="button" disabled={!isTauri()} onClick={()=>void invoke("chatgpt_open_usage").catch(e=>setError(errorText(e)))}>Manage ChatGPT usage</button>
      {signingIn&&<button type="button" onClick={()=>void invoke("chatgpt_cancel_login").catch(e=>setError(errorText(e)))}>Cancel sign-in</button>}
    </div>
    {signingIn&&<p role="status">Finish signing in through your browser. NOEMA is waiting for authorization.</p>}
    {error&&<p role="alert" className="dialogue-connect-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {onContinue&&status.connected&&<button type="button" className="primary" disabled={working||!ready} onClick={onContinue}>Continue to your dialogue</button>}
    <small>No API key is needed for this connection. Plan eligibility and limits apply. Requests run from this computer to OpenAI.</small>
  </section>;
}
