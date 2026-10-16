import { useEffect, useState } from "react";
import { request, errorText } from "./api";
import {
  gemKinds, gemOrigins, gemStatuses,
  type BookGem, type Chapter, type GemDraft,
} from "./types";

function emptyGem(): GemDraft {
  return {
    chapter_id: null,
    kind: "Quote",
    text: "",
    notes: "",
    origin: "Unspecified",
    source_label: "",
    status: "Candidate",
  };
}

export default function GemsView({
  script = false, project, chapters, capture, onCaptureHandled, onError,
}: {
  script?: boolean;
  project: string;
  chapters: Chapter[];
  capture: Partial<GemDraft> | null;
  onCaptureHandled: () => void;
  onError: (message: string) => void;
}) {
  const [items, setItems] = useState<BookGem[]>([]);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("");
  const [kind, setKind] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [edit, setEdit] = useState<GemDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (capture) {
      setEdit({ ...emptyGem(), ...capture });
      onCaptureHandled();
    }
  }, [capture, onCaptureHandled]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void request<BookGem[]>("gems", {
        project_id: project, query, chapter_id: chapter, kind, offset,
      }).then((rows) => {
        if (active) setItems(rows);
      }).catch((e) => { if (active) onError(errorText(e)); });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [project, query, chapter, kind, offset, refresh, onError]);

  const chapterName = (id: string | null) =>
    chapters.find((x) => x.id === id)?.title || "Unassigned";

  return (
    <div className="content-view gems-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">PASSAGES WORTH KEEPING</div>
          <h1>{script ? "Script Gems" : "Writing Gems"}</h1>
          <p>Ideas, arguments and possible {script ? "script" : "book"} lines. Candidates are not confirmed positions and are not automatically inserted into your {script ? "script" : "manuscript"}.</p>
        </div>
        <button className="primary" onClick={() => setEdit(emptyGem())}>+ Add passage</button>
      </div>
      <div className="gem-filters">
        <label>Search passages
          <input aria-label={script ? "Search script gems" : "Search book gems"} value={query} placeholder="Find a sentence or argument" onChange={e => {setQuery(e.target.value); setOffset(0);}} />
        </label>
        <label>{script ? "Draft section" : "Chapter"}
          <select aria-label={script ? "Filter gems by draft section" : "Filter gems by chapter"} value={chapter} onChange={e => {setChapter(e.target.value); setOffset(0);}}>
            <option value="">{script ? "All draft sections" : "All chapters"}</option>
            {chapters.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label>Type
          <select aria-label="Filter gems by type" value={kind} onChange={e => {setKind(e.target.value); setOffset(0);}}>
            <option value="">All types</option>
            {gemKinds.map(k => <option key={k}>{k}</option>)}
          </select>
        </label>
      </div>
      <div className="gem-list">
        {items.map(g => <article key={g.id} className="gem-card">
          <div className="gem-metadata">
            <span className="badge">{g.kind}</span>
            <span>{chapterName(g.chapter_id)}</span>
            <span>{g.status}</span>
          </div>
          <blockquote>{g.text}</blockquote>
          {g.notes && <p>{g.notes}</p>}
          <small>Origin: {g.origin}{g.source_label ? ` · ${g.source_label}` : ""}</small>
          {g.original_text !== g.text && <details><summary>Original captured wording</summary><p>{g.original_text}</p></details>}
          <div className="row gem-actions">
            <button onClick={() => setEdit({
              id:g.id, chapter_id:g.chapter_id, kind:g.kind, text:g.text,
              notes:g.notes, origin:g.origin, source_label:g.source_label, status:g.status,
            })}>Review / edit</button>
            <button className="danger" onClick={() => {
              if (!window.confirm("Remove this passage from Writing Gems? It will be hidden, not erased from the database.")) return;
              void request("delete_gem", { project_id:project, id:g.id })
                .then(() => setRefresh(n => n+1)).catch(e => onError(errorText(e)));
            }}>Remove</button>
          </div>
        </article>)}
      </div>
      {items.length === 0 && <div className="empty-state">
        <span className="large-symbol">❖</span>
        <h2>Your best passages belong somewhere permanent.</h2>
        <p>Save a selected passage from the manuscript, or add a sentence you want to keep for later.</p>
      </div>}
      <div className="row">
        <button disabled={offset === 0} onClick={() => setOffset(n => Math.max(0,n-100))}>Previous</button>
        <button disabled={items.length < 100} onClick={() => setOffset(n => n+100)}>More passages</button>
      </div>
      {edit && <div className="modal-backdrop">
        <form className="modal gem-modal" role="dialog" aria-modal="true" aria-label={script ? "Edit script gem" : "Edit book gem"}
          onSubmit={async e => {
            e.preventDefault();
            if (!edit.text.trim()) return;
            setSaving(true);
            try {
              await request("save_gem", { ...edit, project_id:project });
              setEdit(null); setRefresh(n => n+1); setOffset(0);
            } catch (error) { onError(errorText(error)); }
            finally { setSaving(false); }
          }}>
          <div className="eyebrow">WRITING GEMS · YOUR BOOK, YOUR CHOICE</div>
          <h2>{edit.id ? "Review a saved passage" : "Keep a passage"}</h2>
          <label>Text or reasoning
            <textarea required rows={6} value={edit.text} onChange={e => setEdit({ ...edit, text:e.target.value })}
              placeholder="Paste a line, explanation, or argument worth keeping" />
          </label>
          <div className="gem-form-grid">
            <label>Type
              <select value={edit.kind} onChange={e => setEdit({ ...edit, kind:e.target.value as GemDraft["kind"] })}>
                {gemKinds.map(k => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label>{script ? "Draft section" : "Chapter"}
              <select value={edit.chapter_id ?? ""} onChange={e => setEdit({ ...edit,chapter_id:e.target.value || null })}>
                <option value="">Unassigned</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label>Status
              <select value={edit.status} onChange={e => setEdit({ ...edit,status:e.target.value as GemDraft["status"] })}>
                {gemStatuses.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Origin (permanent)
              <select disabled={!!edit.id} value={edit.origin} onChange={e => setEdit({ ...edit,origin:e.target.value as GemDraft["origin"] })}>
                {gemOrigins.map(o => <option key={o}>{o}</option>)}
              </select>
            </label>
          </div>
          <label>Source reference (conversation / document / location)
            <input disabled={!!edit.id} value={edit.source_label} onChange={e => setEdit({ ...edit,source_label:e.target.value })} placeholder="Optional source identification" />
          </label>
          <label>Why this passage matters
            <textarea rows={3} value={edit.notes} onChange={e => setEdit({ ...edit, notes:e.target.value })} placeholder="How you might use or revise it" />
          </label>
          <small>Original wording and attribution stay intact after edits. Nothing here changes your manuscript automatically.</small>
          <div className="row">
            <button type="button" disabled={saving} onClick={() => {if (window.confirm("Discard unsaved changes?")) setEdit(null);}}>Cancel</button>
            <button className="primary" disabled={saving || !edit.text.trim()}>{saving ? "Saving…" : "Save passage"}</button>
          </div>
        </form>
      </div>}
    </div>
  );
}
