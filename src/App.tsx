import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import DOMPurify from "dompurify";
import { request, errorText } from "./api";
import type { Project, Chapter, Document, Source } from "./types";
import Manuscript from "./Editor";
import Research, { Search, SourceReader } from "./Research";
import MemoryView from "./Memory";
import GemsView from "./Gems";
import type { GemDraft } from "./types";
type View =
  "Write" | "Research" | "Conversations" | "Memory" | "Gems" | "Preview" | "Settings";
const views: View[] = [
  "Write",
  "Research",
  "Conversations",
  "Memory",
  "Gems",
  "Preview",
  "Settings",
];
const symbols = ["✎", "▤", "☷", "◇", "❖", "▥", "⚙"];
export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [doc, setDoc] = useState<Document | null>(null);
  const [view, setView] = useState<View>("Write");
  const [boot, setBoot] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [nav, setNav] = useState(false);
  const [research, setResearch] = useState(true);
  const [focus, setFocus] = useState(false);
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
    setView("Write");
    setSource(null);
    localStorage.setItem("noema-last-project", p.id);
  }, []);
  useEffect(() => {
    let live = true;
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
  async function reloadChapters() {
    if (project)
      setChapters(await request("chapters", { project_id: project.id }));
  }
  async function addChapter() {
    if (!project) return;
    const title = prompt("Chapter title");
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
            NOEMA<span>WRITING STUDIO</span>
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
              {!project && <option value="">Choose your book</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <button
              className="new-project"
              onClick={() => void action(async () => setNewProject(true))}
            >
              + New book project
            </button>
          </div>
          <nav aria-label="Workspace">
            {views.map((v, i) => (
              <button
                key={v}
                className={view === v ? "selected" : ""}
                onClick={() => changeView(v)}
                disabled={!project || busy}
              >
                <span aria-hidden="true">{symbols[i]}</span>
                {v === "Write"
                  ? "Manuscript"
                  : v === "Memory"
                    ? "Project memory"
                    : v === "Gems"
                      ? "Book gems"
                    : v === "Preview"
                      ? "Book preview"
                      : v}
              </button>
            ))}
          </nav>
          <div className="chapter-heading">
            <span className="eyebrow">CHAPTERS · {chapters.length}</span>
            <button
              aria-label="Add chapter"
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
                      const title = prompt("Chapter title", c.title);
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
                          `Delete “${c.title}” from your manuscript? Its content will remain in the database for recovery.`,
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
          <div className="nav-footer">
            <span className="local-dot" />
            Local & private<span>Version 0.1</span>
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
            <span> / {view}</span>
          </div>
          <div className="top-actions">
            {project && <button title="Save a passage to Book Gems" onClick={() => {
              const selected = window.getSelection()?.toString().trim() ?? "";
              setCaptureGem({
                text: selected,
                chapter_id: doc?.id ?? null,
                kind: "Quote",
                origin: view === "Write" ? "Author" : "Unspecified",
                source_label: view === "Write" && doc ? `Manuscript: ${doc.title}` : "",
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
                  Create your first book
                </button>
              </div>
            ) : view === "Write" ? (
              doc ? (
                <Manuscript
                  disabled={busy}
                  key={doc.id}
                  doc={doc}
                  onFlush={registerFlush}
                  onError={report}
                />
              ) : (
                <div className="empty-state">
                  <span className="large-symbol">✎</span>
                  <h1>Every book begins with a thought.</h1>
                  <p>Create a chapter and give it room to grow.</p>
                  <button className="primary" onClick={addChapter}>
                    Create a chapter
                  </button>
                </div>
              )
            ) : view === "Research" || view === "Conversations" ? (
              <Research
                key={`${project.id}-${view}`}
                project={project.id}
                conversations={view === "Conversations"}
                onOpen={setSource}
                onError={report}
              />
            ) : view === "Memory" ? (
              <MemoryView
                key={project.id}
                project={project.id}
                onError={report}
              />
            ) : view === "Gems" ? (
              <GemsView
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
                theme={theme}
                setTheme={setTheme}
                onError={report}
                onUpdated={async () => {
                  const ps = await request<Project[]>("projects");
                  setProjects(ps);
                  setProject(ps.find((p) => p.id === project.id)!);
                }}
              />
            )}
          </section>
          {project && research && !focus && (
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
          }}
        />
      )}
    </div>
  );
}
function ProjectForm({
  canCancel,
  onCancel,
  onCreate,
}: {
  canCancel: boolean;
  onCancel: () => void;
  onCreate: (fields: Record<string, string>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="modal-backdrop onboarding">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New book project"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onCreate({
              title: title.trim(),
              author: author.trim(),
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
        <h1>Make room for your book.</h1>
        <p>
          A private home for your manuscript, your sources, and the ideas that
          connect them.
        </p>
        <label>
          Book title
          <input
            autoFocus
            required
            maxLength={500}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The book only you can write"
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
            placeholder="What is this book here to explore?"
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
            disabled={busy || !title.trim() || !author.trim()}
          >
            {busy ? "Creating…" : "Create book project →"}
          </button>
        </div>
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
        <span className="eyebrow">READ-ONLY BOOK PREVIEW</span>
        <span>
          Chapters {chapters.length ? page * 5 + 1 : 0}–
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
              <div className="eyebrow">CHAPTER {page * 5 + i + 1}</div>
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
          Previous chapters
        </button>
        <button
          disabled={(page + 1) * 5 >= chapters.length}
          onClick={() => setPage(page + 1)}
        >
          Next chapters
        </button>
      </div>
    </div>
  );
}
function Settings({
  project,
  theme,
  setTheme,
  onError,
  onUpdated,
}: {
  project: Project;
  theme: string;
  setTheme: (s: string) => void;
  onError: (s: string) => void;
  onUpdated: () => Promise<void>;
}) {
  const [title, setTitle] = useState(project.title);
  const [author, setAuthor] = useState(project.author);
  const [description, setDescription] = useState(project.description);
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
              settings: JSON.parse(project.settings),
            });
            await onUpdated();
            setNote("Book details saved.");
          } catch (err) {
            onError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Book details</h2>
        <label>
          Book title
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
          Save book details
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
      <section>
        <h2>NOEMA 0.1</h2>
        <p>Where Thought Becomes Legacy.</p>
        <p>
          AI connections, Android packaging, EPUB, and PDF export are planned
          for later versions.
        </p>
      </section>
      {note && (
        <p role="status" className="notice">
          {note}
        </p>
      )}
    </div>
  );
}
