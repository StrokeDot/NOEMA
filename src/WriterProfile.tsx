import {useCallback,useEffect,useState} from "react";
import {request,errorText} from "./api";
type Note={id:string;dimension:string;claim:string;evidence_quote:string;project_title:string|null;state:"Candidate"|"Confirmed"|"Rejected";updated_at:number};
const dimensions=["Writing voice","Reasoning style","Moral framework","Values and beliefs","Working preferences","Other"];
export default function WriterProfile({onError}:{onError:(s:string)=>void}){
  const [notes,setNotes]=useState<Note[]>([]);
  const [dimension,setDimension]=useState("Reasoning style");
  const [claim,setClaim]=useState("");
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>setNotes(await request<Note[]>("writer_profile")) ,[]);
  useEffect(()=>{void refresh().catch(e=>onError(errorText(e)))},[refresh,onError]);
  async function review(id:string,state:Note["state"]){
    setBusy(true);
    try{await request("review_writer_profile_note",{id,state});await refresh()}
    catch(e){onError(errorText(e))}finally{setBusy(false)}
  }
  return <div className="content-view writer-profile">
    <div className="eyebrow">THE AUTHOR THROUGH TIME</div>
    <h1>Writer profile</h1>
    <p>A living record of your writing voice, reasoning habits, moral framework, values and working preferences.
       Suggestions from the AI are <strong>not facts</strong> until you confirm them. This is not a psychological diagnosis.</p>
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
    <p className="muted">AI observations stay in review until you approve them. Rejected observations are kept for audit but never used as instructions.</p>
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
            {n.state!=="Confirmed"&&<button disabled={busy} onClick={()=>void review(n.id,"Confirmed")}>Confirm</button>}
            {n.state!=="Rejected"&&<button disabled={busy} onClick={()=>void review(n.id,"Rejected")}>Reject</button>}
            {n.state==="Confirmed"&&<button disabled={busy} onClick={()=>void review(n.id,"Candidate")}>Reconsider</button>}
          </div>
        </article>)}
      </div>}
  </div>;
}
