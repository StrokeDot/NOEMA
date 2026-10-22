import {useCallback,useEffect,useState} from "react";
import {request,errorText} from "./api";
type Item={id:string;turn_id:string|null;source:string;text:string;state:"Candidate"|"Approved"|"Rejected";created_at:number};
export default function ConversationDraft({project,onError,onCreateChapter}:{
  project:string;onError:(s:string)=>void;onCreateChapter:(title:string,text:string)=>Promise<void>;
}) {
  const [items,setItems]=useState<Item[]>([]);
  const [auto,setAuto]=useState(false);
  const [adding,setAdding]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const [data,settings]=await Promise.all([
      request<Item[]>("conversation_draft",{project_id:project}),
      request<{auto_collect:boolean}>("draft_settings",{project_id:project})
    ]);
    setItems(data);setAuto(settings.auto_collect);
  },[project]);
  useEffect(()=>{void refresh().catch(e=>onError(errorText(e)))},[refresh,onError]);
  const approved=items.filter(i=>i.state==="Approved");
  async function review(item:Item,state:Item["state"]){
    setBusy(true);
    try{await request("review_draft_item",{project_id:project,id:item.id,state});await refresh()}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  async function publish(){
    if(!approved.length)return;
    const title=window.prompt("Chapter title");
    if(!title?.trim())return;
    if(!window.confirm("Create a NEW chapter using the "+approved.length+" approved passages in this conversation draft? The draft and transcript stay unchanged."))return;
    setBusy(true);
    try{await onCreateChapter(title,approved.map(i=>i.text).join("\n\n"))}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  return <div className="content-view conversation-draft">
    <div className="eyebrow">ANOTHER DOCUMENT, NOT THE MANUSCRIPT</div>
    <h1>Conversation draft</h1>
    <p>Gather the lines and ideas worth developing as a book. The full conversation stays in the transcript;
       this is the separate, selective draft.</p>
    <section className="source-foundation">
      <label className="row">
        <input type="checkbox" checked={auto} onChange={async e=>{
          const value=e.target.checked;
          try{await request("set_draft_auto_collect",{project_id:project,enabled:value});setAuto(value)}
          catch(err){onError(errorText(err))}
        }}/>
        <strong>Let AI collect proposed passages automatically</strong>
      </label>
      <p>When enabled, NOEMA collects the AI's suggested book-ready lines as <strong>Candidates</strong> after each turn.
        It never changes the actual book without your explicit approval.</p>
    </section>
    <section className="source-foundation">
      <h2>Add your own passage</h2>
      <textarea rows={3} maxLength={100000} value={adding} onChange={e=>setAdding(e.target.value)}
        placeholder="Something from this conversation that belongs in the book…"/>
      <div className="row"><button disabled={!adding.trim()||busy} onClick={async()=>{
        setBusy(true);
        try{await request("save_draft_item",{project_id:project,source:"Author addition",text:adding});
          setAdding("");await refresh()}catch(e){onError(errorText(e))}finally{setBusy(false)}
      }}>Add to draft candidates</button>
      <button className="primary" disabled={!approved.length||busy} onClick={()=>void publish()}>
        Create chapter from {approved.length} approved passages
      </button></div>
    </section>
    <h2>Draft passages</h2>
    {items.length===0?<p>No saved passages yet. Use the buttons under conversation turns to collect original words, coherent meanings, or AI proposals.</p>:
      items.map(item=><article key={item.id} className="source-card draft-item">
        <div className="draft-item-content">
          <div className="eyebrow">{item.source} · {item.state}</div>
          <p className="conversation-text">{item.text}</p>
        </div>
        <div className="profile-actions">
          {item.state!=="Approved"&&<button disabled={busy} onClick={()=>void review(item,"Approved")}>Approve</button>}
          {item.state!=="Rejected"&&<button disabled={busy} onClick={()=>void review(item,"Rejected")}>Exclude</button>}
          {item.state==="Approved"&&<button disabled={busy} onClick={()=>void review(item,"Candidate")}>Review again</button>}
        </div>
      </article>)}
  </div>;
}
