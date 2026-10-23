import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save, open } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { request, errorText } from "./api";
import type { Project, Chapter, Document, Source } from "./types";
import Manuscript from "./Editor";
import LibraryHome from "./LibraryHome";
import Updates from "./Updates";
import ChatPanel from "./ChatPanel";
import WriterProfile from "./WriterProfile";
import ConversationDraft from "./ConversationDraft";
import Research, { Search, SourceReader } from "./Research";
import MemoryView from "./Memory";
import GemsView from "./Gems";
import FrameworksView from "./Frameworks";
import type { ChannelProfile } from "./types";
import type { GemDraft } from "./types";
type View =
  "Dialogue" | "Write" | "Research" | "Conversations" | "Memory" | "Frameworks" | "Gems" | "Preview" | "Settings" | "Updates" | "Writer Profile" | "Conversation Draft";
const views: View[] = [
  "Dialogue",
  "Write",
  "Research",
  "Conversations",
  "Memory",
  "Frameworks",
  "Gems",
  "Preview",
  "Writer Profile",
  "Conversation Draft",
  "Updates",
  "Settings",
];
const symbols = ["◉", "✎", "▤", "☷", "◇", "◈", "❖", "▥", "♧", "☷", "⟳", "⚙"];
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [view, setView] = useState<View>("Write");
  const [boot, setBoot] = useState(true);
  const [homeUpdates,setHomeUpdates] = useState(false);
  const [chaptersByBook,setChaptersByBook] = useState<Record<string,number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [nav, setNav] = useState(false);
  const [research, setResearch] = useState(
    () => window.matchMedia("(min-width: 1051px)").matches,
  );
  const [focus, setFocus] = useState(false);
  const [availableUpdate,setAvailableUpdate] = useState<string|null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [captureGem, setCaptureGem] = useState<Partial<GemDraft> | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("noema-theme") ?? "light",
  );
  const [width, setWidth] = useState(330);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const lock = useRef(false);
  const report = useCallback((s: string) => setError(s), []);
  const registerFlush = useCallback((fn: () => Promise<void>) => {
    flushRef.current = fn;
  }, []);
  const activate = useCallback(async (p: Project) => {
    const cs = await request<Chapter[]>("chapters", { project_id: p.id });
    const first = cs[0]
      ? await request<Document>("chapter", { project_id: p.id, id: cs[0].id })
      : null;
    flushRef.current = async () => {};
    setProject(p);
    setChapters(cs);
    setDoc(first);
    setView(p.project_type === "Video Script" ? "Script Studio" : "Write");
    setSource(null);
    setCaptureGem(null);
    localStorage.setItem("noema-last-project", p.id);
  }, []);
  const refreshLibrary = useCallback(async()=>{
    const ps=await request<Project[]>("projects");
    setProjects(ps);
    const books=ps.filter(p=>p.project_type==="Book");
    const counts=await Promise.all(books.map(async p=>{
      try{return [p.id,(await request<Chapter[]>("chapters",{project_id:p.id})).length] as const}
      catch{return [p.id,undefined] as const}
    }));
    const next:Record<string,number>={};
    for(const [id,count] of counts)if(count!==undefined)next[id]=count;
    setChaptersByBook(next);
    return ps;
  },[]);
  useEffect(() => {
    let live = true;
    // Start in the library EVERY time, even if the last book is remembered.
    // The remembered id is only used to highlight/sort that book.
    void refreshLibrary().catch(e=>{if(live)report(errorText(e))})
      .finally(()=>{if(live)setBoot(false)});
    return ()=>{live=false};
  },[refreshLibrary,report]);
  const goLibrary=()=>void action(async()=>{
    flushRef.current=async()=>{};
    setProject(null);
    setChapters([]);
    setDoc(null);
    setView("Write");
    setSource(null);
    setCaptureGem(null);
    setNav(false);
    setFocus(false);
    setHomeUpdates(false);
    await refreshLibrary();
  });
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1051px)");
    const collapse = () => { if (!wide.matches) setResearch(false); };
    wide.addEventListener("change", collapse);
    return () => wide.removeEventListener("change", collapse);
  }, []);
  useEffect(()=>{
    if(!isTauri())return;
    let active=true;
    void invoke<{available:boolean;version?:string}>("update_check")
      .then(info=>{if(active&&info.available)setAvailableUpdate(info.version||null)})
      .catch(()=>{}); // The full error is available from the Updates screen.
    return()=>{active=false};
  },[]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("noema-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let off: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          await flushRef.current();
          await getCurrentWindow().destroy();
        } catch (e) {
          report(`Could not save before closing. ${errorText(e)}`);
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, [report]);
  async function action(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await flushRef.current();
      await fn();
    } catch (e) {
      report(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const changeView = (next: View) =>
    void action(async () => {
      if (next !== view) {
        flushRef.current = async () => {};
        if (next === "Write" && doc && project)
          setDoc(
            await request("chapter", { project_id: project.id, id: doc.id }),
          );
        setView(next);
      }
      setNav(false);
    });
  async function attachWritingSources(navigate=true) {
    if (!project) return;
    try {
      const selected = import.meta.env.DEV && import.meta.env.VITE_NOEMA_TEST_BRIDGE==="1"
        ? (window as unknown as {__NOEMA_TEST_FILES__?:string[]}).__NOEMA_TEST_FILES__??[]
        : await open({multiple:true,filters:[{name:"Book research",extensions:["txt","md","markdown","json","pdf","docx","epub"]}]});
      if (!selected) return;
      const files=Array.isArray(selected)?selected:[selected];
      if (!files.length)return;
      await action(async()=>{
        const failed:string[]=[];
        for(const path of files){
          try{await request("import",{project_id:project.id,path})}
          catch(e){failed.push(path.split(/[\\/]/).pop()+": "+errorText(e))}
        }
        if(navigate)setView("Research");
        if(failed.length)report(failed.join("\n"));
      });
    } catch(e){report(errorText(e))}
  }
  async function openCreatedChapter(id:string){
    if(!project)return;
    setChapters(await request<Chapter[]>("chapters",{project_id:project.id}));
    flushRef.current=async()=>{};
    setDoc(await request<Document>("chapter",{project_id:project.id,id}));
    setView("Write");
  }
  async function createChatChapter(title:string,text:string){
    if(!project)return;
    await action(async()=>{
      const result=await request<{id:string}>("create_chapter_from_text",
        {project_id:project.id,title,text});
      await openCreatedChapter(result.id);
    });
  }
  async function replaceChatChapter(text:string){
    if(!project||!doc)return;
    await action(async()=>{
      const latest=await request<Document>("chapter",{id:doc.id,project_id:project.id});
      const escape=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      const html=text.split(/\n\n+/).filter(x=>x.trim()).map(v=>
        "<p>"+escape(v).replace(/\n/g,"<br>")+"</p>").join("");
      await request("save_chapter",{
        id:doc.id,project_id:project.id,version:latest.version,
        html,text,snapshot:true,
      });
      const updated=await request<Document>("chapter",{id:doc.id,project_id:project.id});
      setDoc(updated);
    });
  }
  async function importSourceChapter(source:Source){
    if(!project)return;
    const title=window.prompt("New chapter title",source.name.replace(/\.[^.]+$/,""));
    if(!title?.trim())return;
    if(!window.confirm("Import the extracted text of "+source.name+" into a new editable chapter? The original source stays in the Research library."))return;
    await action(async()=>{
      const result=await request<{id:string}>("create_chapter_from_source",
        {project_id:project.id,source_id:source.id,title});
      await openCreatedChapter(result.id);
    });
  }
  async function reloadChapters() {
    if (project)
      setChapters(await request("chapters", { project_id: project.id }));
  }
  async function addChapter() {
    if (!project) return;
    const title = prompt(project.project_type === "Video Script" ? "Script section title" : "Chapter title");
    if (!title?.trim()) return;
    await action(async () => {
      const added = await request<{ id: string }>("create_chapter", {
        project_id: project.id,
        title: title.trim(),
      });
      await reloadChapters();
      const loaded = await request<Document>("chapter", {
        project_id: project.id,
        id: added.id,
      });
      flushRef.current = async () => {};
      setDoc(loaded);
      setView("Write");
      setNav(false);
    });
  }
  async function selectChapter(c: Chapter) {
    if (!project) return;
    if (doc?.id === c.id && view === "Write") {
      setNav(false);
      return;
    }
    await action(async () => {
      const loaded = await request<Document>("chapter", {
        project_id: project.id,
        id: c.id,
      });
      flushRef.current = async () => {};
      setDoc(loaded);
      setView("Write");
      setNav(false);
    });
  }
  async function moveChapter(index: number, delta: number) {
    if (!project) return;
    await action(async () => {
      const next = [...chapters];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      await request("reorder_chapters", {
        project_id: project.id,
        ids: next.map((c) => c.id),
      });
      setChapters(next);
    });
  }
  const isScript = project?.project_type === "Video Script";
  const workspaceViews = views;
  const viewLabel = (v: View) => ({
    Dialogue: "Book dialogue", Write: isScript ? "Freeform draft" : "Manuscript",
    Research: isScript ? "Script sources" : "Book sources",
    Conversations: isScript ? "Script conversations" : "Conversations",
    Memory: isScript ? "Script memory" : "Project memory", Frameworks: "Core frameworks",
    Gems: isScript ? "Script gems" : "Writing gems",
    Preview: isScript ? "Draft preview" : "Book preview", "Writer Profile": "Writer profile", "Conversation Draft": "Conversation draft", Updates: "Updates", Settings: "Settings",
  }[v]);
  if (boot)
    return (
      <div className="welcome">
        <div className="brand">NOEMA</div>
        <p>Opening your writing studio…</p>
      </div>
    );
  if (!project) return <>
    {homeUpdates ? <div className="book-library-updates">
      <div className="row"><h1>NOEMA updates</h1>
        <button onClick={()=>setHomeUpdates(false)}>← Back to library</button>
      </div>
      <Updates beforeInstall={async()=>await flushRef.current()} onError={report}/>
    </div> :
      <LibraryHome projects={projects} chaptersByBook={chaptersByBook}
        onOpen={p=>void action(async()=>{await activate(p)})}
        onCreate={()=>setNewProject(true)}
        onUpdates={()=>setHomeUpdates(true)}
        onTheme={()=>setTheme(v=>v==="light"?"dark":"light")}
        theme={theme} busy={busy} availableUpdate={availableUpdate}
        archivedScripts={projects.filter(p=>p.project_type==="Video Script").length}/>}
    {error&&<div className="error-banner" role="alert"><span>{error}</span>
      <button onClick={()=>setError("")}>Dismiss</button></div>}
    {newProject&&<ProjectForm canCancel onCancel={()=>setNewProject(false)}
      onCreate={async fields=>{
        const created=await request<{id:string}>("create_project",fields);
        const ps=await refreshLibrary();
        const book=ps.find(p=>p.id===created.id);
        if(!book)throw new Error("New book could not be found");
        await activate(book);
        setView("Research");
        setNewProject(false);
      }}/>}
  </>;
  return (
    <div
      className={`studio ${focus ? "focus" : ""} ${nav ? "nav-open" : ""}`}
      style={{ "--research-width": `${width}px` } as React.CSSProperties}
    >
      {!focus && (
        <aside className="navigator">
          <div className="brand">NOEMA<span>BOOK WRITING STUDIO</span></div>
          <button className="library-back" disabled={busy} onClick={goLibrary}>
            ← All books
          </button>
          <div className="project-switch">
            <div className="eyebrow">CURRENT PROJECT</div>
            <select
              aria-label="Current project"
              disabled={busy}
              value={project?.id ?? ""}
              onChange={(e) => {
                const p = projects.find((p) => p.id === e.target.value);
                if (p) void action(() => activate(p));
              }}
            >
              <optgroup label="Books">{projects.filter(p=>p.project_type==="Book").map(p=>
                <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>
            </select>
            <button
              className="new-project"
              onClick={() => setNewProject(true)}
            >
              + New book
            </button>
          </div>
          <nav aria-label="Workspace">
            {workspaceViews.map((v) => (
              <button
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => changeView(v)}
                disabled={!project || busy}
              >
                <span aria-hidden="true">{symbols[views.indexOf(v)]}</span>
                {viewLabel(v)} {v==="Updates"&&availableUpdate?" · "+availableUpdate:""}
              </button>
            ))}
          </nav>
          {(!isScript || view === "Write" || view === "Preview") && <>
          <div className="chapter-heading">
            <span className="eyebrow">{project?.project_type === "Video Script" ? "SCRIPT SECTIONS" : "CHAPTERS"} · {chapters.length}</span>
            <button
              aria-label={isScript ? "Add draft section" : "Add chapter"}
              disabled={!project || busy}
              onClick={addChapter}
            >
              +
            </button>
          </div>
          <ol className="chapters">
            {chapters.map((c, i) => (
              <li
                key={c.id}
                className={doc?.id === c.id && view === "Write" ? "active" : ""}
              >
                <button
                  className="chapter-link"
                  disabled={busy}
                  onClick={() => selectChapter(c)}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {c.title}
                </button>
                <div className="chapter-actions">
                  <button
                    title="Move chapter up"
                    aria-label={`Move ${c.title} up`}
                    disabled={!i || busy}
                    onClick={() => moveChapter(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    title="Move chapter down"
                    aria-label={`Move ${c.title} down`}
                    disabled={i === chapters.length - 1 || busy}
                    onClick={() => moveChapter(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    title="Rename chapter"
                    aria-label={`Rename ${c.title}`}
                    onClick={() => {
                      const title = prompt(isScript ? "Draft section title" : "Chapter title", c.title);
                      if (title?.trim())
                        void action(async () => {
                          await request("rename_chapter", {
                            project_id: project!.id,
                            id: c.id,
                            title: title.trim(),
                          });
                          await reloadChapters();
                          if (doc?.id === c.id)
                            setDoc({ ...doc, title: title.trim() });
                        });
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title="Delete chapter"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete “${c.title}” from your ${isScript ? "draft" : "manuscript"}? Its content will remain in the database for recovery.`,
                        )
                      )
                        void action(async () => {
                          await request("delete_chapter", {
                            project_id: project!.id,
                            id: c.id,
                          });
                          await reloadChapters();
                          if (doc?.id === c.id) {
                            flushRef.current = async () => {};
                            setDoc(null);
                          }
                        });
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
          </>}
          <div className="nav-footer">
            <span className="local-dot" />
            Local & private<span>Version 0.1.9</span>
          </div>
        </aside>
      )}
      <main>
        <header className="topbar">
          <button
            className="mobile-nav"
            aria-label="Toggle navigation"
            onClick={() => setNav(!nav)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            {project.title}
            <span> / {viewLabel(view)}</span>
          </div>
          <div className="top-actions">
            {availableUpdate && <button
              className="primary" aria-label={"Update NOEMA to "+availableUpdate}
              onClick={()=>changeView("Updates")}>
              Update NOEMA · {availableUpdate}
            </button>}
            {project && <button className="attach-source-button" title="Attach books and supporting sources to this writing project" onClick={()=>void attachWritingSources()}>
              + Attach sources
            </button>}
            {project && !isScript && <button aria-pressed={view==="Dialogue"}
              title="Open a full-page book-writing conversation"
              onClick={()=>changeView("Dialogue")}>
              Open dialogue
            </button>}
            {project && <button title="Save a passage to Writing Gems" onClick={() => {
              const selected = window.getSelection()?.toString().trim() ?? "";
              setCaptureGem({
                text: selected,
                chapter_id: doc?.id ?? null,
                kind: "Quote",
                origin: view === "Write" ? "Author" : "Unspecified",
                source_label: view === "Write" && doc ? `${isScript ? "Draft" : "Manuscript"}: ${doc.title}` : "",
                notes: "",
                status: "Candidate",
              });
              changeView("Gems");
            }}>❖ Save passage</button>}
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label="Toggle theme"
            >
              {theme === "light" ? "◐" : "☀"}
            </button>
            <button onClick={() => setFocus(!focus)}>
              {focus ? "Exit focus" : "Focus"}
            </button>
            <button
              aria-pressed={research}
              onClick={() => setResearch(!research)}
            >
              {research ? "Hide research" : "Show research"}
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="workspace">
          <section className="main-view" aria-busy={busy}>
            {!project ? (
              <div className="empty-state">
                <div className="brand">NOEMA</div>
                <h1>Where Thought Becomes Legacy.</h1>
                <p>
                  Your books, research, and understanding. In one place, on your
                  computer.
                </p>
                <button className="primary" onClick={() => setNewProject(true)}>
                  Create your first writing project
                </button>
              </div>
            ) : view === "Write" ? (
              doc ? (
                <Manuscript
                  script={!!isScript}
                  disabled={busy}
                  key={`${doc.id}:${doc.version}`}
                  doc={doc}
                  onFlush={registerFlush}
                  onError={report}
                />
              ) : (
                <div className="empty-state">
                  <span className="large-symbol">✎</span>
                  <h1>{project.project_type === "Book" ? "Every book begins with a thought." : "Every script begins with a thought."}</h1>
                  <p>Create a section and give it room to grow.</p>
                  <button className="primary" onClick={addChapter}>
                    {isScript ? "Create a draft section" : "Create a chapter"}
                  </button>
                </div>
              )
            ) : view === "Dialogue" ? (
              <ChatPanel key={project.id}
                project={project}
                activeChapter={doc}
                onError={report}
                onCreateChapter={createChatChapter}
                onReplaceChapter={replaceChatChapter}
                onGem={text=>{
                  setCaptureGem({text,kind:"Reasoning",origin:"AI Assistant",status:"Candidate",
                    chapter_id:doc?.id??null,source_label:"NOEMA book dialogue"});
                  changeView("Gems");
                }}
                onAttach={async()=>attachWritingSources(false)}
                onGoDraft={()=>changeView("Conversation Draft")}
              />
            ) : view === "Research" || view === "Conversations" ? (
              <Research
                script={!!isScript}
                key={`${project.id}-${view}`}
                project={project.id}
                conversations={view === "Conversations"}
                onOpen={setSource}
                onError={report}
                onChapterCreated={importSourceChapter}
              />
            ) : view === "Memory" ? (
              <MemoryView
                script={!!isScript}
                key={project.id}
                project={project.id}
                onError={report}
              />
            ) : view === "Frameworks" ? (
              <FrameworksView key={project.id} project={project.id} onError={report} />
            ) : view === "Updates" ? (
              <div className="content-view"><Updates beforeInstall={async()=>await flushRef.current()} onError={report}/></div>
            ) : view === "Writer Profile" ? (
              <WriterProfile onError={report}/>
            ) : view === "Conversation Draft" ? (
              <ConversationDraft key={project.id} project={project.id} onError={report}
                onCreateChapter={createChatChapter}/>
            ) : view === "Gems" ? (
              <GemsView
                script={!!isScript}
                project={project.id}
                chapters={chapters}
                capture={captureGem}
                onCaptureHandled={() => setCaptureGem(null)}
                onError={report}
              />
            ) : view === "Preview" ? (
              <Preview project={project} chapters={chapters} onError={report} />
            ) : (
              <Settings
                project={project}
                channels={channels}
                theme={theme}
                setTheme={setTheme}
                onError={report}
                beforeInstall={async()=>await flushRef.current()}
                onUpdated={async () => {
                  const ps = await request<Project[]>("projects");
                  setProjects(ps);
                  setProject(ps.find((p) => p.id === project.id)!);
                }}
              />
            )}
          </section>
          {project && research && view!=="Dialogue" && !focus && (
            <>
              <div
                className="resize-handle"
                role="separator"
                aria-label="Research panel width"
                aria-orientation="vertical"
                aria-valuenow={width}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft")
                    setWidth((x) => Math.min(520, x + 20));
                  if (e.key === "ArrowRight")
                    setWidth((x) => Math.max(260, x - 20));
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    setWidth(
                      Math.max(
                        260,
                        Math.min(520, window.innerWidth - e.clientX),
                      ),
                    );
                }}
              />
              <aside className="research-panel">
                <button
                  className="research-close"
                  aria-label="Close research panel"
                  onClick={() => setResearch(false)}
                >
                  ×
                </button>
                <Search
                  scope={isScript ? "SCRIPT RESEARCH" : "BOOK RESEARCH"}
                  key={project.id}
                  project={project.id}
                  onOpen={setSource}
                />
              </aside>
            </>
          )}
        </div>
      </main>
      {source && project && (
        <SourceReader
          key={source.id}
          source={source}
          project={project.id}
          onClose={() => setSource(null)}
        />
      )}
      {newProject && (
        <ProjectForm canCancel onCancel={()=>setNewProject(false)}
          onCreate={async fields=>{
            const added=await request<{id:string}>("create_project",fields);
            const ps=await refreshLibrary();
            const book=ps.find(p=>p.id===added.id);
            if(!book)throw new Error("New book could not be found");
            await activate(book);
            setView("Research");
            setNewProject(false);
          }}/>
      )}
    </div>
  );
}
function ProjectForm({canCancel,onCancel,onCreate}:{
  canCancel:boolean;
  onCancel:()=>void;
  onCreate:(fields:Record<string,string>)=>Promise<void>;
}){
  const [title,setTitle]=useState("");
  const [author,setAuthor]=useState("");
  const [description,setDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  return <div className="modal-backdrop onboarding">
    <form className="modal" role="dialog" aria-modal="true" aria-label="New writing project"
      onSubmit={async e=>{
        e.preventDefault();
        setBusy(true);setError("");
        try{await onCreate({title:title.trim(),author:author.trim(),description,project_type:"Book",channel_id:""})}
        catch(e){setError(errorText(e))}finally{setBusy(false)}
      }}>
      <div className="brand">NOEMA</div>
      <div className="eyebrow">A NEW PLACE FOR YOUR THOUGHTS</div>
      <h1>Create a book project</h1>
      <p>Give your book a home. Its chapters, research, and conversations will stay together here.</p>
      <label>Book title
        <input autoFocus required maxLength={500} value={title}
          onChange={e=>setTitle(e.target.value)} placeholder="The book only you can write"/>
      </label>
      <label>Author
        <input required maxLength={500} value={author}
          onChange={e=>setAuthor(e.target.value)} placeholder="Your name"/>
      </label>
      <label>Description <span className="muted">(optional)</span>
        <textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)}
          placeholder="What is this book here to explore?"/>
      </label>
      {error&&<p role="alert">{error}</p>}
      <div className="row">
        {canCancel&&<button type="button" disabled={busy} onClick={onCancel}>Cancel</button>}
        <button className="primary" disabled={busy||!title.trim()||!author.trim()}>
          {busy?"Creating…":"Create book →"}
        </button>
      </div>
    </form>
  </div>;
}
function Preview({
  project,
  chapters,
  onError,
}: {
  project: Project;
  chapters: Chapter[];
  onError: (s: string) => void;
}) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all(
      chapters
        .slice(page * 5, page * 5 + 5)
        .map((c) =>
          request<Document>("chapter", { project_id: project.id, id: c.id }),
        ),
    )
      .then((v) => {
        if (live) setDocs(v);
      })
      .catch((e) => onError(errorText(e)))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [project.id, chapters, page, onError]);
  return (
    <div className="preview-scroll">
      <div className="preview-controls">
        <span className="eyebrow">{project.project_type === "Video Script" ? "READ-ONLY VIDEO SCRIPT" : "READ-ONLY BOOK PREVIEW"}</span>
        <span>
          {project.project_type === "Book" ? "Chapters" : "Draft sections"} {chapters.length ? page * 5 + 1 : 0}–
          {Math.min(page * 5 + 5, chapters.length)} of {chapters.length}
        </span>
      </div>
      <article className="book-preview">
        {page === 0 && (
          <div className="title-page">
            <div className="eyebrow">A WORK IN PROGRESS</div>
            <h1>{project.title}</h1>
            <p>{project.author}</p>
            <span>❧</span>
          </div>
        )}
        {loading ? (
          <p>Preparing pages…</p>
        ) : (
          docs.map((d, i) => (
            <section className="preview-chapter" key={d.id}>
              <div className="eyebrow">{project.project_type === "Video Script" ? "SECTION" : "CHAPTER"} {page * 5 + i + 1}</div>
              <h1>{d.title}</h1>
              <div
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(d.html) }}
              />
            </section>
          ))
        )}
      </article>
      <div className="row">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous {project.project_type === "Book" ? "chapters" : "sections"}
        </button>
        <button
          disabled={(page + 1) * 5 >= chapters.length}
          onClick={() => setPage(page + 1)}
        >
          Next {project.project_type === "Book" ? "chapters" : "sections"}
        </button>
      </div>
    </div>
  );
}
function Settings({
  project,
  channels,
  theme,
  setTheme,
  onError,
  onUpdated,
  beforeInstall,
}: {
  project: Project;
  channels: ChannelProfile[];
  theme: string;
  setTheme: (s: string) => void;
  onError: (s: string) => void;
  onUpdated: () => Promise<void>;
  beforeInstall: () => Promise<void>;
}) {
  const [title, setTitle] = useState(project.title);
  const [author, setAuthor] = useState(project.author);
  const [description, setDescription] = useState(project.description);
  const projectType = project.project_type;
  const [channelId,setChannelId] = useState(project.channel_id??"");
  const [scriptStatus,setScriptStatus] = useState(project.script_status);
  const [path, setPath] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    request<{ path: string }>("storage")
      .then((v) => setPath(v.path))
      .catch((e) => onError(errorText(e)));
  }, [onError]);
  return (
    <div className="content-view settings">
      <div className="eyebrow">YOUR STUDIO, YOUR WAY</div>
      <h1>Settings</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("update_project", {
              project_id: project.id,
              title,
              author,
              description,
              project_type: projectType,
              channel_id: projectType==="Video Script" ? channelId : "",
              script_status: scriptStatus,
              settings: JSON.parse(project.settings),
            });
            await onUpdated();
            setNote("Project details saved.");
          } catch (err) {
            onError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{projectType === "Book" ? "Book details" : "Channel script details"}</h2>
        {projectType === "Video Script" && <>
          <label>Channel
            <select value={channelId} onChange={e=>setChannelId(e.target.value)}>
              <option value="">Unassigned (legacy scripts only)</option>
              {channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Production status
            <select value={scriptStatus} onChange={e=>setScriptStatus(e.target.value as Project["script_status"])}>
              <option>Draft</option><option>In Production</option><option>Published</option>
            </select>
          </label>
        </>}
        <label>
          Project title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Author
          <input
            required
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          Save project details
        </button>
      </form>
      <section>
        <h2>Appearance</h2>
        <div className="row">
          <p>Choose a comfortable writing environment.</p>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "Use dark theme" : "Use light theme"}
          </button>
        </div>
      </section>
      <section>
        <h2>Your local archive</h2>
        <p>SQLite storage, original source files, and writing history.</p>
        <code>{path || "Locating data folder…"}</code>
        <p>
          Back up all projects to a new folder. The backup includes a consistent
          database snapshot and original source files.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            try {
              const dest = await save({
                title: "Choose a new backup folder name",
                defaultPath: `NOEMA-backup-${new Date().toISOString().slice(0, 10)}`,
              });
              if (!dest) return;
              setBusy(true);
              const result = await request<{ path: string }>("backup", {
                path: dest,
              });
              setNote(`Backup saved: ${result.path}`);
            } catch (e) {
              onError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Create complete backup
        </button>
      </section>
      <Updates onError={onError} beforeInstall={beforeInstall} />
      {note && (
        <p role="status" className="notice">
          {note}
        </p>
      )}
    </div>
  );
}
