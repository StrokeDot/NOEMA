import {useCallback,useEffect,useState} from "react";
import {request,errorText} from "./api";

type Note={
  id:string;dimension:string;claim:string;evidence_quote:string;
  project_title:string|null;state:"Candidate"|"Confirmed"|"Rejected";updated_at:number;
};
type NoteRevision={
  previous_dimension:string;previous_claim:string;
  previous_state:Note["state"];edited_at:number;
};
const dimensions=["Writing voice","Reasoning style","Moral framework","Values and beliefs","Working preferences","Other"];

export default function WriterProfile({onError}:{onError:(s:string)=>void}){
  const [notes,setNotes]=useState<Note[]>([]);
  const [dimension,setDimension]=useState("Reasoning style");
  const [claim,setClaim]=useState("");
  const [busy,setBusy]=useState(false);
  const [edit,setEdit]=useState<Note|null>(null);
  const [history,setHistory]=useState<NoteRevision[]>([]);
  const refresh=useCallback(async()=>setNotes(await request<Note[]>("writer_profile")),[]);
  useEffect(()=>{void refresh().catch(e=>onError(errorText(e)))},[refresh,onError]);

  async function review(id:string,state:Note["state"]){
    setBusy(true);
    try{await request("review_writer_profile_note",{id,state});await refresh()}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  async function startEditing(note:Note){
    setBusy(true);
    try{
      const old=await request<NoteRevision[]>("writer_profile_history",{id:note.id});
      setHistory(old);
      setEdit({...note});
    }catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  async function saveEdit(){
    if(!edit?.claim.trim() || busy)return;
    setBusy(true);
    try{
      await request("edit_writer_profile_note",{
        id:edit.id,dimension:edit.dimension,claim:edit.claim.trim()
      });
      setEdit(null);
      setHistory([]);
      await refresh();
    }catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  return <div className="content-view writer-profile">
    <div className="eyebrow">THE AUTHOR THROUGH TIME</div>
    <h1>Writer profile</h1>
    <p>A living record of your writing voice, reasoning habits, moral framework, values and working preferences.
       AI observations are <strong>not confirmed facts</strong> until you review them. You can correct
       NOEMA's wording without changing your original statements or their source attribution.</p>
    <section className="source-foundation">
      <h2>Teach NOEMA directly</h2>
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);try{
        await request("add_writer_profile_note",{dimension,claim});setClaim("");await refresh()
      }catch(e){onError(errorText(e))}finally{setBusy(false)}}}>
        <label>Aspect of your writing
          <select value={dimension} onChange={e=>setDimension(e.target.value)}>
            {dimensions.map(d=><option key={d}>{d}</option>)}
          </select>
        </label>
        <label>What should NOEMA understand?
          <textarea maxLength={2000} rows={3} value={claim} onChange={e=>setClaim(e.target.value)}
            placeholder="For example: Ask clarifying questions before concluding that my unfinished spoken argument is contradictory."/>
        </label>
        <button disabled={busy||!claim.trim()} className="primary">Add confirmed writer principle</button>
      </form>
    </section>
    <h2>Writer memory timeline</h2>
    <p className="muted">Only confirmed notes enter the AI's ongoing writer context. Rejected observations
       remain in the review record but are not treated as your beliefs. Edits and review decisions have an audit history.</p>
    {notes.length===0?<p>No profile observations yet. Start a conversation or add a confirmed principle above.</p>:
      <div className="profile-notes">
        {notes.map(n=><article key={n.id} className="source-card profile-note">
          <div className="profile-note-body">
            <div className="eyebrow">{n.dimension} · {n.state}</div>
            <p>{n.claim}</p>
            {n.evidence_quote&&<blockquote>Original evidence: “{n.evidence_quote}”</blockquote>}
            <small>{n.project_title ? "From "+n.project_title+" · " : "Directly confirmed by author · "}
              {new Date(n.updated_at).toLocaleDateString()}</small>
          </div>
          <div className="profile-actions">
            <button disabled={busy} onClick={()=>void startEditing(n)}>Edit / history</button>
            {n.state!=="Confirmed"&&<button disabled={busy} onClick={()=>void review(n.id,"Confirmed")}>Confirm</button>}
            {n.state!=="Rejected"&&<button disabled={busy} onClick={()=>void review(n.id,"Rejected")}>Reject</button>}
            {n.state==="Confirmed"&&<button disabled={busy} onClick={()=>void review(n.id,"Candidate")}>Reconsider</button>}
          </div>
        </article>)}
      </div>}
    {edit&&<div className="modal-backdrop">
      <form className="modal" role="dialog" aria-modal="true" aria-label="Correct writer profile note"
        onSubmit={e=>{e.preventDefault();void saveEdit()}}>
        <div className="eyebrow">AUTHOR-APPROVED PROFILE CORRECTION</div>
        <h2>Correct NOEMA's understanding</h2>
        <p>Saving confirms your edited statement. The original author quote stays unchanged;
          the earlier interpretation remains available in revision history.</p>
        <label>Category
          <select value={edit.dimension} onChange={e=>setEdit({...edit,dimension:e.target.value})}>
            {dimensions.map(d=><option key={d}>{d}</option>)}
          </select>
        </label>
        <label>Exact meaning NOEMA should remember
          <textarea required maxLength={2000} rows={5} value={edit.claim}
            onChange={e=>setEdit({...edit,claim:e.target.value})}/>
        </label>
        {edit.evidence_quote&&<blockquote>Unchanged source quotation: “{edit.evidence_quote}”</blockquote>}
        <details>
          <summary>Revision history ({history.length})</summary>
          {history.length===0?<p>No prior changes.</p>:
            history.map((revision,i)=><article key={i} className="profile-note-body">
              <small>{new Date(revision.edited_at).toLocaleString()} · {revision.previous_state} · {revision.previous_dimension}</small>
              <p>{revision.previous_claim}</p>
            </article>)}
        </details>
        <div className="row">
          <button type="button" disabled={busy} onClick={()=>{setEdit(null);setHistory([])}}>Cancel</button>
          <button className="primary" disabled={busy||!edit.claim.trim()}>
            {busy?"Saving…":"Save correction & confirm"}
          </button>
        </div>
      </form>
    </div>}
  </div>;
}
