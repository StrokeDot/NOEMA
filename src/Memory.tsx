import { useEffect, useState } from "react";
import { categories, type Memory, type Source } from "./types";
import { request, errorText } from "./api";
const blank = {
  category: "Research Notes" as Memory["category"],
  title: "",
  body: "",
  source_id: null as string | null,
};
export default function MemoryView({
  project,
  onError,
}: {
  project: string;
  onError: (s: string) => void;
}) {
  const [items, setItems] = useState<Memory[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All entries");
  const [edit, setEdit] = useState<Partial<Memory> | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () =>
        request<Memory[]>("memories", {
          project_id: project,
          query,
          offset: page * 100,
          category: category === "All entries" ? "" : category,
        })
          .then((v) => {
            if (live) setItems(v);
          })
          .catch((e) => onError(errorText(e))),
      180,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, query, category, refresh, page, onError]);
  useEffect(() => {
    let live = true;
    async function load() {
      const all: Source[] = [];
      let offset = 0;
      while (true) {
        const next = await request<Source[]>("sources", {
          project_id: project,
          offset,
        });
        all.push(...next);
        if (next.length < 50) break;
        offset += 50;
      }
      if (live) setSources(all);
    }
    void load().catch((e) => onError(errorText(e)));
    return () => {
      live = false;
    };
  }, [project, onError]);
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">THE THREAD OF YOUR THINKING</div>
          <h1>Project memory</h1>
          <p>What you believe. What you question. How you want to write.</p>
        </div>
        <button className="primary" onClick={() => setEdit({ ...blank })}>
          + New memory
        </button>
      </div>
      <div className="memory-tools">
        <input
          aria-label="Search memory"
          value={query}
          placeholder="Search your memory…"
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Memory category filter"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <option>All entries</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="memory-grid">
        {items
          .filter((m) => category === "All entries" || m.category === category)
          .map((m) => (
            <article className="memory-card" key={m.id}>
              <span className="badge">{m.category}</span>
              <h2>{m.title}</h2>
              <p>{m.body}</p>
              {m.source_name && <small>Source: {m.source_name}</small>}
              <div className="row">
                <button onClick={() => setEdit(m)}>Edit</button>
                <button
                  className="danger"
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete “${m.title}”? This memory cannot be recovered.`,
                      )
                    )
                      return;
                    try {
                      await request("delete_memory", {
                        id: m.id,
                        project_id: project,
                      });
                      setRefresh((x) => x + 1);
                    } catch (e) {
                      onError(errorText(e));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state">
          <span className="large-symbol">◇</span>
          <h2>A place for your understanding to grow.</h2>
          <p>Only you decide which ideas become established positions.</p>
        </div>
      )}
      <div className="row">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button disabled={items.length < 100} onClick={() => setPage(page + 1)}>
          More memories
        </button>
      </div>
      {edit && (
        <div className="modal-backdrop">
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit memory"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await request("save_memory", { ...edit, project_id: project });
                setRefresh((x) => x + 1);
                setEdit(null);
              } catch (err) {
                onError(errorText(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="eyebrow">PROJECT MEMORY</div>
            <h2>{edit.id ? "Refine a thought" : "Keep a thought"}</h2>
            <label>
              Category
              <select
                aria-label="Category"
                value={edit.category}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    category: e.target.value as Memory["category"],
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                required
                autoFocus
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
            </label>
            <label>
              Your note
              <textarea
                required
                rows={7}
                value={edit.body}
                onChange={(e) => setEdit({ ...edit, body: e.target.value })}
              />
            </label>
            <label>
              Original source (optional)
              <select
                aria-label="Original source (optional)"
                value={edit.source_id ?? ""}
                onChange={(e) =>
                  setEdit({ ...edit, source_id: e.target.value || null })
                }
              >
                <option value="">No linked source</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="row">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  if (
                    (edit.title || edit.body) &&
                    !confirm("Discard unsaved memory edits?")
                  )
                    return;
                  setEdit(null);
                }}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? "Saving…" : "Save memory"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
