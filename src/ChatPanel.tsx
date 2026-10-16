import { useCallback,useEffect,useState } from "react";
import { invoke,isTauri } from "@tauri-apps/api/core";
import { request,errorText } from "./api";
import type { Document,Project } from "./types";
type Message={id:string;role:"user"|"assistant";content:string;provider:string;created_at:number};
type Status={openai_key_saved:boolean};
export default function ChatPanel({
  project,activeChapter,onError,onCreateChapter,onReplaceChapter,onGem,onAttach,
}:{
  project:Project;activeChapter:Document|null;onError:(message:string)=>void;
  onCreateChapter:(title:string,text:string)=>Promise<void>;
  onReplaceChapter:(text:string)=>Promise<void>;
  onGem:(text:string)=>void;
  onAttach:()=>Promise<void>;
}) {
  const [history,setHistory]=useState<Message[]>([]);
  const [input,setInput]=useState("");
  const [provider,setProvider]=useState<"openai"|"ollama">(
    ()=>localStorage.getItem("noema-ai-provider")==="ollama"?"ollama":"openai");
  const [models,setModel]=useState<{openai:string;ollama:string}>({
    openai:localStorage.getItem("noema-openai-model")||"gpt-4.1-mini",
    ollama:localStorage.getItem("noema-ollama-model")||"qwen2.5:7b",
  });
  const [configured,setConfigured]=useState(false);
  const [key,setKey]=useState("");
  const [settings,setSettings]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [working,setWorking]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    setHistory(await request<Message[]>("chat_history",{project_id:project.id}));
  },[project.id]);
  useEffect(()=>{
    let live=true;
    void refresh().catch(e=>{if(live)onError(errorText(e))});
    if(isTauri())void invoke<Status>("ai_status").then(status=>{if(live)setConfigured(status.openai_key_saved)})
      .catch(e=>{if(live)onError(errorText(e))});
    return()=>{live=false};
  },[refresh,onError]);
  useEffect(()=>{localStorage.setItem("noema-ai-provider",provider)},[provider]);
  async function connect(){
    setBusy(true);
    try{
      await invoke("ai_configure",{apiKey:key.trim()});
      setConfigured(true);setKey("");setSettings(false);
      setNotice("API key saved in Windows Credential Manager.");
    }catch(e){onError(errorText(e))}
    finally{setBusy(false)}
  }
  async function send(text:string){
    if(busy||!text.trim())return;
    setBusy(true);setNotice("Retrieving project context and contacting the selected AI…");
    setInput("");
    try{
      const result=await invoke<{content:string}>("ai_reply",{
        projectId:project.id,provider,model:models[provider],message:text.trim(),
      });
      if(result.content)setNotice("");
    }catch(e){
      onError(errorText(e));
      setNotice("The message is saved locally, but no AI reply was received. Check your model connection.");
    }finally{
      try{await refresh()}catch(e){onError(errorText(e))}
      setBusy(false);
    }
  }
  const draft=(text:string)=>{
    setInput("Write finished "+(project.project_type==="Book"?"book chapter":"video script")+
      " prose in my established voice using the project's author framework and relevant sources. "+
      "Return only the proposed writing, and distinguish unverified claims from verified quotations. "+
      "Topic and context: "+text);
  };
  async function proposeChapter(text:string){
    const title=window.prompt("New chapter or draft section title");
    if(!title?.trim())return;
    if(!window.confirm("Create a NEW chapter containing this AI passage? The original response stays in chat, and you can edit the new chapter."))return;
    setWorking(text);
    try{await onCreateChapter(title,text)}
    catch(e){onError(errorText(e))}
    finally{setWorking(null)}
  }
  async function replaceChapter(text:string){
    if(!activeChapter)return;
    if(!window.confirm("REPLACE the text of “"+activeChapter.title+"” with this AI response? NOEMA will preserve the earlier chapter in revision history. Review the AI text before approving."))return;
    setWorking(text);
    try{await onReplaceChapter(text)}
    catch(e){onError(errorText(e))}
    finally{setWorking(null)}
  }
  return <aside className="ai-chat" aria-label="Project AI chat">
    <div className="ai-chat-heading">
      <div><div className="eyebrow">PROJECT WRITING PARTNER</div><h2>Chat and draft</h2></div>
      <button aria-label="AI provider settings" onClick={()=>setSettings(!settings)}>⚙</button>
    </div>
    <p className="ai-chat-intro">Discuss ideas, examine your sources, then choose what belongs in your book. Your manuscript never changes without your approval.</p>
    {settings&&<section className="ai-provider-settings">
      <h3>AI connection</h3>
      <p>ChatGPT Plus does not automatically connect to NOEMA. OpenAI API use is billed separately.
        Ollama runs a model on your PC without an API subscription.</p>
      <label>AI provider<select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}>
        <option value="openai">OpenAI API</option><option value="ollama">Local Ollama</option>
      </select></label>
      <label>Model<input value={models[provider]}
        onChange={e=>setModel({...models,[provider]:e.target.value})}
        onBlur={()=>localStorage.setItem("noema-"+provider+"-model",models[provider])}/></label>
      {provider==="openai"&&<div>
        <p>{configured?"API key saved securely.":"Enter your OpenAI API key (not your ChatGPT login)."}</p>
        <input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}
          placeholder="OpenAI API key" aria-label="OpenAI API key"/>
        <div className="row">
          <button disabled={busy||key.length<25} onClick={()=>void connect()}>Save key</button>
          {configured&&<button disabled={busy} onClick={()=>void invoke("ai_disconnect").then(()=>setConfigured(false))
            .catch(e=>onError(errorText(e)))}>Forget key</button>}
        </div>
      </div>}
      {provider==="ollama"&&<p className="muted">Install Ollama separately, download your selected model, and keep Ollama running locally.</p>}
    </section>}
    <div className="ai-chat-history" role="log" aria-label="Project conversation">
      {history.length===0&&<div className="ai-chat-empty">
        <p>This project's discussion starts here. Author-approved frameworks, established positions, and relevant source passages are available to the selected AI.</p>
        <button onClick={()=>draft("Outline the current project and propose a chapter structure.")}>
          Prepare a chapter outline
        </button>
      </div>}
      {history.map(msg=><article className={"ai-message "+msg.role} key={msg.id}>
        <div className="ai-message-author">{msg.role==="user"?"You":msg.provider==="openai"?"OpenAI":msg.provider==="ollama"?"Ollama":"AI"}</div>
        <div className="ai-message-text">{msg.content}</div>
        {msg.role==="assistant"&&<div className="ai-message-actions">
          <button title="Save this passage as a candidate Writing Gem" onClick={()=>onGem(msg.content)}>❖ Save lines</button>
          <button disabled={!!working} onClick={()=>void proposeChapter(msg.content)}>+ Chapter</button>
          {activeChapter&&<button disabled={!!working} onClick={()=>void replaceChapter(msg.content)}>
            Replace draft…
          </button>}
        </div>}
      </article>)}
      {busy&&<p role="status">Waiting for the AI to respond…</p>}
    </div>
    {notice&&<p role="status" className="ai-chat-notice">{notice}</p>}
    <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send(input)}}>
      <textarea aria-label="Message the writing assistant" rows={4} value={input}
        onChange={e=>setInput(e.target.value)}
        placeholder="Discuss an argument, summarize uploaded references, or ask for a chapter draft…"
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send(input)}}}/>
      <div className="ai-chat-controls">
        <button type="button" onClick={()=>void onAttach().catch(e=>onError(errorText(e)))}>+ Attach source</button>
        <button type="submit" className="primary" disabled={busy||!input.trim()||(!configured&&provider==="openai")}>
          {busy?"Working…":"Send"}
        </button>
      </div>
      {provider==="openai"&&!configured&&<small>Open ⚙ and configure an OpenAI API key to send messages.</small>}
    </form>
  </aside>;
}
