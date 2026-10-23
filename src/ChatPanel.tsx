import {useCallback,useEffect,useRef,useState} from "react";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {request,errorText} from "./api";
import type {Document,Project} from "./types";
type Turn={id:string;original_text:string;interpreted_text:string;interpretation_author_corrected:number;
  assistant_response:string;critical_review:string;critique_explored:number;provider:string;model:string;state:"pending"|"complete";created_at:number};
type Legacy={id:string;role:"user"|"assistant";content:string;provider:string;created_at:number};
type Dialogue={id:string;title:string;goal:string;exchange_count:number;updated_at:number};
type LocalModel={name:string;size?:number;model?:string};
type PullProgress={model:string;status:string;completed:number;total:number};
const isInstalled=(name:string,items:LocalModel[])=>{
  const canonical=(value:string)=>value.toLowerCase().replace(/:latest$/,"");
  return items.some(item=>canonical(item.name||item.model||"")===canonical(name));
};
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
  const [dialogues,setDialogues]=useState<Dialogue[]>([]);
  const [activeDialogue,setActiveDialogue]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [newGoal,setNewGoal]=useState("");
  const [editing,setEditing]=useState(false);
  const [editTitle,setEditTitle]=useState("");
  const [editGoal,setEditGoal]=useState("");
  const [localModels,setLocalModels]=useState<LocalModel[]>([]);
  const [ollamaReady,setOllamaReady]=useState(false);
  const [ollamaVersion,setOllamaVersion]=useState<string|null>(null);
  const [pullError,setPullError]=useState("");
  const [lastDownload,setLastDownload]=useState<string|null>(null);
  const [localNotice,setLocalNotice]=useState("");
  const [pulling,setPulling]=useState<string|null>(null);
  const [pullProgress,setPullProgress]=useState<PullProgress|null>(null);
  const historyRef=useRef<HTMLDivElement|null>(null);
  const [input,setInput]=useState("");
  const [provider,setProvider]=useState<"openai"|"ollama">(
    ()=>localStorage.getItem("noema-ai-provider")==="openai"?"openai":"ollama");
  const [models,setModel]=useState({
    openai:localStorage.getItem("noema-openai-model")||"gpt-4.1-mini",
    ollama:localStorage.getItem("noema-ollama-model")||"qwen3.5:9b",
  });
  const [configured,setConfigured]=useState(false);
  const [key,setKey]=useState("");
  const [skill,setSkill]=useState("reflect");
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
      request<Turn[]>("writing_turns",{project_id:project.id,dialogue_id:activeDialogue||"__none__"}),
      activeDialogue?.startsWith("legacy-")
        ? request<Legacy[]>("chat_history",{project_id:project.id}) : Promise.resolve([])
    ]);
    setTurns(ts);setLegacy(h);
  },[project.id,activeDialogue]);
  const loadDialogues=useCallback(async()=>{
    const result=await request<Dialogue[]>("book_dialogues",{project_id:project.id});
    setDialogues(result);return result;
  },[project.id]);
  useEffect(()=>{
    let active=true;
    void loadDialogues().then(list=>{
      if(!active)return;
      const last=localStorage.getItem("noema-dialogue-"+project.id);
      const selected=list.find(item=>item.id===last)||list[0];
      setActiveDialogue(selected?.id||null);
    }).catch(e=>{if(active)onError(errorText(e))});
    return()=>{active=false};
  },[loadDialogues,project.id,onError]);
  useEffect(()=>{
    if(activeDialogue)localStorage.setItem("noema-dialogue-"+project.id,activeDialogue);
  },[activeDialogue,project.id]);
  useEffect(()=>{
    if(historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;
  },[turns,legacy,busy,activeDialogue]);
  useEffect(()=>{
    let active=true;
    void refresh().catch(e=>{if(active)onError(errorText(e))});
    if(isTauri())void invoke<Status>("ai_status").then(s=>{if(active)setConfigured(s.openai_key_saved)})
      .catch(e=>{if(active)onError(errorText(e))});
    return()=>{active=false;speechRef.current?.stop()};
  },[refresh,onError]);
  useEffect(()=>{localStorage.setItem("noema-ai-provider",provider)},[provider]);
  const discoverModels=useCallback(async()=>{
    if(!isTauri())return;
    try{
      const result=await invoke<{models:LocalModel[];version?:string|null}>("ai_local_models");
      setLocalModels(result.models||[]);
      setOllamaVersion(result.version||null);
      setOllamaReady(true);
      setLocalNotice(result.models.length+" installed Ollama model(s) detected.");
    }catch(e){setLocalModels([]);setOllamaReady(false);setOllamaVersion(null);setLocalNotice(errorText(e))}
  },[]);
  useEffect(()=>{if(settings&&provider==="ollama")void discoverModels()},[settings,provider,discoverModels]);
  useEffect(()=>{
    if(!isTauri())return;
    let off:(()=>void)|undefined;
    let disposed=false;
    void listen<PullProgress>("noema-model-download-progress",event=>{
      setPullProgress(event.payload);
    }).then(fn=>{if(disposed)fn();else off=fn}).catch(()=>{});
    return()=>{disposed=true;off?.()};
  },[]);
  async function pullModel(name:string){
    if(pulling)return;
    if(!ollamaReady){setLocalNotice("Start Ollama, then scan installed models before downloading.");return;}
    if(isInstalled(name,localModels)){
      setModel(old=>({...old,ollama:name}));setLocalNotice(name+" is already installed — no download needed.");
      return;
    }
    if(!window.confirm("Download "+name+" through your local Ollama service? This can use several GB of storage and internet data."))return;
    setPulling(name);setLastDownload(name);setPullError("");setPullProgress(null);setLocalNotice("Ollama is downloading "+name+"…");
    try{
      const result=await invoke<{already_installed:boolean}>("ai_pull_model",{model:name});
      await discoverModels();
      setModel(old=>({...old,ollama:name}));
      localStorage.setItem("noema-ollama-model",name);
      setLocalNotice(result.already_installed ? "Already installed — reused existing model." : "Model installed and ready to use.");
    }catch(e){setPullError(errorText(e));setLocalNotice("Download failed for "+name+". See details below.");}finally{setPulling(null)}
  }
  async function createDialogue(){
    const title=newTitle.trim(),goal=newGoal.trim();
    if(!title||!goal)return;
    try{
      const created=await request<{id:string}>("create_book_dialogue",{project_id:project.id,title,goal});
      await loadDialogues();
      setActiveDialogue(created.id);setCreating(false);setNewTitle("");setNewGoal("");
      setNotice("New dialogue ready. Your book goal remains attached to this conversation.");
      composer.current?.focus();
    }catch(e){onError(errorText(e))}
  }
  async function updateDialogue(){
    if(!activeDialogue||!editTitle.trim()||!editGoal.trim())return;
    try{
      await request("edit_book_dialogue",{project_id:project.id,dialogue_id:activeDialogue,
        title:editTitle.trim(),goal:editGoal.trim()});
      await loadDialogues();setEditing(false);
    }catch(e){onError(errorText(e))}
  }
  async function connect(){
    setBusy(true);
    try{await invoke("ai_configure",{apiKey:key.trim()});setConfigured(true);setKey("");setSettings(false);
      setNotice("API key saved in Windows Credential Manager.")}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  async function send(text:string){
    if(busy||!text.trim())return;
    if(!activeDialogue){setNotice("Create a dialogue with a subject and book goal first.");setCreating(true);return;}
    setBusy(true);setNotice("Keeping your original wording and asking the selected AI…");
    setInput("");
    try{
      await invoke("ai_reply",{projectId:project.id,provider,model:models[provider],message:text,skillId:skill,dialogueId:activeDialogue});
      setNotice("The original, interpretation, response, and profile candidates are saved.");
    }catch(e){
      onError(errorText(e));
      setNotice("The original input may be saved as a pending turn even if the model failed. Nothing was added to your manuscript.");
    }finally{
      try{await refresh();await loadDialogues()}catch(e){onError(errorText(e))}
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
  async function markCritique(turn:Turn){
    try{await request("mark_critique_explored",{project_id:project.id,turn_id:turn.id,explored:true});
      await refresh();setNotice("You marked this critique as reviewed. This does not mean you agreed with it.")}
    catch(e){onError(errorText(e))}
  }
  function examineCritique(turn:Turn){
    setSkill("argument-review");
    setInput("Explore the following critique of my argument. Steelman it, identify which premises I accept or reject, distinguish genuine new issues from repeated objections, and help me respond fairly:\n\n"+turn.critical_review);
    composer.current?.focus();
    setNotice("The critique is loaded into the composer for discussion. Sending it is your choice.");
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
  const selected=dialogues.find(item=>item.id===activeDialogue);
  return <section className="dialogue-workspace" aria-label="Book dialogue workspace">
    <aside className="dialogue-rail" aria-label="Book conversation topics">
      <div className="dialogue-rail-heading">
        <span className="eyebrow">BOOK CONVERSATIONS</span>
        <button className="primary" onClick={()=>{setCreating(true);setEditing(false)}}>+ New dialogue</button>
      </div>
      <div className="dialogue-thread-list">
        {dialogues.map(item=><button key={item.id}
          className={"dialogue-thread"+(activeDialogue===item.id?" active":"")}
          aria-current={activeDialogue===item.id?"page":undefined}
          onClick={()=>{setActiveDialogue(item.id);setCreating(false);setEditing(false)}}>
          <strong>{item.title}</strong>
          <small>{item.exchange_count} exchanges · {new Date(item.updated_at).toLocaleDateString()}</small>
        </button>)}
      </div>
      <div className="dialogue-rail-footer">
        <strong>One book, many dialogues</strong>
        <p>Discuss each subject separately. Your manuscript, writing memory, and research stay in the same book project.</p>
        <button onClick={onGoDraft}>Open conversation draft ↗</button>
      </div>
    </aside>
    <div className="dialogue-main">
      <header className="dialogue-topline">
        <div>
          <span className="eyebrow">GIVE & TAKE · AUTHOR + AI → BOOK</span>
          <h2>{selected?.title||"Begin a book dialogue"}</h2>
          {selected&&<p>{selected.goal}</p>}
        </div>
        <div className="dialogue-header-actions">
          {selected&&!selected.id.startsWith("legacy-")&&<button
            onClick={()=>{setEditTitle(selected.title);setEditGoal(selected.goal);setEditing(true)}}>Edit purpose</button>}
          <button aria-expanded={settings} aria-label="Choose AI model" onClick={()=>setSettings(v=>!v)}>⚙ Models</button>
        </div>
      </header>
      {(creating||editing)&&<div className="dialogue-goal-overlay">
        <form className="dialogue-goal-form" onSubmit={e=>{e.preventDefault();void (editing?updateDialogue():createDialogue())}}>
          <span className="eyebrow">{editing?"REFINE THE PURPOSE":"NEW BOOK CONVERSATION"}</span>
          <h2>{editing?"What is this dialogue aiming to achieve?":"What should we explore together?"}</h2>
          <label>Conversation subject
            <input required maxLength={180} value={editing?editTitle:newTitle}
              onChange={e=>editing?setEditTitle(e.target.value):setNewTitle(e.target.value)}
              placeholder="Example: The meaning of individual responsibility"/>
          </label>
          <label>Purpose for the book
            <textarea required maxLength={2000} rows={3} value={editing?editGoal:newGoal}
              onChange={e=>editing?setEditGoal(e.target.value):setNewGoal(e.target.value)}
              placeholder="What understanding, argument or chapter should this discussion help develop?"/>
          </label>
          <div className="dialogue-goal-actions">
            <button type="button" onClick={()=>{setCreating(false);setEditing(false)}}>Cancel</button>
            <button className="primary" disabled={!(editing?editTitle:newTitle).trim()||!(editing?editGoal:newGoal).trim()}>
              {editing?"Save purpose":"Create dialogue"}
            </button>
          </div>
        </form>
      </div>}
      {settings&&<section className="dialogue-model-drawer" aria-label="AI model manager">
        <div className="dialogue-model-heading">
          <div><strong>AI model manager</strong><p>NOEMA uses a model as your writing partner, not as the author or final authority.</p></div>
          <button onClick={()=>setSettings(false)}>Close</button>
        </div>
        <div className="dialogue-model-grid">
          <label>Provider<select value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}>
            <option value="ollama">Local models · Ollama</option>
            <option value="openai">OpenAI API · separate billing</option>
          </select></label>
          <label>Model<select aria-label="Selected AI model" value={models[provider]} onChange={e=>{
            const name=e.target.value;setModel(old=>({...old,[provider]:name}));
            localStorage.setItem("noema-"+provider+"-model",name);
          }}>
            {provider==="openai"?<><option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value={models.openai}>{models.openai}</option></>:
              <>{!isInstalled(models.ollama,localModels)&&<option value={models.ollama}>{models.ollama} · not detected</option>}
                {localModels.map(m=><option key={m.name} value={m.name}>{m.name} · installed</option>)}</>}
          </select></label>
        </div>
        {provider==="ollama"?<>
          <div className="dialogue-model-row"><strong>Available on this computer</strong>
            <button type="button" disabled={!!pulling} onClick={()=>void discoverModels()}>↻ Scan Ollama inventory</button></div>
          <p className="muted" role="status">{localNotice||"Start Ollama and scan installed models. Alternative storage drives configured through OLLAMA_MODELS are supported."}
          {ollamaReady&&<span> {ollamaVersion?"Ollama "+ollamaVersion+" detected.":"Ollama running (version not reported)."}</span>}</p>
          {localModels.length>0&&<div className="dialogue-installed-models">{localModels.map(m=><button key={m.name}
            onClick={()=>{setModel(old=>({...old,ollama:m.name}));localStorage.setItem("noema-ollama-model",m.name)}}>
            ● {m.name} {m.size?" · "+(m.size/1024**3).toFixed(1)+" GB":""}
            {models.ollama===m.name?" · selected":""}</button>)}</div>}
          <div className="dialogue-model-row"><strong>Discover and download</strong><small>No duplicate download of an already installed model</small></div>
          <div className="dialogue-model-catalog">{localChoices.map(model=><div key={model.id} className="dialogue-model-card">
            <span>{model.label}<small className="dialogue-model-size"> · ~{model.id==="gpt-oss:20b"?"14":model.id==="gemma4:12b"?"8":model.id==="qwen3.5:9b"?"7":"9.3"} GB download</small></span>
            <button type="button" disabled={!ollamaReady||!!pulling} onClick={()=>void pullModel(model.id)}>
              {isInstalled(model.id,localModels)?"Use installed":pulling===model.id?"Downloading…":"Download"}
            </button>
          </div>)}</div>
          {(pulling||pullError)&&<div className="dialogue-pull-status" role={pullError?"alert":"status"}>
            <strong>{pulling||lastDownload}</strong> · {pullError?"Download interrupted":pullProgress?.status||"Connecting to Ollama…"}
            {!pullError&&pullProgress&&pullProgress.total>0&&<>
              <progress aria-label="Current download layer progress" value={Math.min(pullProgress.completed,pullProgress.total)} max={pullProgress.total}/>
              <small>Current layer: {Math.round(100*pullProgress.completed/pullProgress.total)}% (not overall model progress)</small>
            </>}
            {pullError&&<>
              <p className="dialogue-download-error">{pullError}</p>
              <p>Check free space on the model storage drive and your Ollama version. Retrying can reuse downloaded layers.</p>
              <button type="button" disabled={!ollamaReady} onClick={()=>{if(lastDownload)void pullModel(lastDownload)}}>Retry {lastDownload}</button>
            </>}
          </div>}
          <details className="dialogue-model-help"><summary>Download not starting? Troubleshooting</summary>
            <p>Ollama must be running and updated. GPT-OSS needs about 14 GB of disk space; Gemma 4 12B about 8 GB, plus temporary space. Downloads don't consume GPU VRAM.</p>
            <p>Open <code>http://127.0.0.1:11434/api/tags</code> in your browser to check local inventory. For detailed network errors, the Ollama terminal can run <code>ollama pull gemma4:12b</code> or <code>ollama pull gpt-oss:20b</code>.</p>
          </details>
          <small>Existing models registered with Ollama are reused regardless of Ollama's configured storage folder. Files elsewhere not yet registered with Ollama require an import workflow; NOEMA does not silently search private drives.</small>
        </>:<>
          <p>{configured?"OpenAI key is stored in Windows Credential Manager.":"Using an OpenAI API requires a separate billed API account; ChatGPT Plus is not shared."}</p>
          <label>OpenAI API key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="API key"/></label>
          <button disabled={busy||key.trim().length<25} onClick={()=>void connect()}>Save API key</button>
          {configured&&<button disabled={busy} onClick={()=>void invoke("ai_disconnect").then(()=>setConfigured(false)).catch(e=>onError(errorText(e)))}>Forget API key</button>}
        </>}
      </section>}
      <div ref={historyRef} className="ai-chat-history dialogue-transcript" role="log" aria-label="Book conversation history">
        {!selected&&!creating&&<div className="dialogue-welcome">
          <span className="dialogue-welcome-symbol">◎</span>
          <h1>What shall we think through?</h1>
          <p>You lead with a subject and purpose. The AI responds, questions assumptions, considers evidence and helps develop your book.</p>
          <button className="primary" onClick={()=>setCreating(true)}>Begin a dialogue</button>
        </div>}
        {selected&&turns.length===0&&legacy.length===0&&<div className="dialogue-welcome">
          <span className="dialogue-welcome-symbol">◎</span>
          <h1>{selected.title}</h1>
          <p>{selected.goal}</p>
          <small>Write a thought below. You don't need to organize it perfectly first.</small>
        </div>}
        {legacy.length>0&&<details className="legacy-chat">
          <summary>Earlier imported-style chat messages ({legacy.length})</summary>
          {legacy.map(m=><article key={m.id} className="ai-message">
            <div className="ai-message-author">{m.role==="user"?"Author":"AI"}</div>
            <div className="ai-message-text">{m.content}</div>
          </article>)}
        </details>}
        {turns.map((turn,index)=><article key={turn.id} className="dialogue-exchange">
          <div className="dialogue-author-message">
            <div className="dialogue-message-meta">You · {new Date(turn.created_at).toLocaleDateString()}</div>
            <div className="dialogue-message-content">{turn.original_text}</div>
            <button title="Collect your original words as a candidate for the book" onClick={()=>void saveToDraft(turn,"Author original",turn.original_text)}>Save passage</button>
          </div>
          {turn.state==="pending"?<div className="dialogue-assistant-message"><span className="dialogue-avatar">N</span>
            <div className="dialogue-response-body">Your original thought is preserved. This exchange is awaiting an AI response.</div></div>:
          <div className="dialogue-assistant-message">
            <span className="dialogue-avatar" aria-hidden="true">N</span>
            <div className="dialogue-response-body">
              <div className="dialogue-message-meta">NOEMA · {turn.provider} · {turn.model} · Exchange {index+1}</div>
              <div className="dialogue-message-content">{turn.assistant_response}</div>
              <details className="dialogue-interpretation">
                <summary>How NOEMA understood you {turn.interpretation_author_corrected?"· corrected":""}</summary>
                <div className="dialogue-message-content">{turn.interpreted_text}</div>
                <div className="ai-message-actions">
                  <button onClick={()=>void editMeaning(turn)}>Correct meaning</button>
                  <button onClick={()=>void saveToDraft(turn,"Author meaning",turn.interpreted_text)}>Save interpretation</button>
                </div>
              </details>
              <section className="dialogue-critique" aria-label="Independent critical perspective">
                <div className="dialogue-critique-title">↔ Independent challenge</div>
                <div className="dialogue-message-content">{turn.critical_review||"This older exchange did not contain a separate critique."}</div>
                <div className="ai-message-actions">
                  <button disabled={!turn.critical_review} onClick={()=>examineCritique(turn)}>Discuss this challenge</button>
                  <button disabled={!turn.critical_review||!!turn.critique_explored} onClick={()=>void markCritique(turn)}>
                    {turn.critique_explored?"Reviewed":"Mark considered"}</button>
                </div>
              </section>
              <div className="ai-message-actions dialogue-save-actions">
                <button onClick={()=>void saveToDraft(turn,"AI proposal",turn.assistant_response)}>Save as candidate</button>
                <button onClick={()=>onGem(turn.assistant_response)}>Writing gem</button>
                <button disabled={!!working||(!turn.critique_explored&&!!turn.critical_review)}
                  title="Review the critique before adding this AI passage to the manuscript"
                  onClick={()=>void createChapter(turn.assistant_response)}>New chapter</button>
                {activeChapter&&<button disabled={!!working||(!turn.critique_explored&&!!turn.critical_review)}
                  onClick={()=>void replaceChapter(turn.assistant_response)}>Replace chapter…</button>}
              </div>
            </div>
          </div>}
        </article>)}
        {busy&&<div className="dialogue-thinking" role="status"><span className="dialogue-avatar">N</span>
          <span>Considering your thought</span><span className="dialogue-dots" aria-hidden="true"><i/><i/><i/></span>
        </div>}
      </div>
      <div className="dialogue-composer-wrap">
        {notice&&<p role="status" className="dialogue-notice">{notice}</p>}
        <form className="dialogue-composer" onSubmit={e=>{e.preventDefault();void send(input)}}>
          <textarea ref={composer} aria-label="Message the writing assistant" rows={2} value={input}
            onChange={e=>setInput(e.target.value)}
            placeholder={selected?"Share your idea, question or argument…":"Create a dialogue to begin…"}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();void send(input)}}}/>
          <div className="dialogue-composer-actions">
            <label>Dialogue mode<select aria-label="Active writing skill" value={skill} onChange={e=>setSkill(e.target.value)}>
              <option value="reflect">Open exchange</option>
              <option value="argument-review">Test an argument</option>
              <option value="chapter-outline">Build a chapter</option>
              <option value="source-audit">Check evidence</option>
              <option value="fiction-craft">Story development</option>
              <option value="profile-observation">Author understanding</option>
            </select></label>
            <div className="dialogue-composer-right">
              <button type="button" onClick={()=>void onAttach().catch(e=>onError(errorText(e)))}>+ Source</button>
              <button type="button" onClick={dictate}>{dictating?"Stop":"🎙 Dictate"}</button>
              <select value={speechLanguage} aria-label="Speech recognition language" onChange={e=>setSpeechLanguage(e.target.value)}>
                <option value="en-US">EN</option><option value="es-ES">ES</option></select>
              <button type="submit" className="primary" aria-label="Send message"
                disabled={busy||!selected||!input.trim()||(provider==="openai"&&!configured)}>
                {busy?"Thinking…":"Send ↑"}</button>
            </div>
          </div>
        </form>
        <small className="dialogue-composer-hint">You decide what belongs in the manuscript. Enter to send · Shift+Enter for a new line.</small>
      </div>
    </div>
  </section>;
}
