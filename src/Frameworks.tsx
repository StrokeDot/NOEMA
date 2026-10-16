import { useEffect, useState } from "react";
import { request, errorText } from "./api";
import {
  frameworkPerspectives, frameworkStatuses,
  type CoreFramework, type FrameworkDraft,
} from "./types";

const empty = (): FrameworkDraft => ({
  title: "", perspective: "Author", principles: "", qualifications: "",
  source_label: "", status: "Draft",
});

export default function FrameworksView({
  project, onError,
}: {
  project: string;
  onError: (message: string) => void;
}) {
  const [frameworks, setFrameworks] = useState<CoreFramework[]>([]);
  const [context, setContext] = useState<CoreFramework[]>([]);
  const [edit, setEdit] = useState<FrameworkDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([
      request<CoreFramework[]>("frameworks", { project_id: project }),
      request<CoreFramework[]>("framework_context", { project_id: project }),
    ]).then(([all, selected]) => {
      if (live) { setFrameworks(all); setContext(selected); }
    }).catch(e => { if (live) onError(errorText(e)); });
    return () => { live = false; };
  }, [project, refresh, onError]);

  const update = () => setRefresh(n => n + 1);

  async function loadFile(file: File) {
    if (!/\.(txt|md|markdown|json)$/i.test(file.name)) {
      onError("Choose a local TXT, Markdown, or JSON text file. PDFs can be imported into Research.");
      return;
    }
    if (file.size > 500_000) {
      onError("Framework text files are limited to 500 KB. Split large archives into specific frameworks.");
      return;
    }
    setLoadingFile(true);
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("The selected text file is empty.");
      setEdit({
        ...empty(),
        perspective: "Custom",
        title: file.name.replace(/\.(txt|md|markdown|json)$/i, ""),
        principles: text,
        source_label: file.name,
      });
    } catch (e) {
      onError(errorText(e));
    } finally {
      setLoadingFile(false);
    }
  }

  async function setActive(framework: CoreFramework, next: boolean) {
    setBusy(true);
    try {
      await request("set_framework_active", {
        project_id: project, framework_id: framework.id, active: next,
      });
      update();
    } catch (e) {
      onError(errorText(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="content-view framework-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">THE PREMISES BEHIND THE WRITING</div>
          <h1>Core frameworks</h1>
          <p>Store your beliefs and alternative perspectives in a reusable local library.
            Confirm them and choose which apply to this project. An external perspective
            is never automatically recorded as your own.</p>
        </div>
        <div className="framework-actions">
          <button className="primary" onClick={() => setEdit(empty())}>+ New framework</button>
          <label className="framework-import">
            {loadingFile ? "Reading…" : "Import TXT / MD / JSON"}
            <input type="file" accept=".txt,.md,.markdown,.json" disabled={loadingFile}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = "";
              }} />
          </label>
        </div>
      </div>
      <div className="framework-summary" role="status">
        <strong>{context.length} confirmed framework{context.length === 1 ? "" : "s"} active</strong>
        <span>Only confirmed, activated frameworks are eligible for future AI context.
          NOEMA's AI model connection is not implemented yet.</span>
      </div>
      <label>Search your framework library
        <input aria-label="Search core frameworks" value={filter}
          placeholder="Find a principle or perspective"
          onChange={e => setFilter(e.target.value)} />
      </label>
      <div className="gem-list">
        {frameworks.filter(f => [f.title,f.principles,f.qualifications].some(v =>
          v.toLowerCase().includes(filter.toLowerCase()))).map(f =>
          <article className="gem-card" key={f.id}>
            <div className="gem-metadata">
              <span className="badge">{f.perspective === "Author" ? "Author's framework" : f.perspective}</span>
              <span>{f.status}</span>
              {f.source_label && <span>Imported: {f.source_label}</span>}
            </div>
            <h2>{f.title}</h2>
            <p className="framework-excerpt">{f.principles}</p>
            {f.qualifications && <details>
              <summary>Qualifications and limits</summary>
              <p>{f.qualifications}</p>
            </details>}
            {f.original_text !== f.principles && <details>
              <summary>Original wording, retained</summary>
              <p className="framework-excerpt">{f.original_text}</p>
            </details>}
            <div className="row framework-card-controls">
              <label className="framework-toggle">
                <input type="checkbox" checked={!!f.active} disabled={busy || f.status !== "Confirmed"}
                  onChange={e => void setActive(f,e.target.checked)} />
                Use in this project
              </label>
              <button disabled={busy} onClick={() => setEdit({
                id:f.id,title:f.title,perspective:f.perspective,
                principles:f.principles,qualifications:f.qualifications,
                source_label:f.source_label,status:f.status,
              })}>Review / edit</button>
              <button className="danger" disabled={busy}
                onClick={async () => {
                  if (!window.confirm(`Archive “${f.title}” for all projects? This keeps the record in local storage.`)) return;
                  setBusy(true);
                  try { await request("archive_framework",{id:f.id}); update(); }
                  catch(e) { onError(errorText(e)); }
                  finally { setBusy(false); }
                }}>Archive</button>
            </div>
          </article>
        )}
      </div>
      {frameworks.length === 0 && <div className="empty-state">
        <h2>Begin with your premises.</h2>
        <p>Create a framework, or import a plain-text document describing principles,
          qualifications, and reasoning rules. Nothing is activated automatically.</p>
      </div>}
      {edit && <div className="modal-backdrop">
        <form className="modal gem-modal framework-modal" role="dialog" aria-modal="true"
          aria-label="Edit core belief framework"
          onSubmit={async e => {
            e.preventDefault();
            if (!edit.title.trim() || !edit.principles.trim()) return;
            setBusy(true);
            try {
              await request("save_framework",edit);
              setEdit(null); update();
            } catch (e) { onError(errorText(e)); }
            finally { setBusy(false); }
          }}>
          <div className="eyebrow">AUTHOR-OWNED REASONING FRAMEWORK</div>
          <h2>{edit.id ? "Review framework" : "Create framework"}</h2>
          <label>Title
            <input required maxLength={500} value={edit.title}
              onChange={e => setEdit({ ...edit,title:e.target.value })} />
          </label>
          <div className="gem-form-grid">
            <label>Whose perspective?
              <select value={edit.perspective} onChange={e => setEdit({
                ...edit,perspective:e.target.value as FrameworkDraft["perspective"],
              })}>{frameworkPerspectives.map(p => <option key={p}>{p}</option>)}</select>
            </label>
            <label>Review status
              <select value={edit.status} onChange={e => setEdit({
                ...edit,status:e.target.value as FrameworkDraft["status"],
              })}>{frameworkStatuses.map(st => <option key={st}>{st}</option>)}</select>
            </label>
          </div>
          <p className="muted">“Confirmed” means you reviewed this framework's accuracy.
            It does not mean its claims have been independently verified.</p>
          <label>Core principles / position document
            <textarea required rows={9} maxLength={500000} value={edit.principles}
              onChange={e => setEdit({ ...edit,principles:e.target.value })} />
          </label>
          <label>Qualifications, rejected interpretations, and boundaries
            <textarea rows={4} maxLength={100000} value={edit.qualifications}
              onChange={e => setEdit({ ...edit,qualifications:e.target.value })} />
          </label>
          {edit.source_label && <p className="muted">Original imported filename: {edit.source_label}.
            The original text remains preserved separately when you edit a framework.</p>}
          <div className="row">
            <button type="button" disabled={busy} onClick={() => {
              if (!window.confirm("Discard unsaved framework edits?")) return;
              setEdit(null);
            }}>Cancel</button>
            <button className="primary" disabled={busy || !edit.title.trim() || !edit.principles.trim()}>
              {busy ? "Saving…" : "Save framework"}
            </button>
          </div>
        </form>
      </div>}
    </div>
  );
}
