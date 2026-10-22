import {useCallback,useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {request,errorText} from "./api";
import type {Document,Project} from "./types";
type Turn={id:string;original_text:string;interpreted_text:string;interpretation_author_corrected:number;
  assistant_response:string;provider:string;model:string;state:"pending"|"complete";created_at:number};
type Legacy={id:string;role:"user"|"assistant";content:string;provider:string;created_at:number};
type Status={openai_key_saved:boolean};
type RecEvent={results:ArrayLike<{[n:number]:{transcript:string}}>};
type SpeechEngine={lang:string;interimResults:boolean;onresult:((e:RecEvent)=>void)|null;
  onend:(()=>void)|null;onerror:((e:{error:string})=>void)|null;start:()=>void;stop:()=>void};
type SpeechCtor=new()=>SpeechEngine;
const localChoices=[
  {id:"qwen3.5:9b",label:"Qwen 3.5 9B · everyday writing"},
  {id:"gemma4:12b",label:"Gemma 4 12B · writing and analysis"},
  {id:"gpt-oss:20b",label:"GPT-OSS 20B · reasoning (16 GB GPU tight)"},
  {id:"qwen3:14b",label:"Qwen 3 14B · deliberate reasoning"}
];
export default function ChatPanel({project,activeChapter,onError,onCreateChapter,onReplaceChapter,onGem,onAttach,onGoDraft}:{
  project:Project;activeChapter:Document|null;onError:(s:string)=>void;
  onCreateChapter:(title:string,text:string)=>Promise<void>;
  onReplaceChapter:(text:string)=>Promise<void>;
  onGem:(text:string)=>void;onAttach:()=>Promise<void>;onGoDraft:()=>void;
}){
  const [turns,setTurns]=useState<Turn[]>([]);
  const [legacy,setLegacy]=useState<Legacy[]>([]);
  const [input,setInput]=useState("");
  const [provider,setProvider]=useState<"openai"|"ollama">(
    ()=>localStorage.getItem("noema-ai-provider")==="openai"?"openai":"ollama");
  const [models,setModel]=useState({
    openai:localStorage.getItem("noema-openai-model")||"gpt-4.1-mini",
    ollama:localStorage.getItem("noema-ollama-model")||"qwen3.5:9b",
  });
  const [configured,setConfigured]=useState(false);
  const [key,setKey]=useState("");
  const [settings,setSettings]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [dictating,setDictating]=useState(false);
  const [speechLanguage,setSpeechLanguage]=useState("en-US");
  const [working,setWorking]=useState<string|null>(null);
  const speechRef=useRef<SpeechEngine|null>(null);
  const composer=useRef<HTMLTextAreaElement|null>(null);
  const refresh=useCallback(async()=>{
    const [ts,h]=await Promise.all([
      request<Turn[]>("writing_turns",{project_id:project.id}),
      request<Legacy[]>("chat_history",{project_id:project.id})
    ]);
    setTurns(ts);setLegacy(h);
  },[project.id]);
  useEffect(()=>{
    let active=true;
    void refresh().catch(e=>{if(active)onError(errorText(e))});
    if(isTauri())void invoke<Status>("ai_status").then(s=>{if(active)setConfigured(s.openai_key_saved)})
      .catch(e=>{if(active)onError(errorText(e))});
    return()=>{active=false;speechRef.current?.stop()};
  },[refresh,onError]);
  useEffect(()=>{localStorage.setItem("noema-ai-provider",provider)},[provider]);
  async function connect(){
    setBusy(true);
    try{await invoke("ai_configure",{apiKey:key.trim()});setConfigured(true);setKey("");setSettings(false);
      setNotice("API key saved in Windows Credential Manager.")}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  async function send(text:string){
    if(busy||!text.trim())return;
    setBusy(true);setNotice("Keeping your original wording and asking the selected AI…");
    setInput("");
    try{
      await invoke("ai_reply",{projectId:project.id,provider,model:models[provider],message:text});
      setNotice("The original, interpretation, response, and profile candidates are saved.");
    }catch(e){
      onError(errorText(e));
      setNotice("The original input may be saved as a pending turn even if the model failed. Nothing was added to your manuscript.");
    }finally{
      try{await refresh()}catch(e){onError(errorText(e))}
      setBusy(false);
    }
  }
  function dictate(){
    if(dictating){speechRef.current?.stop();return}
    const speechWindow=window as unknown as {SpeechRecognition?:SpeechCtor;webkitSpeechRecognition?:SpeechCtor};
    const Speech=speechWindow.SpeechRecognition||speechWindow.webkitSpeechRecognition;
    if(!Speech){
      composer.current?.focus();
      setNotice("This Windows webview has no built-in speech recognition. Click the message box and press Windows + H to dictate, or type. Fully local Whisper transcription is a separate integration.");
      return;
    }
    try{
      const recognizer=new Speech();recognizer.lang=speechLanguage;recognizer.interimResults=false;
      recognizer.onresult=e=>{
        const phrases:Array<string>=[];
        for(let i=0;i<e.results.length;i++)phrases.push(e.results[i][0].transcript);
        setInput(old=>(old.trim()?old.trim()+" ":"")+phrases.join(" "));
      };
      recognizer.onerror=e=>{setNotice("Speech recognition issue: "+e.error+". You can still use Windows + H.");setDictating(false)};
      recognizer.onend=()=>setDictating(false);
      speechRef.current=recognizer;recognizer.start();setDictating(true);
      setNotice("Listening… Check your speech settings. Browser speech recognition may use a remote service.");
    }catch(e){onError(errorText(e));setDictating(false)}
  }
  async function saveToDraft(turn:Turn,source:"Author original"|"Author meaning"|"AI proposal",text:string){
    try{
      await request("save_draft_item",{project_id:project.id,turn_id:turn.id,source,text});
      setNotice("Added to Conversation Draft as a candidate. Review it before publishing.");
    }catch(e){onError(errorText(e))}
  }
  async function editMeaning(turn:Turn){
    if(turn.state!=="complete")return;
    const correction=window.prompt("How did you really mean this? The original words will not change.",turn.interpreted_text);
    if(correction===null||!correction.trim())return;
    try{await request("correct_turn_meaning",{project_id:project.id,turn_id:turn.id,
      interpreted_text:correction});await refresh();
      setNotice("Interpretation corrected by the writer. Original voice remains unchanged.");
    }catch(e){onError(errorText(e))}
  }
  async function createChapter(text:string){
    const title=window.prompt("New book chapter title");if(!title?.trim())return;
    if(!window.confirm("Create a NEW chapter from this passage? No existing chapter will be overwritten."))return;
    setWorking(text);try{await onCreateChapter(title,text)}catch(e){onError(errorText(e))}
    finally{setWorking(null)}
  }
  async function replaceChapter(text:string){
    if(!activeChapter)return;
    if(!window.confirm("Replace the existing text of "+activeChapter.title+"? Your previous version will remain in revision history."))return;
    setWorking(text);try{await onReplaceChapter(text)}catch(e){onError(errorText(e))}
    finally{setWorking(null)}
  }
  return <aside className="ai-chat writer-chat" aria-label="Project AI chat">
    <div className="ai-chat-heading">
      <div><div className="eyebrow">AUTHOR'S ORIGINAL VOICE</div><h2>Conversation transcript</h2></div>
      <button aria-label="AI provider settings" onClick={()=>setSettings(v=>!v)}>⚙</button>
    </div>
    <p className="ai-chat-intro">Every exchange records: original writer input → interpreted meaning → AI response. Approve book-ready material separately.</p>
    {settings&&<section className="ai-provider-settings">
      <h3>Reasoning model</h3>
      <p>OpenAI uses a separately billed API key. Ollama runs open-weight models locally. NOEMA does not inherit your ChatGPT Plus account.</p>
      <label>Provider
        <select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}>
          <option value="ollama">Free local Ollama</option><option value="openai">OpenAI API</option>
        </select>
      </label>
      <label>Model
        <input value={models[provider]} onChange={e=>setModel({...models,[provider]:e.target.value})}
          onBlur={()=>localStorage.setItem("noema-"+provider+"-model",models[provider])}/>
      </label>
      {provider==="ollama"&&<>
        <p>Suggested installed model names:</p>
        <div className="model-choices">{localChoices.map(m=><button key={m.id} title={m.label}
          onClick={()=>{setModel(prev=>({...prev,ollama:m.id}));localStorage.setItem("noema-ollama-model",m.id)}}>{m.label}</button>)}</div>
        <p className="muted">Models must first be installed in Ollama. NOEMA won't download or replace one automatically.</p>
      </>}
      {provider==="openai"&&<>
        <p>{configured?"OpenAI API key saved.":"Enter a separately billed OpenAI API key."}</p>
        <input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}
          placeholder="API key" aria-label="OpenAI API key"/>
        <button disabled={busy||key.length<25} onClick={()=>void connect()}>Save API key</button>
        {configured&&<button disabled={busy} onClick={()=>void invoke("ai_disconnect").then(()=>setConfigured(false))
          .catch(e=>onError(errorText(e)))}>Forget API key</button>}
      </>}
    </section>}
    <div className="ai-chat-history" role="log" aria-label="Writer conversation history">
      {!turns.length&&!legacy.length&&<div className="ai-chat-empty">
        Talk naturally or dictate an unfinished idea. NOEMA keeps the original even if its grammar is imperfect.
        <p>The AI's interpretation is reviewable; your original sentence stays untouched.</p>
      </div>}
      {legacy.length>0&&<details className="legacy-chat">
        <summary>Earlier chats · preserved original format ({legacy.length} messages)</summary>
        {legacy.map(m=><article key={m.id} className="ai-message">
          <div className="ai-message-author">{m.role==="user"?"Writer":"AI"}</div>
          <div className="ai-message-text">{m.content}</div></article>)}
      </details>}
      {turns.map((turn,index)=><article key={turn.id} className="triplet-turn">
        <div className="triplet-number">Exchange {index+1} · {new Date(turn.created_at).toLocaleDateString()}</div>
        <div className="triplet-layer">
          <div className="ai-message-author">1 · Your exact words {turn.state==="pending"?"· awaiting AI":""}</div>
          <div className="ai-message-text">{turn.original_text}</div>
          <button onClick={()=>void saveToDraft(turn,"Author original",turn.original_text)}>Save original to draft</button>
        </div>
        {turn.state==="complete"&&<>
          <div className="triplet-layer interpretation-layer">
            <div className="ai-message-author">2 · How the AI understood you {turn.interpretation_author_corrected?"· corrected by author":""}</div>
            <div className="ai-message-text">{turn.interpreted_text}</div>
            <div className="ai-message-actions">
              <button onClick={()=>void editMeaning(turn)}>Correct meaning</button>
              <button onClick={()=>void saveToDraft(turn,"Author meaning",turn.interpreted_text)}>Save meaning</button>
            </div>
          </div>
          <div className="triplet-layer ai-layer">
            <div className="ai-message-author">3 · AI response · {turn.provider} {turn.model}</div>
            <div className="ai-message-text">{turn.assistant_response}</div>
            <div className="ai-message-actions">
              <button onClick={()=>void saveToDraft(turn,"AI proposal",turn.assistant_response)}>Save to draft</button>
              <button onClick={()=>onGem(turn.assistant_response)}>Writing Gem</button>
              <button disabled={!!working} onClick={()=>void createChapter(turn.assistant_response)}>New chapter</button>
              {activeChapter&&<button disabled={!!working} onClick={()=>void replaceChapter(turn.assistant_response)}>Replace draft…</button>}
            </div>
          </div>
        </>}
      </article>)}
      {busy&&<p role="status">Reasoning and organizing your exchange…</p>}
    </div>
    {notice&&<p role="status" className="ai-chat-notice">{notice}</p>}
    <form className="ai-composer" onSubmit={e=>{e.preventDefault();void send(input)}}>
      <textarea ref={composer} aria-label="Message the writing assistant" rows={4} value={input}
        onChange={e=>setInput(e.target.value)} placeholder="Speak freely. The first version can be unfinished or grammatically imperfect…"
        onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send(input)}}}/>
      <div className="ai-chat-controls">
        <button type="button" onClick={dictate}>{dictating?"Stop microphone":"🎙 Dictate"}</button>
        <select value={speechLanguage} aria-label="Speech recognition language" onChange={e=>setSpeechLanguage(e.target.value)}>
          <option value="en-US">English</option><option value="es-ES">Español</option>
        </select>
        <button type="button" onClick={()=>void onAttach().catch(e=>onError(errorText(e)))}>+ Source</button>
      </div>
      <div className="ai-chat-controls">
        <button type="button" onClick={onGoDraft}>Open conversation draft</button>
        <button type="submit" className="primary" disabled={busy||!input.trim()||(provider==="openai"&&!configured)}>
          {busy?"Working…":"Send"}
        </button>
      </div>
      {provider==="openai"&&!configured&&<small>Configure an API key in ⚙ to use OpenAI.</small>}
    </form>
  </aside>;
}
