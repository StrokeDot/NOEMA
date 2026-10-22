import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save, open } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { request, errorText } from "./api";
import type { Project, Chapter, Document, Source } from "./types";
import Manuscript from "./Editor";
import ScriptStudio from "./ScriptStudio";
import Updates from "./Updates";
import ChatPanel from "./ChatPanel";
import WriterProfile from "./WriterProfile";
import ConversationDraft from "./ConversationDraft";
import Research, { Search, SourceReader } from "./Research";
import MemoryView from "./Memory";
import GemsView from "./Gems";
import FrameworksView from "./Frameworks";
import ChannelsView from "./Channels";
import type { ChannelProfile } from "./types";
import type { GemDraft } from "./types";
type View =
  "Script Studio" | "Write" | "Research" | "Conversations" | "Memory" | "Frameworks" | "Channels" | "Gems" | "Preview" | "Settings" | "Writer Profile" | "Conversation Draft";
const views: View[] = [
  "Script Studio",
  "Write",
  "Research",
  "Conversations",
  "Memory",
  "Frameworks",
  "Channels",
  "Gems",
  "Preview",
  "Writer Profile",
  "Conversation Draft",
  "Settings",
];
const symbols = ["▦", "✎", "▤", "☷", "◇", "◈", "▣", "❖", "▥", "♧", "☷", "⚙"];
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [newScriptChannel, setNewScriptChannel] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [view, setView] = useState<View>("Write");
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [newProjectType, setNewProjectType] = useState<Project["project_type"] | null>(null);
  const [nav, setNav] = useState(false);
  const [research, setResearch] = useState(
    () => window.matchMedia("(min-width: 1051px)").matches,
  );
  const [focus, setFocus] = useState(false);
  const [chatOpen,setChatOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [captureGem, setCaptureGem] = useState<Partial<GemDraft> | null>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("noema-theme") ?? "light",
  );
  const [width, setWidth] = useState(330);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const lock = useRef(false);
  const report = useCallback((s: string) => setError(s), []);
  const reloadChannels = useCallback(async () => { const data=await request<ChannelProfile[]>("channels");setChannels(data);return data; }, []);
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
  useEffect(() => {
    let live = true;
    request<ChannelProfile[]>("channels").then(setChannels).catch(e=>report(errorText(e)));
    request<Project[]>("projects")
      .then(async (ps) => {
        if (!live) return;
        setProjects(ps);
        const initial =
          ps.find((p) => p.id === localStorage.getItem("noema-last-project")) ??
          ps[0];
        if (initial) await activate(initial);
        else setNewProject(true);
      })
      .catch((e) => report(errorText(e)))
      .finally(() => {
        if (live) setBoot(false);
      });
    return () => {
      live = false;
    };
  }, [activate, report]);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1051px)");
    const collapse = () => { if (!wide.matches) setResearch(false); };
    wide.addEventListener("change", collapse);
    return () => wide.removeEventListener("change", collapse);
  }, []);
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
        : await open({multiple:true,filters:[{name:"Book and script research",extensions:["txt","md","markdown","json","pdf","docx","epub"]}]});
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
  const workspaceViews = isScript
    ? views.filter(v => v !== "Write" && v !== "Preview")
    : views.filter(v => v !== "Script Studio" && v !== "Channels");
  // Retain access to legacy freeform script material without presenting it as a book.
  if (isScript) workspaceViews.splice(1, 0, "Write", "Preview");
  const viewLabel = (v: View) => ({
    "Script Studio": "Video script studio", Write: isScript ? "Freeform draft" : "Manuscript",
    Research: isScript ? "Script sources" : "Book sources",
    Conversations: isScript ? "Script conversations" : "Conversations",
    Memory: isScript ? "Script memory" : "Project memory", Frameworks: "Core frameworks",
    Channels: "Channel profiles", Gems: isScript ? "Script gems" : "Writing gems",
    Preview: isScript ? "Draft preview" : "Book preview", "Writer Profile": "Writer profile", "Conversation Draft": "Conversation draft", Settings: "Settings",
  }[v]);
  const switchWorkspace = (type: Project["project_type"]) => void action(async () => {
    const existing = projects.find(p => p.project_type === type);
    if (existing) await activate(existing);
    else { setNewProjectType(type); setNewScriptChannel(null); setNewProject(true); }
    setNav(false);
  });
  if (boot)
    return (
      <div className="welcome">
        <div className="brand">NOEMA</div>
        <p>Opening your writing studio…</p>
      </div>
    );
  return (
    <div
      className={`studio ${focus ? "focus" : ""} ${nav ? "nav-open" : ""}`}
      style={{ "--research-width": `${width}px` } as React.CSSProperties}
    >
      {!focus && (
        <aside className="navigator">
          <div className="brand">
            NOEMA<span>{isScript ? "YOUTUBE SCRIPT STUDIO" : "BOOK WRITING STUDIO"}</span>
          </div>
          <div className="workspace-switch" aria-label="Switch workspace">
            <button aria-pressed={!isScript} onClick={() => switchWorkspace("Book")} disabled={busy}>Books</button>
            <button aria-pressed={!!isScript} onClick={() => switchWorkspace("Video Script")} disabled={busy}>YouTube channels</button>
          </div>
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
              {!project && <option value="">Choose your writing project</option>}
              {!isScript && <optgroup label="Books">{projects.filter(p=>p.project_type==="Book").map(p=>
                <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>}
              {isScript && channels.map(c=><optgroup key={c.id} label={c.name}>
                {projects.filter(p=>p.project_type==="Video Script" && p.channel_id===c.id)
                  .map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
              </optgroup>)}
              {isScript && <optgroup label="Unassigned video scripts">
                {projects.filter(p=>p.project_type==="Video Script" && !p.channel_id)
                  .map(p=><option key={p.id} value={p.id}>{p.title}</option>)}
              </optgroup>}
            </select>
            <button
              className="new-project"
              onClick={() => void action(async () => {setNewScriptChannel(null);setNewProjectType(null);setNewProject(true);})}
            >
              + New writing project
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
                {viewLabel(v)}
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
            Local & private<span>Version 0.1.4</span>
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
            {project?.title ?? "Your writing studio"}
            <span> / {viewLabel(view)}</span>
          </div>
          <div className="top-actions">
            {project && <button className="attach-source-button" title="Attach books and supporting sources to this writing project" onClick={()=>void attachWritingSources()}>
              + Attach sources
            </button>}
            {project && <button aria-pressed={chatOpen}
              title="Open the project writing chat alongside the manuscript"
              onClick={()=>{setChatOpen(!chatOpen);if(!chatOpen)setResearch(false)}}>
              {chatOpen?"Hide AI chat":"Open AI chat"}
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
            ) : view === "Script Studio" ? (
              <ScriptStudio
                key={project.id}
                project={project}
                channelName={channels.find(c=>c.id===project.channel_id)?.name}
                onFlush={registerFlush}
                onError={report}
                onOpenSource={setSource}
              />
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
            ) : view === "Channels" ? (
              <ChannelsView
                channels={channels}
                projects={projects}
                currentProject={project}
                onSaved={reloadChannels}
                onError={report}
                onOpenScript={p=>void action(()=>activate(p))}
                onNewScript={channelId=>{setNewScriptChannel(channelId);setNewProject(true)}}
              />
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
          {project && chatOpen && !focus && <ChatPanel key={project.id}
            project={project}
            activeChapter={view==="Write"?doc:null}
            onError={report}
            onCreateChapter={createChatChapter}
            onReplaceChapter={replaceChatChapter}
            onGem={text=>{
              setCaptureGem({text,kind:"Reasoning",origin:"AI Assistant",status:"Candidate",
                chapter_id:doc?.id??null,source_label:"NOEMA project chat"});
              changeView("Gems");
            }}
            onAttach={async()=>attachWritingSources(false)}
            onGoDraft={()=>changeView("Conversation Draft")}
          />}
          {project && research && !chatOpen && !focus && (
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
        <ProjectForm
          channels={channels}
          initialChannelId={newScriptChannel}
          initialType={newProjectType}
          onCreateChannel={async name=>{
            const saved=await request<{id:string}>("save_channel",{name,confirmed:false});
            await reloadChannels();
            return saved.id;
          }}
          canCancel={!!project}
          onCancel={() => setNewProject(false)}
          onCreate={async (fields) => {
            const added = await request<{ id: string }>(
              "create_project",
              fields,
            );
            const ps = await request<Project[]>("projects");
            setProjects(ps);
            await activate(ps.find((p) => p.id === added.id)!);
            setNewProject(false);
            setNewScriptChannel(null);
          }}
        />
      )}
    </div>
  );
}
function ProjectForm({
  canCancel, onCancel, onCreate, channels, initialChannelId, initialType, onCreateChannel,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onCreate: (fields: Record<string, string>) => Promise<void>;
  channels: ChannelProfile[];
  initialChannelId: string | null;
  initialType: Project["project_type"] | null;
  onCreateChannel: (name:string)=>Promise<string>;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [projectType, setProjectType] = useState<"Book" | "Video Script" | null>(initialChannelId ? "Video Script" : initialType);
  const [channelId,setChannelId] = useState(initialChannelId??"");
  const [newChannelName,setNewChannelName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop onboarding">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New writing project"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!projectType) return;
          setBusy(true);
          try {
            await onCreate({
              title: title.trim(),
              author: author.trim(),
              project_type: projectType,
              channel_id: projectType==="Video Script" ? channelId : "",
              description,
            });
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">NOEMA</div>
        <div className="eyebrow">WHERE THOUGHT BECOMES LEGACY</div>
        {!projectType ? <>
          <h1>What would you like to create?</h1>
          <p>Choose the workspace for this project.</p>
          <div className="project-type-cards">
            <button type="button" onClick={() => setProjectType("Book")}>
              <strong>Book project</strong><span>Chapters, manuscript, book research, memory, and preview.</span>
            </button>
            <button type="button" onClick={() => setProjectType("Video Script")}>
              <strong>YouTube channel script</strong><span>Channel identity, scenes, narration, visuals, citations, and production notes.</span>
            </button>
          </div>
          {canCancel && <button type="button" onClick={onCancel}>Cancel</button>}
        </> : <>
        <button type="button" className="text-button" disabled={busy} onClick={() => setProjectType(null)}>← Change project type</button>
        <h1>{projectType === "Book" ? "Create a book project" : "Create a channel script"}</h1>
        <p>{projectType === "Book" ? "A dedicated home for your manuscript and book research." : "Write and plan a video for one of your YouTube channels."}</p>
        {projectType === "Video Script" && <div className="channel-create-inline">
          <label>Channel
            <select aria-label="Video script channel" required value={channelId}
              onChange={e=>setChannelId(e.target.value)}>
              <option value="">Choose a channel profile</option>
              {channels.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="channel-quick-add">
            <input aria-label="New channel name" placeholder="Or create a new channel" value={newChannelName}
              onChange={e=>setNewChannelName(e.target.value)} />
            <button type="button" disabled={busy||!newChannelName.trim()} onClick={async()=>{
              setBusy(true);
              try{const id=await onCreateChannel(newChannelName.trim());setChannelId(id);setNewChannelName("");}
              catch(e){setError(errorText(e))}finally{setBusy(false)}
            }}>+ Create channel</button>
          </div>
          <small>You can refine the channel's profile in Channel profiles after creating the script.</small>
        </div>}
        <label>
          {projectType === "Book" ? "Book title" : "Video script title"}
          <input
            autoFocus
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={projectType === "Book" ? "The book only you can write" : "The story only you can tell"}
          />
        </label>
        <label>
          Author
          <input
            required
            maxLength={500}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
          />
        </label>
        <label>
          Description <span className="muted">(optional)</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={projectType === "Book" ? "What is this book here to explore?" : "What will this video explore?"}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="row">
          {canCancel ? (
            <button type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <small>Stored on this computer. No account needed.</small>
          )}
          <button
            className="primary"
            disabled={busy || !title.trim() || !author.trim() || (projectType==="Video Script" && !channelId)}
          >
            {busy ? "Creating…" : "Create writing project →"}
          </button>
        </div>
        </>}
      </form>
    </div>
  );
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
