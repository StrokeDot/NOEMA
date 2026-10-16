import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Autosave } from "./autosave";
import { request, errorText } from "./api";
import type { Document, Revision } from "./types";
export default function Manuscript({
  script = false,
  doc,
  onFlush,
  onError,
  disabled,
}: {
  script?: boolean;
  disabled: boolean;
  doc: Document;
  onFlush: (fn: () => Promise<void>) => void;
  onError: (s: string) => void;
}) {
  const [status, setStatus] = useState("saved");
  const [words, setWords] = useState(
    doc.text.trim() ? doc.text.trim().split(/\s+/u).length : 0,
  );
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [selected, setSelected] = useState<Revision | null>(null);
  const save = useRef<Autosave | null>(null);
  if (!save.current)
    save.current = new Autosave(
      doc.version,
      (draft, version) =>
        request("save_chapter", {
          ...draft,
          id: doc.id,
          project_id: doc.project_id,
          version,
        }),
      setStatus,
    );
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Placeholder.configure({ placeholder: "A thought worth keeping…" }),
    ],
    content: doc.html,
    editorProps: {
      attributes: { "aria-label": script ? "Freeform script draft" : "Chapter manuscript", spellcheck: "true" },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      setWords(text.trim() ? text.trim().split(/\s+/u).length : 0);
      save.current!.enqueue({ html: editor.getHTML(), text });
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    const flush = () => save.current!.flush();
    onFlush(flush);
    return () => {
      void flush().catch((e) => onError(errorText(e)));
    };
  }, [onFlush, onError]);
  useEffect(() => {
    const blur = () => {
      void save.current!.flush().catch((e) => onError(errorText(e)));
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, [onError]);
  async function history() {
    try {
      await save.current!.flush();
      setRevisions(
        await request("revisions", { id: doc.id, project_id: doc.project_id }),
      );
    } catch (e) {
      onError(errorText(e));
    }
  }
  if (!editor) return <p>Opening draft…</p>;
  const buttons: [string, () => void, boolean][] = [
    [
      "Bold",
      () => {
        editor.chain().focus().toggleBold().run();
      },
      editor.isActive("bold"),
    ],
    [
      "Italic",
      () => {
        editor.chain().focus().toggleItalic().run();
      },
      editor.isActive("italic"),
    ],
    [
      "Underline",
      () => {
        editor.chain().focus().toggleUnderline().run();
      },
      editor.isActive("underline"),
    ],
    [
      "Heading",
      () => {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
      editor.isActive("heading"),
    ],
    [
      "Bullets",
      () => {
        editor.chain().focus().toggleBulletList().run();
      },
      editor.isActive("bulletList"),
    ],
    [
      "Numbered",
      () => {
        editor.chain().focus().toggleOrderedList().run();
      },
      editor.isActive("orderedList"),
    ],
    [
      "Quote",
      () => {
        editor.chain().focus().toggleBlockquote().run();
      },
      editor.isActive("blockquote"),
    ],
  ];
  return (
    <div className="manuscript">
      <div className="formatbar">
        {buttons.map(([label, fn, active]) => (
          <button key={label} title={label} aria-pressed={active} onClick={fn}>
            {label}
          </button>
        ))}
        <span className="separator" />
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          Undo
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          Redo
        </button>
        <button onClick={history}>History</button>
      </div>
      <div className="paper-scroll">
        <article className="paper">
          <div className="eyebrow">{script ? "FREEFORM SCRIPT DRAFT" : "THE MANUSCRIPT"}</div>
          <h1>{doc.title}</h1>
          <EditorContent editor={editor} />
        </article>
      </div>
      <footer>
        <span>{words.toLocaleString()} words</span>
        <span role="status">
          {status === "saved"
            ? "● Saved on this computer"
            : status === "error"
              ? "Save failed — your text is still in the editor"
              : status === "saving"
                ? "Saving…"
                : "Unsaved changes…"}
        </span>
        {status === "error" && (
          <button
            onClick={() =>
              save.current!.flush().catch((e) => onError(errorText(e)))
            }
          >
            Retry save
          </button>
        )}
      </footer>
      {revisions && (
        <div className="modal-backdrop">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-label="Revision history"
          >
            <div className="row">
              <h2>Writing history</h2>
              <button
                onClick={() => {
                  setRevisions(null);
                  setSelected(null);
                }}
              >
                Close
              </button>
            </div>
            <p>
              Earlier drafts are captured at most once a minute. Restoring
              preserves your current draft first.
            </p>
            <div className="history-list">
              {revisions.length === 0 ? (
                <p>No earlier drafts yet.</p>
              ) : (
                revisions.map((r) => (
                  <button
                    key={r.id}
                    onClick={() =>
                      request<Revision>("revision", {
                        id: r.id,
                        project_id: doc.project_id,
                      })
                        .then(setSelected)
                        .catch((e) => onError(errorText(e)))
                    }
                  >
                    {new Date(r.created_at).toLocaleString()} · {r.characters}{" "}
                    characters
                  </button>
                ))
              )}
            </div>
            {selected && (
              <>
                <div
                  className="revision-preview"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selected.html ?? ""),
                  }}
                />
                <button
                  className="primary"
                  onClick={async () => {
                    if (
                      !confirm(
                        "Restore this earlier draft? Your current draft will be saved in history.",
                      )
                    )
                      return;
                    try {
                      await save.current!.flush();
                      const html = selected.html ?? "<p></p>";
                      editor.commands.setContent(html, { emitUpdate: false });
                      const text = editor.getText();
                      save.current!.enqueue({ html, text, snapshot: true });
                      await save.current!.flush();
                      setWords(
                        text.trim() ? text.trim().split(/\s+/u).length : 0,
                      );
                      setSelected(null);
                      setRevisions(null);
                    } catch (e) {
                      onError(errorText(e));
                    }
                  }}
                >
                  Restore this draft
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
