import { useCallback, useEffect, useRef, useState } from "react";
import { request, errorText } from "./api";
import { Autosave } from "./autosave";
import { cueStatuses, type Project, type Source, type ScriptCue, type ScriptCueDraft, type ScriptCueRevision } from "./types";

function editFields(cue: ScriptCue): ScriptCueDraft {
  return {heading:cue.heading,narration:cue.narration,visuals:cue.visuals,
    evidence_notes:cue.evidence_notes,source_id:cue.source_id,
    source_locator:cue.source_locator,planned_seconds:cue.planned_seconds,status:cue.status};
}
function words(text: string) {
  return text.trim() ? text.trim().split(/\s+/u).length : 0;
}
function secondsFor(cue: Pick<ScriptCueDraft,"narration"|"planned_seconds">) {
  return cue.planned_seconds ?? Math.round(words(cue.narration) * 60 / 130);
}
function duration(seconds: number):string {
  const total = Math.max(0,Math.round(seconds));
  return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
}
function CueEditor({
  cue,project,sources,onPersist,onRegisterFlush,onError,onOpenSource,disabled,
}:{
  cue:ScriptCue;project:string;sources:Source[];disabled:boolean;
  onPersist:(cue:ScriptCue)=>void;
  onRegisterFlush:(fn:()=>Promise<void>)=>void;
  onError:(text:string)=>void;
  onOpenSource:(source:Source)=>void;
}) {
  const [draft,setDraft]=useState<ScriptCueDraft>(()=>editFields(cue));
  const [status,setStatus]=useState<"pending"|"saving"|"saved"|"error">("saved");
  const [history,setHistory]=useState<ScriptCueRevision[]|null>(null);
  const [selectedRevision,setSelectedRevision]=useState<ScriptCueRevision|null>(null);
  const [sourceFilter,setSourceFilter]=useState("");
  const [matches,setMatches]=useState<Source[]>(sources);
  const save=useRef<Autosave<ScriptCueDraft>|null>(null);
  const currentVersion=useRef(cue.version);
  if(!save.current) {
    save.current=new Autosave<ScriptCueDraft>(cue.version,async (fields,version)=>{
      const updated=await request<{version:number}>("save_script_cue",{
        ...fields,project_id:project,id:cue.id,version,
      });
      currentVersion.current=updated.version;
      onPersist({...cue,...fields,version:updated.version,updated_at:Date.now()});
      return updated;
    },setStatus);
  }
  useEffect(()=>{
    const flush=()=>save.current!.flush();
    onRegisterFlush(flush);
    return ()=>{void flush().catch(e=>onError(errorText(e)))};
  },[onRegisterFlush,onError]);
  useEffect(()=>{setMatches(sources)},[sources]);
  useEffect(()=>{
    let live=true;
    const task=window.setTimeout(()=>{
      request<Source[]>("sources",{project_id:project,filter:sourceFilter,sort:"name"})
        .then(v=>{if(live)setMatches(v)})
        .catch(e=>{if(live)onError(errorText(e))});
    },220);
    return ()=>{live=false;window.clearTimeout(task)};
  },[project,sourceFilter,onError]);
  const change=(patch:Partial<ScriptCueDraft>)=>{
    const next={...draft,...patch};
    setDraft(next);
    save.current!.enqueue(next);
  };
  async function openHistory() {
    try {
      await save.current!.flush();
      setHistory(await request<ScriptCueRevision[]>("script_cue_history",{project_id:project,id:cue.id}));
    }catch(e){onError(errorText(e))}
  }
  function restoreRevision() {
    if(!selectedRevision)return;
    if(!window.confirm("Restore this earlier cue? The current version will be retained in its history."))return;
    try{
      const raw=JSON.parse(selectedRevision.snapshot) as Partial<ScriptCueDraft>;
      const restored:ScriptCueDraft={
        heading:raw.heading??"",narration:raw.narration??"",visuals:raw.visuals??"",
        evidence_notes:raw.evidence_notes??"",source_id:raw.source_id??null,
        source_locator:raw.source_locator??"",planned_seconds:raw.planned_seconds??null,
        status:raw.status??"Draft",
        snapshot:true,
      };
      setDraft(restored);
      save.current!.enqueue(restored);
      void save.current!.flush().then(()=>{setHistory(null);setSelectedRevision(null)})
        .catch(e=>onError(errorText(e)));
    }catch(e){onError(errorText(e))}
  }
  const sourceName = draft.source_id && !matches.some(s=>s.id===draft.source_id)
    ? cue.source_name || "Linked source" : null;
  return <section className="cue-editor">
    <div className="cue-editor-header">
      <div className="eyebrow">PRODUCTION SCRIPT · BEAT {cue.position+1}</div>
      <div className="cue-header-actions">
        <button onClick={()=>void openHistory()}>History</button>
        <span className={"cue-save-"+status} role="status">
          {status==="saved"?"Saved on this computer":
            status==="saving"?"Saving…":status==="pending"?"Unsaved changes…":"Save failed — retry"}
        </span>
        {status==="error"&&<button onClick={()=>void save.current!.flush().catch(e=>onError(errorText(e)))}>Retry</button>}
      </div>
    </div>
    <label>Scene / segment title
      <input disabled={disabled} value={draft.heading} maxLength={500}
        onChange={e=>change({heading:e.target.value})} placeholder="Opening hook, central argument, closing…" />
    </label>
    <div className="cue-dual-columns">
      <label className="cue-narration">
        <span className="cue-field-title">Narration / voiceover</span>
        <span className="cue-field-desc">Exactly what the audience hears.</span>
        <textarea disabled={disabled} aria-label="Narration / voiceover" rows={15}
          value={draft.narration} onChange={e=>change({narration:e.target.value})}
          placeholder="Write the spoken script here…" />
        <small>{words(draft.narration)} words · {duration(secondsFor(draft))} estimated at 130 words/min (unless manually timed)</small>
      </label>
      <label className="cue-visuals">
        <span className="cue-field-title">Footage, visuals, on-screen text</span>
        <span className="cue-field-desc">B-roll, game footage, transitions, graphics, shot notes.</span>
        <textarea disabled={disabled} aria-label="Footage and visual directions" rows={15}
          value={draft.visuals} onChange={e=>change({visuals:e.target.value})}
          placeholder="00:00 Fade in on Arthur…&#10;B-roll: bench scene…&#10;On-screen text: …" />
      </label>
    </div>
    <div className="cue-detail-grid">
      <label>Source search
        <input value={sourceFilter} disabled={disabled} onChange={e=>setSourceFilter(e.target.value)}
          placeholder="Search imported research files"/>
      </label>
      <label>Linked research source
        <select disabled={disabled} value={draft.source_id??""}
          onChange={e=>change({source_id:e.target.value||null})} aria-label="Linked source">
          <option value="">No source linked</option>
          {sourceName && <option value={draft.source_id!}>{sourceName}</option>}
          {matches.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Location / citation
        <input disabled={disabled} value={draft.source_locator} maxLength={200000}
          placeholder="Page 12, episode 5, 04:25–04:41, URL…"
          onChange={e=>change({source_locator:e.target.value})}/>
      </label>
      <label>Planned duration (seconds)
        <input disabled={disabled} type="number" min={0} max={14400}
          value={draft.planned_seconds??""} placeholder="Auto estimate"
          onChange={e=>change({planned_seconds:e.target.value===""?null:Number(e.target.value)})}/>
      </label>
      <label>Recording readiness
        <select disabled={disabled} value={draft.status}
          onChange={e=>change({status:e.target.value as ScriptCueDraft["status"]})}>
          {cueStatuses.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </label>
    </div>
    <label>Evidence / editing notes
      <textarea rows={4} disabled={disabled} aria-label="Evidence and editing notes" value={draft.evidence_notes}
        onChange={e=>change({evidence_notes:e.target.value})}
        placeholder="What backs this claim? Which visual needs verification? Where should the source appear?"/>
    </label>
    <div className="cue-edit-footer">
      {draft.source_id && <button onClick={()=>{
        const s=matches.find(x=>x.id===draft.source_id) || sources.find(x=>x.id===draft.source_id);
        if(s)onOpenSource(s);
        else onError("Search for the linked source in Research to open it.");
      }}>Open linked research</button>}
      <button disabled={!draft.narration.trim()} onClick={()=>void navigator.clipboard.writeText(draft.narration).catch(()=>onError("Could not copy narration."))}>Copy narration</button>
      <span className="muted">Original imported documents and freeform drafts stay untouched.</span>
    </div>
    {history&&<div className="modal-backdrop">
      <section className="modal wide" role="dialog" aria-modal="true" aria-label="Script cue history">
        <div className="row"><h2>Earlier cue versions</h2>
          <button onClick={()=>{setHistory(null);setSelectedRevision(null)}}>Close</button></div>
        <p>Snapshots capture previous wording periodically. Restoring creates a new version.</p>
        <div className="history-list">
          {history.length===0?<p>No previous versions yet.</p>:history.map(h=>
            <button key={h.id} onClick={()=>setSelectedRevision(h)}>
              {new Date(h.created_at).toLocaleString()}</button>)}
        </div>
        {selectedRevision&&<div className="revision-preview">
          {(()=>{try{
            const old=JSON.parse(selectedRevision.snapshot) as ScriptCueDraft;
            return <><h3>{old.heading}</h3><strong>Narration</strong>
              <p className="cue-prewrap">{old.narration}</p><strong>Visuals</strong>
              <p className="cue-prewrap">{old.visuals}</p><strong>Source and notes</strong>
              <p className="cue-prewrap">{old.source_locator+"\n"+old.evidence_notes}</p>
            </>;
          }catch{return <p>Could not display this revision.</p>}})()}
          <button className="primary" onClick={restoreRevision}>Restore selected version</button>
        </div>}
      </section>
    </div>}
  </section>;
}

export default function ScriptStudio({
  project,channelName,onFlush,onError,onOpenSource,
}:{
  project:Project;channelName?:string;
  onFlush:(fn:()=>Promise<void>)=>void;
  onError:(message:string)=>void;onOpenSource:(source:Source)=>void;
}) {
  const [cues,setCues]=useState<ScriptCue[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [sources,setSources]=useState<Source[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [preview,setPreview]=useState(false);
  const pending=useRef<()=>Promise<void>>(async()=>{});
  const register=useCallback((fn:()=>Promise<void>)=>{pending.current=fn},[]);
  useEffect(()=>{
    onFlush(async()=>pending.current());
    return ()=>{void pending.current().catch(e=>onError(errorText(e)))};
  },[onFlush,onError]);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    Promise.all([
      request<ScriptCue[]>("script_cues",{project_id:project.id}),
      request<Source[]>("sources",{project_id:project.id,sort:"name"}),
    ]).then(([rows,files])=>{
      if(!active)return;
      setCues(rows);setSources(files);
      setSelectedId(rows[0]?.id??null);
    }).catch(e=>{if(active)onError(errorText(e))})
      .finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[project.id,onError]);
  const selected=cues.find(c=>c.id===selectedId)??null;
  const allWords=cues.reduce((sum,c)=>sum+words(c.narration),0);
  const estimated=cues.reduce((sum,c)=>sum+secondsFor(c),0);
  const persist=useCallback((item:ScriptCue)=>{
    setCues(prev=>prev.map(c=>c.id===item.id?{...c,...item}:c));
  },[]);
  async function withFlush(action:()=>Promise<void>) {
    if(busy)return;
    setBusy(true);
    try{await pending.current();await action()}
    catch(e){onError(errorText(e))}
    finally{setBusy(false)}
  }
  const select=(id:string)=>{if(id===selectedId)return;void withFlush(async()=>{pending.current=async()=>{};setSelectedId(id)})};
  const add=()=>void withFlush(async()=>{
    const created=await request<ScriptCue>("create_script_cue",{project_id:project.id,heading:"New scene"});
    setCues(prev=>[...prev,created]);
    pending.current=async()=>{};
    setSelectedId(created.id);
  });
  const remove=()=>{if(!selected)return;
    if(!window.confirm("Remove this scene from the production board? Its text remains in local storage for recovery."))return;
    void withFlush(async()=>{
      await request("delete_script_cue",{project_id:project.id,id:selected.id});
      const filtered=cues.filter(c=>c.id!==selected.id);
      setCues(filtered);pending.current=async()=>{};setSelectedId(filtered[0]?.id??null);
    });
  };
  const move=(delta:number)=>{
    if(!selected)return;
    const index=cues.findIndex(c=>c.id===selected.id);
    const target=index+delta;
    if(target<0||target>=cues.length)return;
    void withFlush(async()=>{
      const next=[...cues];
      [next[index],next[target]]=[next[target],next[index]];
      await request("reorder_script_cues",{project_id:project.id,ids:next.map(c=>c.id)});
      setCues(next.map((c,i)=>({...c,position:i})));
    });
  };
  if(loading)return <div className="content-view"><h2>Opening script production board…</h2></div>;
  return <div className="script-studio">
    <div className="script-toolbar">
      <div><div className="eyebrow">{channelName?channelName+" · ":""}VIDEO PRODUCTION</div>
        <h1>{project.title}</h1>
        <p>{cues.length} scenes · {allWords} spoken words · approximately {duration(estimated)} of narration</p>
      </div>
      <div className="framework-actions">
        <button onClick={()=>void withFlush(async()=>setPreview(true))} disabled={busy||!cues.length}>Production preview</button>
        <button className="primary" onClick={add} disabled={busy}>+ Add scene</button>
      </div>
    </div>
    {cues.length? <div className="script-board">
      <aside className="script-scenes" aria-label="Scenes">
        <div className="eyebrow">SCENES / PRODUCTION CUES</div>
        {cues.map((c,i)=><button key={c.id} className={c.id===selectedId?"script-scene active":"script-scene"}
          aria-current={c.id===selectedId?"true":undefined} disabled={busy} onClick={()=>select(c.id)}>
          <span className="script-scene-number">{String(i+1).padStart(2,"0")}</span>
          <span><strong>{c.heading||"Untitled scene"}</strong><small>{duration(secondsFor(c))} · {c.status}</small></span>
        </button>)}
        <div className="script-scene-actions">
          <button disabled={busy||!selected||cues[0]?.id===selected.id} onClick={()=>move(-1)}>↑ Move up</button>
          <button disabled={busy||!selected||cues[cues.length-1]?.id===selected.id} onClick={()=>move(1)}>↓ Move down</button>
          <button className="danger" disabled={busy||!selected} onClick={remove}>Remove</button>
        </div>
      </aside>
      {selected&&<CueEditor key={selected.id} cue={selected} project={project.id}
        sources={sources} disabled={busy} onPersist={persist}
        onRegisterFlush={register} onError={onError} onOpenSource={onOpenSource}/>}
    </div>:<div className="empty-state">
      <div className="large-symbol">▦</div>
      <h2>Build the video, one scene at a time.</h2>
      <p>Write what the audience hears, plan what viewers see, and keep the supporting evidence beside it.</p>
      <button className="primary" onClick={add} disabled={busy}>Create first scene</button>
      <p className="muted">Older freeform writing remains available under Manuscript.</p>
    </div>}
    {preview&&<div className="modal-backdrop">
      <section className="modal wide script-preview" role="dialog" aria-modal="true" aria-label="Production script preview">
        <div className="row"><div><div className="eyebrow">PRODUCTION PREVIEW</div>
          <h2>{project.title}</h2></div><button onClick={()=>setPreview(false)}>Close</button></div>
        <p>Read-only layout. Narration and visual directions stay separate; source citations require your review.</p>
        {cues.map((c,i)=><section key={c.id} className="script-preview-cue">
          <h3>{String(i+1).padStart(2,"0")} — {c.heading||"Untitled scene"} <small>{duration(secondsFor(c))}</small></h3>
          <div className="cue-dual-columns">
            <div><strong>Narration</strong><p className="cue-prewrap">{c.narration||"(Not written yet)"}</p></div>
            <div><strong>Visuals / editing</strong><p className="cue-prewrap">{c.visuals||"(Not planned yet)"}</p></div>
          </div>
          {(c.source_name||c.source_locator||c.evidence_notes)&&<small className="cue-prewrap">
            Source: {c.source_name||"Not linked"}{c.source_locator?" · "+c.source_locator:""}
            {c.evidence_notes?"\nNotes: "+c.evidence_notes:""}
          </small>}
        </section>)}
      </section>
    </div>}
  </div>;
}
