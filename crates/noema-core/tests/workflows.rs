use noema_core::{
    import::{parse_conversations, prepare},
    Store,
};
use serde_json::{json, Value};
use std::{fs, path::Path};
fn call(s: &mut Store, op: &str, args: Value) -> Value {
    s.request(op, args).unwrap()
}
fn project(s: &mut Store, name: &str) -> String {
    call(
        s,
        "create_project",
        json!({"title":name,"author":"Alejandro"}),
    )["id"]
        .as_str()
        .unwrap()
        .into()
}
fn chapter(s: &mut Store, p: &str) -> String {
    call(
        s,
        "create_chapter",
        json!({"project_id":p,"title":"The beginning"}),
    )["id"]
        .as_str()
        .unwrap()
        .into()
}
fn import(s: &mut Store, p: &str, path: &Path) -> Value {
    let prepared = prepare(&s.root, path).unwrap();
    s.commit_import(p, prepared).unwrap()
}
#[test]
fn persists_after_reopen_and_checks_conflicts() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = Store::open(dir.path()).unwrap();
    let p = project(&mut s, "A book");
    let c = chapter(&mut s, &p);
    call(
        &mut s,
        "save_chapter",
        json!({"id":c,"project_id":p,"version":0,"html":"<p><strong>Truth</strong> survives.</p>","text":"Truth survives."}),
    );
    drop(s);
    let mut s = Store::open(dir.path()).unwrap();
    let doc = call(&mut s, "chapter", json!({"id":c,"project_id":p}));
    assert_eq!(doc["text"], "Truth survives.");
    assert_eq!(doc["version"], 1);
    assert!(s
        .request(
            "save_chapter",
            json!({"id":c,"project_id":p,"version":0,"html":"lost"})
        )
        .is_err());
    assert_eq!(
        call(&mut s, "chapter", json!({"id":c,"project_id":p}))["text"],
        "Truth survives."
    );
}
#[test]
fn snapshots_preserve_previous_draft() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path()).unwrap();
    let p = project(&mut s, "Book");
    let c = chapter(&mut s, &p);
    for (v, text) in ["first", "second"].iter().enumerate() {
        call(
            &mut s,
            "save_chapter",
            json!({"id":c,"project_id":p,"version":v,"html":format!("<p>{text}</p>"),"text":text,"snapshot":true}),
        );
    }
    let rows = call(&mut s, "revisions", json!({"id":c,"project_id":p}));
    assert_eq!(rows.as_array().unwrap().len(), 2);
    let found = s
        .conn
        .query_row(
            "SELECT count(*) FROM revisions WHERE text='first'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .unwrap();
    assert_eq!(found, 1);
}
#[test]
fn import_search_originals_and_project_isolation() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path().join("data")).unwrap();
    let p = project(&mut s, "First");
    let q = project(&mut s, "Second");
    let path = d.path().join("source.md");
    let original = "# Research\nMoral perfection is maturation of freedom. Español: redención.";
    fs::write(&path, original).unwrap();
    let r = import(&mut s, &p, &path);
    let hits = call(&mut s, "search", json!({"project_id":p,"query":"freedom"}));
    assert_eq!(hits.as_array().unwrap().len(), 1);
    assert!(hits[0]["location"].as_str().unwrap().contains("characters"));
    assert_eq!(
        call(&mut s, "search", json!({"project_id":q,"query":"freedom"})),
        json!([])
    );
    let rel: String = s
        .conn
        .query_row(
            "SELECT original_path FROM sources WHERE id=?",
            [r["id"].as_str().unwrap()],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(fs::read_to_string(s.root.join(rel)).unwrap(), original);
    assert_eq!(fs::read_to_string(path).unwrap(), original);
    assert!(call(
        &mut s,
        "search",
        json!({"project_id":p,"query":"\" OR * ; --"})
    )
    .is_array());
}
#[test]
fn memory_crud_and_source_scope() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path()).unwrap();
    let p = project(&mut s, "First");
    let q = project(&mut s, "Second");
    let id=call(&mut s,"save_memory",json!({"project_id":p,"title":"Freedom","body":"Maturation","category":"Established Positions"}))["id"].clone();
    assert_eq!(
        call(
            &mut s,
            "memories",
            json!({"project_id":p,"query":"maturation"})
        )
        .as_array()
        .unwrap()
        .len(),
        1
    );
    assert_eq!(
        call(
            &mut s,
            "memories",
            json!({"project_id":q,"query":"maturation"})
        ),
        json!([])
    );
    call(
        &mut s,
        "save_memory",
        json!({"project_id":p,"id":id,"title":"Freedom","body":"New text","category":"Open Questions"}),
    );
    assert_eq!(
        call(&mut s, "memories", json!({"project_id":p}))[0]["body"],
        "New text"
    );
    assert!(s
        .request(
            "save_memory",
            json!({"project_id":p,"title":"x","category":"Bad category"})
        )
        .is_err());
    call(&mut s, "delete_memory", json!({"project_id":p,"id":id}));
    assert_eq!(call(&mut s, "memories", json!({"project_id":p})), json!([]));
}
#[test]
fn chatgpt_branches_roles_times_preserved() {
    let value = json!([{"id":"conversation-1","title":"Original","mapping":{"root":{"parent":null,"message":null},"u":{"parent":"root","message":{"author":{"role":"user"},"content":{"parts":["Question"]},"create_time":123}},"a":{"parent":"u","message":{"author":{"role":"assistant"},"content":{"parts":["First answer"]},"create_time":124}},"b":{"parent":"u","message":{"author":{"role":"assistant"},"content":{"parts":["Alternative"]},"create_time":125}}}}]);
    let msgs = parse_conversations(value).unwrap();
    assert_eq!(msgs.len(), 3);
    assert_eq!(msgs[0].speaker, "user");
    assert_eq!(msgs[0].timestamp.as_deref(), Some("123"));
    assert_eq!(msgs[1].parent.as_deref(), Some("u"));
    assert_eq!(msgs[2].parent.as_deref(), Some("u"));
    assert_eq!(msgs[2].text, "Alternative");
}
#[test]
fn recognized_generic_json_and_invalid_formats() {
    assert_eq!(
        parse_conversations(json!([{"role":"user","content":"A thought"}])).unwrap()[0].text,
        "A thought"
    );
    assert!(parse_conversations(json!({"unexpected":42})).is_err());
    assert!(
        parse_conversations(json!({"mapping":{"a":{"parent":"b"},"b":{"parent":"a"}}})).is_err()
    );
}
#[test]
fn failures_do_not_claim_import_or_leave_files() {
    let d = tempfile::tempdir().unwrap();
    let s = Store::open(d.path().join("data")).unwrap();
    let path = d.path().join("bad.json");
    fs::write(&path, "{ invalid").unwrap();
    assert!(prepare(&s.root, &path).is_err());
    assert_eq!(fs::read_dir(s.root.join("originals")).unwrap().count(), 0);
    assert!(path.exists());
    let empty = d.path().join("empty.txt");
    fs::write(&empty, "").unwrap();
    assert!(prepare(&s.root, &empty).is_err());
}
#[test]
fn pdf_pages_and_scanned_pdf_rejection() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path()).unwrap();
    let p = project(&mut s, "Book");
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/research.pdf");
    import(&mut s, &p, &fixture);
    let hits = call(
        &mut s,
        "search",
        json!({"project_id":p,"query":"responsibility"}),
    );
    assert!(hits[0]["location"].as_str().unwrap().starts_with("Page 2"));
    let scan = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/scanned.pdf");
    assert!(prepare(&s.root, &scan).is_err());
}
#[test]
fn reorder_validate_and_soft_delete() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path()).unwrap();
    let p = project(&mut s, "Book");
    let c = chapter(&mut s, &p);
    let b = chapter(&mut s, &p);
    call(
        &mut s,
        "reorder_chapters",
        json!({"project_id":p,"ids":[b,c]}),
    );
    assert_eq!(
        call(&mut s, "chapters", json!({"project_id":p}))[0]["id"],
        b
    );
    assert!(s
        .request("reorder_chapters", json!({"project_id":p,"ids":[b,b]}))
        .is_err());
    call(&mut s, "delete_chapter", json!({"project_id":p,"id":c}));
    assert_eq!(
        call(&mut s, "chapters", json!({"project_id":p}))
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        s.conn
            .query_row("SELECT count(*) FROM chapters WHERE id=?", [c], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn backup_reopens_and_migration_is_repeatable() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path().join("live")).unwrap();
    let p = project(&mut s, "Book");
    let c = chapter(&mut s, &p);
    call(
        &mut s,
        "save_chapter",
        json!({"id":c,"project_id":p,"version":0,"html":"<p>Last save</p>","text":"Last save"}),
    );
    let path = d.path().join("backup");
    call(&mut s, "backup", json!({"path":path}));
    let mut b = Store::open(&path).unwrap();
    assert_eq!(
        call(&mut b, "chapter", json!({"project_id":p,"id":c}))["text"],
        "Last save"
    );
    assert!(s.request("backup", json!({"path":path})).is_err());
    drop(b);
    let b = Store::open(path).unwrap();
    assert_eq!(
        b.conn
            .query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn long_archive_is_paginated_and_searchable() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path().join("data")).unwrap();
    let p = project(&mut s, "Book");
    let path = d.path().join("conversation.json");
    let messages:Vec<_>=(0..10_000).map(|i|json!({"role":"user","content":format!("Message {i} concerns longitudinal knowledge token{i}")})).collect();
    fs::write(&path, serde_json::to_vec(&messages).unwrap()).unwrap();
    let r = import(&mut s, &p, &path);
    assert_eq!(r["messages"], 10000);
    let passages = call(
        &mut s,
        "source_passages",
        json!({"project_id":p,"id":r["id"]}),
    );
    assert_eq!(passages.as_array().unwrap().len(), 30);
    let hits = call(
        &mut s,
        "search",
        json!({"project_id":p,"query":"token9999"}),
    );
    assert_eq!(hits.as_array().unwrap().len(), 1);
}
#[test]
fn chunk_boundaries_remain_searchable_and_unicode_safe() {
    let d = tempfile::tempdir().unwrap();
    let mut s = Store::open(d.path().join("data")).unwrap();
    let p = project(&mut s, "Book");
    let path = d.path().join("unicode.txt");
    fs::write(
        &path,
        format!("{} redemption 🕊 pensamiento", "á ".repeat(797)),
    )
    .unwrap();
    import(&mut s, &p, &path);
    assert!(!call(
        &mut s,
        "search",
        json!({"project_id":p,"query":"redemption"})
    )
    .as_array()
    .unwrap()
    .is_empty());
}
