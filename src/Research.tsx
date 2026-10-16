import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { request, errorText } from "./api";
import type { Hit, Source, Passage } from "./types";
export function Search({
  scope = "YOUR PROJECT KNOWLEDGE",
  project,
  onOpen,
}: {
  scope?: string;
  project: string;
  onOpen: (source: Source) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      request<Hit[]>("search", {
        project_id: project,
        query,
        offset: page * 40,
      })
        .then((v) => {
          if (live) {
            setHits(v);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(errorText(e));
        })
        .finally(() => {
          if (live) setBusy(false);
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, project, page]);
  return (
    <>
      <div className="eyebrow">{scope}</div>
      <h2>Find a thought.</h2>
      <p className="muted">
        Search original passages from your research and conversations.
      </p>
      <label className="searchbox">
        <span>⌕</span>
        <input
          aria-label="Search research"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search your archive…"
        />
      </label>
      <p className="micro">All words · exact terms · local search</p>
      {error && <p role="alert">{error}</p>}
      {busy ? (
        <p role="status">Searching…</p>
      ) : query.trim() ? (
        <>
          <div className="result-count">
            {hits.length} passages on this page
          </div>
          {hits.map((hit) => (
            <button
              className="search-result"
              key={hit.id}
              onClick={() =>
                onOpen({
                  id: hit.source_id,
                  name: hit.name,
                  kind: hit.kind,
                  tags: "",
                  created_at: 0,
                  warning: "",
                  passage_id: hit.id,
                })
              }
            >
              <span className="source-type">{hit.kind.toUpperCase()}</span>
              <strong>{hit.name}</strong>
              <span>{hit.excerpt}</span>
              <small>{hit.location}</small>
            </button>
          ))}
          <div className="row">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button
              disabled={hits.length < 40}
              onClick={() => setPage(page + 1)}
            >
              More passages
            </button>
          </div>
        </>
      ) : (
        <div className="quiet-card">
          <span className="large-symbol">❧</span>
          <h3>Knowledge that stays.</h3>
          <p>
            Import a source, then find the passage you need without rereading an
            entire conversation.
          </p>
        </div>
      )}
      <div className="ai-note">
        <span className="badge">COMING LATER</span>
        <h3>A companion for your ideas.</h3>
        <p>
          AI is not connected in version 0.1. Your archive and writing work
          entirely on this computer.
        </p>
      </div>
    </>
  );
}
export function SourceReader({
  source,
  project,
  onClose,
}: {
  source: Source;
  project: string;
  onClose: () => void;
}) {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (source.passage_id)
      void request<{ offset: number }>("source_offset", {
        project_id: project,
        id: source.id,
        passage_id: source.passage_id,
      })
        .then((v) => setPage(Math.floor(v.offset / 30)))
        .catch((e) => setError(errorText(e)));
  }, [project, source.id, source.passage_id]);
  useEffect(() => {
    let live = true;
    setBusy(true);
    request<Passage[]>("source_passages", {
      project_id: project,
      id: source.id,
      offset: page * 30,
    })
      .then((v) => {
        if (live) setPassages(v);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [project, source.id, page]);
  return (
    <div className="modal-backdrop">
      <section
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-label="Source reader"
      >
        <div className="row">
          <div>
            <div className="eyebrow">ORIGINAL SOURCE EXCERPTS</div>
            <h2>{source.name}</h2>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        {source.warning && <p className="notice">{source.warning}</p>}
        {error && <p role="alert">{error}</p>}
        {busy ? (
          <p>Loading passages…</p>
        ) : (
          <div className="source-content">
            {passages.map((p) => (
              <section key={p.id}>
                <small>{p.location}</small>
                <p>{p.text}</p>
              </section>
            ))}
          </div>
        )}
        <div className="row">
          <button
            disabled={page === 0 || busy}
            onClick={() => setPage(page - 1)}
          >
            Previous page
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={passages.length < 30 || busy}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        </div>
      </section>
    </div>
  );
}
export default function Research({
  script = false,
  project,
  conversations,
  onOpen,
  onError,
}: {
  script?: boolean;
  project: string;
  conversations: boolean;
  onOpen: (s: Source) => void;
  onError: (s: string) => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState("date");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    request<Source[]>("sources", {
      project_id: project,
      offset: page * 50,
      kind: conversations ? "json" : "",
      sort,
      filter,
    })
      .then((v) => {
        if (live) setSources(v);
      })
      .catch((e) => onError(errorText(e)))
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [project, page, refresh, onError, conversations, sort, filter]);
  async function importFiles() {
    try {
      const selected =
        import.meta.env.DEV && import.meta.env.VITE_NOEMA_TEST_BRIDGE === "1"
          ? (window as unknown as { __NOEMA_TEST_FILES__: string[] })
              .__NOEMA_TEST_FILES__
          : await open({
              multiple: true,
              filters: [
                {
                  name: "Research & conversations",
                  extensions: ["txt", "md", "markdown", "json", "pdf"],
                },
              ],
            });
      if (!selected) return;
      setBusy(true);
      const paths = Array.isArray(selected) ? selected : [selected];
      let count = 0;
      const failures: string[] = [];
      for (const path of paths) {
        setNote(`Importing ${++count} of ${paths.length}…`);
        try {
          await request("import", { project_id: project, path });
        } catch (e) {
          failures.push(`${path.split(/[\\/]/).pop()}: ${errorText(e)}`);
        }
      }
      setNote(
        `${paths.length - failures.length} file(s) imported.${failures.length ? " Some files could not be imported." : ""}`,
      );
      if (failures.length) onError(failures.join("\n"));
      setPage(0);
      setRefresh((x) => x + 1);
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">A LIBRARY OF YOUR OWN</div>
          <h1>{conversations ? (script ? "Script conversations" : "Conversations") : (script ? "Script research" : "Research library")}</h1>
          <p>Keep the source. Find the idea. Build on what you know.</p>
        </div>
        <button className="primary" disabled={busy} onClick={importFiles}>
          {busy ? "Importing…" : "+ Import files"}
        </button>
      </div>
      <p className="notice">
        TXT · Markdown · JSON conversations · text-based PDF. Originals stay
        untouched. Up to 256 MiB per file.
      </p>
      <div className="memory-tools">
        <input
          aria-label="Filter sources by name or tag"
          placeholder="Filter by name or tag…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Sort sources"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          <option value="date">Newest first</option>
          <option value="name">By name</option>
          <option value="type">By file type</option>
        </select>
      </div>
      {note && <p role="status">{note}</p>}
      {loading ? (
        <p>Loading sources…</p>
      ) : sources.length === 0 ? (
        <div className="empty-state">
          <span className="large-symbol">▤</span>
          <h2>Your next idea starts with a source.</h2>
          <p>Import your research or a ChatGPT conversations.json export.</p>
        </div>
      ) : (
        <div className="source-list">
          {sources
            .filter((s) => !conversations || s.kind === "json")
            .map((s) => (
              <article className="source-card" key={s.id}>
                <span className="file-icon">{s.kind.toUpperCase()}</span>
                <div>
                  <button
                    className="text-button source-title"
                    onClick={() => onOpen(s)}
                  >
                    {s.name}
                  </button>
                  <p>
                    {new Date(s.created_at).toLocaleDateString()}{" "}
                    {s.tags && ` · ${s.tags}`}
                  </p>
                  {s.warning && <small>{s.warning}</small>}
                </div>
                <button
                  onClick={async () => {
                    const tags = prompt("Tags (separate with commas)", s.tags);
                    if (tags === null) return;
                    try {
                      await request("source_tags", {
                        project_id: project,
                        id: s.id,
                        tags,
                      });
                      setRefresh((x) => x + 1);
                    } catch (e) {
                      onError(errorText(e));
                    }
                  }}
                >
                  Tags
                </button>
              </article>
            ))}
        </div>
      )}
      <div className="row">
        <button disabled={!page || loading} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Archive page {page + 1}</span>
        <button
          disabled={sources.length < 50 || loading}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
