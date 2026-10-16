import { useEffect, useState } from "react";
import { request, errorText } from "./api";
import type { ChannelProfile, ChannelDraft, ChannelScript, ChannelScriptReference, Project } from "./types";

const blank = (): ChannelDraft => ({
  name:"", description:"", audience:"", voice:"", editorial_rules:"",
  content_pillars:"", original_text:"", source_label:"", confirmed:false,
});
export default function ChannelsView({
  channels, projects, currentProject, onSaved, onOpenScript, onNewScript, onError,
}: {
  channels:ChannelProfile[];
  projects:Project[];
  currentProject:Project|null;
  onSaved:()=>Promise<ChannelProfile[]>;
  onOpenScript:(project:Project)=>void;
  onNewScript:(channelId:string)=>void;
  onError:(text:string)=>void;
}) {
  const [selected,setSelected]=useState("");
  const [edit,setEdit]=useState<ChannelDraft|null>(null);
  const [saving,setSaving]=useState(false);
  const [scripts,setScripts]=useState<ChannelScript[]>([]);
  const [query,setQuery]=useState("");
  const [references,setReferences]=useState<ChannelScriptReference[]|null>(null);
  const [includeOther,setIncludeOther]=useState(false);
  const [publishedOnly,setPublishedOnly]=useState(true);
  const [searching,setSearching]=useState(false);
  const activeId=channels.some(c=>c.id===selected) ? selected : currentProject?.channel_id && channels.some(c=>c.id===currentProject.channel_id)
    ? currentProject.channel_id : channels[0]?.id ?? "";
  const active=channels.find(c=>c.id===activeId);
  const sourceScript=projects.find(p=>p.project_type==="Video Script" && p.channel_id===activeId);
  useEffect(()=>{
    let live=true;
    setReferences(null);
    if (!activeId) { setScripts([]);return ()=>{live=false}; }
    request<ChannelScript[]>("channel_scripts",{channel_id:activeId})
      .then(v=>{if(live)setScripts(v)})
      .catch(e=>{if(live)onError(errorText(e))});
    return ()=>{live=false};
  },[activeId,projects,onError]);
  async function importProfile(file:File) {
    if (!/\.(txt|md|markdown|json)$/i.test(file.name)) {
      onError("Channel profiles currently support TXT, Markdown, or JSON text.");
      return;
    }
    if(file.size>100000) {onError("Profile is too long. Limit: 100 KB.");return;}
    try {
      const content=await file.text();
      if(!content.trim())throw new Error("The chosen document is empty.");
      setEdit({...blank(),name:file.name.replace(/\.(txt|md|markdown|json)$/i,""),
        description:content,original_text:content,source_label:file.name});
    } catch(e){onError(errorText(e))}
  }
  const openEdit=(c:ChannelProfile)=>setEdit({
    id:c.id,name:c.name,description:c.description,audience:c.audience,voice:c.voice,
    editorial_rules:c.editorial_rules,content_pillars:c.content_pillars,
    original_text:c.original_text,source_label:c.source_label,confirmed:!!c.confirmed,
  });
  async function compare() {
    if(!sourceScript){onError("Create a script in this channel before searching script comparisons.");return;}
    setSearching(true);
    try {
      const rows=await request<ChannelScriptReference[]>("channel_script_references",{
        project_id:sourceScript.id,query,include_other_channels:includeOther,
        published_only:publishedOnly,
      });
      setReferences(rows);
    } catch(e){onError(errorText(e))}
    finally{setSearching(false)}
  }
  return <div className="content-view channel-view">
    <div className="view-heading">
      <div>
        <div className="eyebrow">A HOME FOR EACH CREATIVE VOICE</div>
        <h1>Channel profiles</h1>
        <p>Organize scripts beneath the channel they belong to. Each profile holds its own
          audience, voice, editorial rules, and focus. Compare with other channels only when you choose.</p>
      </div>
      <div className="framework-actions">
        <button className="primary" onClick={()=>setEdit(blank())}>+ New channel</button>
        <label className="framework-import">Import channel profile
          <input type="file" accept=".txt,.md,.markdown,.json"
            aria-label="Import channel profile file"
            onChange={e=>{const f=e.target.files?.[0];if(f)void importProfile(f);e.target.value=""}}/>
        </label>
      </div>
    </div>
    {channels.length>0 && <div className="channel-picker" aria-label="Channel list">
      {channels.map(c=><button key={c.id} className={c.id===activeId?"channel-picked":""}
        onClick={()=>setSelected(c.id)} aria-pressed={c.id===activeId}>
        <strong>{c.name}</strong> <small>{c.script_count} script{c.script_count===1?"":"s"}</small>
      </button>)}
    </div>}
    {active ? <>
      <article className="gem-card">
        <div className="row"><div>
          <div className="eyebrow">CHANNEL PROFILE</div>
          <h2>{active.name}</h2>
        </div><button onClick={()=>openEdit(active)}>Edit profile</button></div>
        <div className="gem-metadata">
          <span>{active.confirmed?"Confirmed profile":"Draft profile"}</span>
          {active.source_label&&<span>Imported: {active.source_label}</span>}
        </div>
        {active.description&&<p className="channel-prose">{active.description}</p>}
        <div className="channel-profile-fields">
          {([["Audience",active.audience],["Voice and presentation",active.voice],
            ["Editorial rules",active.editorial_rules],["Themes / content pillars",active.content_pillars]] as const)
            .filter(([,text])=>!!text).map(([name,value])=><section key={name}>
            <strong>{name}</strong><p>{value}</p></section>)}
        </div>
        {active.original_text && active.original_text!==active.description && <details>
          <summary>Original imported profile wording</summary>
          <p className="channel-prose">{active.original_text}</p>
        </details>}
      </article>
      <div className="row channel-script-header">
        <div><h2>Scripts for {active.name}</h2><p>One script project per video, with its own sections and research.</p></div>
        <button className="primary" onClick={()=>onNewScript(active.id)}>+ New video script</button>
      </div>
      <div className="gem-list">
        {scripts.map(s=><article key={s.id} className="gem-card channel-script-row">
          <div><strong>{s.title}</strong><p>{s.description||"No description yet"}</p>
          <small>{s.script_status}</small></div>
          <button onClick={()=>{
            const p=projects.find(x=>x.id===s.id);
            if(p)onOpenScript(p);
            else onError("This script was not found in your loaded project list.");
          }}>Open script</button>
        </article>)}
        {scripts.length===0&&<p className="muted">This channel has no scripts yet. Create the first one here.</p>}
      </div>
      <section className="channel-comparison">
        <div className="eyebrow">DISCOVER USEFUL LINKS BETWEEN SCRIPTS</div>
        <h2>Compare existing scripts</h2>
        <p>Search passages from other scripts. By default this searches published scripts in
          the current channel. Cross-channel access is an explicit choice, and results retain their channel attribution.</p>
        <label>Search script narration and sections
          <input aria-label="Compare script search" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="e.g. redemption, motivation, free will" />
        </label>
        <div className="channel-compare-options">
          <label><input type="checkbox" checked={includeOther} onChange={e=>setIncludeOther(e.target.checked)}/>
            Include other channels</label>
          <label><input type="checkbox" checked={publishedOnly} onChange={e=>setPublishedOnly(e.target.checked)}/>
            Published scripts only</label>
        </div>
        <button className="primary" disabled={searching||!sourceScript} onClick={()=>void compare()}>
          {searching?"Searching…":"Find related passages"}
        </button>
        {!sourceScript&&<p className="muted">Create a video script in this channel to enable comparisons.</p>}
        {references&&<div className="gem-list channel-results" aria-live="polite">
          <small>{references.length} matching script section{references.length===1?"":"s"} (up to 60)</small>
          {references.map((r,i)=><article className="gem-card" key={r.section_id+"-"+i}>
            <div className="gem-metadata">
              <span className="badge">{r.channel_name}</span><span>{r.script_status}</span>
            </div>
            <h3>{r.script_title} · {r.section_title}</h3>
            {r.section_kind && <small>{r.section_kind}</small>}
            <p className="channel-prose">{r.excerpt||"(No text in this section.)"}</p>
            <button onClick={()=>{
              const target=projects.find(p=>p.id===r.script_id);
              if(target)onOpenScript(target);
            }}>Open source script</button>
          </article>)}
        </div>}
      </section>
    </>:<div className="empty-state">
      <h2>Create your first channel identity.</h2>
      <p>Give your channel a profile before adding video scripts to its library.</p>
      <button className="primary" onClick={()=>setEdit(blank())}>Create channel</button>
    </div>}
    {edit&&<div className="modal-backdrop">
      <form className="modal gem-modal channel-modal" role="dialog" aria-modal="true"
        aria-label="Edit channel profile"
        onSubmit={async e=>{
          e.preventDefault();
          if(!edit.name.trim())return;
          setSaving(true);
          try{
            const saved=await request<{id:string}>("save_channel",edit);
            setSelected(saved.id);
            setEdit(null);
            await onSaved();
          }catch(e){onError(errorText(e))}
          finally{setSaving(false)}
        }}>
        <div className="eyebrow">YOUR CHANNEL, YOUR VOICE</div>
        <h2>{edit.id?"Edit channel profile":"New channel profile"}</h2>
        <label>Channel name<input required maxLength={300} value={edit.name}
          onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
        <label>Mission and description<textarea rows={4} maxLength={100000} value={edit.description}
          onChange={e=>setEdit({...edit,description:e.target.value})}/></label>
        <label>Audience<textarea rows={2} value={edit.audience}
          onChange={e=>setEdit({...edit,audience:e.target.value})}/></label>
        <label>Writing voice and narration style<textarea rows={3} value={edit.voice}
          onChange={e=>setEdit({...edit,voice:e.target.value})}/></label>
        <label>Editorial and reasoning rules<textarea rows={3} value={edit.editorial_rules}
          onChange={e=>setEdit({...edit,editorial_rules:e.target.value})}/></label>
        <label>Topics and content pillars<textarea rows={3} value={edit.content_pillars}
          onChange={e=>setEdit({...edit,content_pillars:e.target.value})}/></label>
        <label className="channel-confirm">
          <input type="checkbox" checked={edit.confirmed}
            onChange={e=>setEdit({...edit,confirmed:e.target.checked})}/>
          I have reviewed this profile; it represents this channel's intended voice.
        </label>
        <p className="muted">Only confirmed profiles qualify for future AI writing context.
          Importing a document never automatically confirms it.</p>
        <div className="row"><button type="button" disabled={saving} onClick={()=>setEdit(null)}>Cancel</button>
          <button className="primary" disabled={saving||!edit.name.trim()}>{saving?"Saving…":"Save channel"}</button>
        </div>
      </form>
    </div>}
  </div>;
}
