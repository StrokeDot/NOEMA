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
        4
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

#[test]
fn book_gems_persist_preserve_original_and_isolate_books() {
    let d=tempfile::tempdir().unwrap();
    let mut store=Store::open(d.path()).unwrap();
    let a=project(&mut store,"Book A");
    let b=project(&mut store,"Book B");
    let chapter_a=chapter(&mut store,&a);
    let chapter_b=chapter(&mut store,&b);
    let quote="An argument improves when its meaning survives disagreement.";
    let id=call(&mut store,"save_gem",json!({"project_id":a,"chapter_id":chapter_a,"kind":"Quote","text":quote,"origin":"AI Assistant","source_label":"Conversation 12","status":"Candidate","notes":"Maybe intro"}))["id"].as_str().unwrap().to_owned();
    assert!(store.request("save_gem",json!({"project_id":a,"chapter_id":chapter_b,"kind":"Quote","text":"wrong","origin":"Author","status":"Candidate"})).is_err());
    assert_eq!(call(&mut store,"gems",json!({"project_id":b})),json!([]));
    assert_eq!(call(&mut store,"gems",json!({"project_id":a,"chapter_id":chapter_a})).as_array().unwrap().len(),1);
    call(&mut store,"save_gem",json!({"project_id":a,"id":id,"chapter_id":chapter_a,"kind":"Reasoning","text":"Rewritten version","origin":"AI Assistant","status":"Approved","notes":"Refine"}));
    assert!(store.request("save_gem",json!({"project_id":b,"id":id,"kind":"Quote","text":"hijack","origin":"Author","status":"Candidate"})).is_err());
    drop(store);
    let mut store=Store::open(d.path()).unwrap();
    let gem=call(&mut store,"gems",json!({"project_id":a}));
    assert_eq!(gem[0]["text"],"Rewritten version");
    assert_eq!(gem[0]["original_text"],quote);
    assert_eq!(gem[0]["origin"],"AI Assistant");
    assert_eq!(gem[0]["source_label"],"Conversation 12");
    assert_eq!(gem[0]["status"],"Approved");
    assert_eq!(store.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),4);
    call(&mut store,"delete_gem",json!({"project_id":a,"id":id}));
    assert_eq!(call(&mut store,"gems",json!({"project_id":a})),json!([]));
    assert_eq!(store.conn.query_row("SELECT count(*) FROM book_gems WHERE id=?",[id],|r|r.get::<_,i64>(0)).unwrap(),1);
}

#[test]
fn book_gem_migration_from_v1_preserves_existing_memories() {
    let d=tempfile::tempdir().unwrap();
    let mut s=Store::open(d.path()).unwrap();
    let p=project(&mut s,"An existing book");
    let mid=call(&mut s,"save_memory",json!({"project_id":p,"category":"Writing Instructions","title":"Style","body":"Keep original voice"}))["id"].as_str().unwrap().to_string();
    // Simulate a v0.1 database missing the gems table but retaining manuscripts/memory.
    s.conn.execute_batch("DROP INDEX projects_channel; ALTER TABLE projects DROP COLUMN script_status; ALTER TABLE projects DROP COLUMN channel_id; DROP TABLE channel_profiles; DROP TABLE project_frameworks; DROP TABLE belief_frameworks; ALTER TABLE projects DROP COLUMN project_type; DROP TABLE book_gems; PRAGMA user_version=1;").unwrap();
    drop(s);
    let mut s=Store::open(d.path()).unwrap();
    let memories=call(&mut s,"memories",json!({"project_id":p}));
    assert_eq!(memories[0]["id"],mid);
    assert_eq!(memories[0]["body"],"Keep original voice");
    assert_eq!(call(&mut s,"gems",json!({"project_id":p})),json!([]));
}

#[test]
fn scripts_and_reusable_frameworks_respect_project_activation() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(dir.path()).unwrap();
    let book = project(&mut store, "A book");
    let script = call(&mut store, "create_project",
        json!({"title":"A video essay","author":"Writer","project_type":"Video Script"}))["id"]
        .as_str().unwrap().to_string();
    let projects = call(&mut store, "projects", json!({}));
    assert_eq!(projects.as_array().unwrap().iter().find(|v|v["id"]==script).unwrap()["project_type"],"Video Script");
    assert_eq!(projects.as_array().unwrap().iter().find(|v|v["id"]==book).unwrap()["project_type"],"Book");
    assert!(store.request("create_project",
        json!({"title":"Invalid","author":"Writer","project_type":"Podcast"})).is_err());

    let draft = call(&mut store,"save_framework",json!({
        "title":"Free will","perspective":"Author","principles":"Humans have genuine choice.",
        "qualifications":"Do not equate freedom with lack of influence.",
        "source_label":"Author principles.md","status":"Draft"
    }))["id"].as_str().unwrap().to_string();
    assert!(store.request("set_framework_active",
        json!({"project_id":script,"framework_id":draft,"active":true})).is_err());

    call(&mut store,"save_framework",json!({
        "id":draft,"title":"Free will","perspective":"Author",
        "principles":"Genuine freedom matures with character.",
        "qualifications":"Freedom is not lack of influence.","status":"Confirmed"
    }));
    call(&mut store,"set_framework_active",
        json!({"project_id":script,"framework_id":draft,"active":true}));
    assert_eq!(call(&mut store,"framework_context",json!({"project_id":book})),json!([]));
    let active=call(&mut store,"framework_context",json!({"project_id":script}));
    assert_eq!(active[0]["perspective"],"Author");
    assert_eq!(active[0]["principles"],"Genuine freedom matures with character.");
    assert_eq!(call(&mut store,"frameworks",json!({"project_id":script}))[0]["original_text"],"Humans have genuine choice.");

    let external=call(&mut store,"save_framework",json!({
        "title":"Another thinker","perspective":"External","principles":"Different premises",
        "status":"Confirmed"}))["id"].as_str().unwrap().to_string();
    call(&mut store,"set_framework_active",json!({"project_id":script,"framework_id":external,"active":true}));
    assert_eq!(call(&mut store,"framework_context",json!({"project_id":script})).as_array().unwrap().len(),2);
    drop(store);
    let mut reopened=Store::open(dir.path()).unwrap();
    assert_eq!(call(&mut reopened,"framework_context",json!({"project_id":script})).as_array().unwrap().len(),2);
    call(&mut reopened,"archive_framework",json!({"id":draft}));
    assert_eq!(call(&mut reopened,"framework_context",json!({"project_id":script})).as_array().unwrap().len(),1);
    call(&mut reopened,"save_framework",json!({"id":external,"title":"Another thinker",
        "perspective":"External","principles":"Different premises","status":"Draft"}));
    assert_eq!(call(&mut reopened,"framework_context",json!({"project_id":script})),json!([]));
    assert_eq!(call(&mut reopened,"framework_context",json!({"project_id":book})),json!([]));
    assert_eq!(reopened.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),4);
}

#[test]
fn channel_profiles_group_scripts_and_references_respect_opt_in() {
    let dir=tempfile::tempdir().unwrap();
    let mut s=Store::open(dir.path()).unwrap();
    let channel_a=call(&mut s,"save_channel",json!({
        "name":"The Truth Project","description":"Evidence-based essays",
        "audience":"Thoughtful viewers","voice":"Reflective and clear",
        "editorial_rules":"Distinguish evidence from speculation",
        "confirmed":true,"original_text":"The Truth Project voice notes"
    }))["id"].as_str().unwrap().to_string();
    let channel_b=call(&mut s,"save_channel",json!({
        "name":"A Fair Critique","voice":"Fair counterarguments",
        "confirmed":true
    }))["id"].as_str().unwrap().to_string();
    let script_a=call(&mut s,"create_project",json!({
        "title":"Arthur Morgan","author":"Writer","project_type":"Video Script","channel_id":channel_a
    }))["id"].as_str().unwrap().to_string();
    let script_b=call(&mut s,"create_project",json!({
        "title":"A critique","author":"Writer","project_type":"Video Script","channel_id":channel_b
    }))["id"].as_str().unwrap().to_string();
    let book=project(&mut s,"A separate book");
    assert!(s.request("create_project",json!({
        "title":"Invalid","author":"Writer","project_type":"Book","channel_id":channel_a})).is_err());
    let section_a=chapter(&mut s,&script_a);
    let section_b=chapter(&mut s,&script_b);
    call(&mut s,"save_chapter",json!({"id":section_a,"project_id":script_a,"version":0,
        "html":"<p>redemption</p>","text":"redemption"}));
    call(&mut s,"save_chapter",json!({"id":section_b,"project_id":script_b,"version":0,
        "html":"<p>same redemption motif</p>","text":"same redemption motif"}));
    assert_eq!(call(&mut s,"channel_scripts",json!({"channel_id":channel_a})).as_array().unwrap().len(),1);
    assert_eq!(call(&mut s,"channel_context",json!({"project_id":script_a}))["primary_channel"]["name"],"The Truth Project");
    assert!(call(&mut s,"channel_context",json!({"project_id":book}))["primary_channel"].is_null());
    let params=json!({"project_id":script_a,"published_only":false,"query":"redemption"});
    assert_eq!(call(&mut s,"channel_script_references",params.clone()),json!([]));
    let cross=call(&mut s,"channel_script_references",json!({
        "project_id":script_a,"published_only":false,"include_other_channels":true,"query":"redemption"}));
    assert_eq!(cross.as_array().unwrap().len(),1);
    assert_eq!(cross[0]["channel_name"],"A Fair Critique");
    assert_eq!(call(&mut s,"channel_script_references",json!({
        "project_id":script_a,"include_other_channels":true,"query":"redemption"})),json!([]));
    call(&mut s,"update_project",json!({"project_id":script_b,"title":"A critique","author":"Writer",
        "description":"","project_type":"Video Script","channel_id":channel_b,
        "script_status":"Published","settings":{}}));
    assert_eq!(call(&mut s,"channel_script_references",json!({
        "project_id":script_a,"include_other_channels":true,"query":"redemption"})).as_array().unwrap().len(),1);
    drop(s);
    let mut reopened=Store::open(dir.path()).unwrap();
    assert_eq!(call(&mut reopened,"channel_scripts",json!({"channel_id":channel_b}))[0]["script_status"],"Published");
    assert_eq!(call(&mut reopened,"channels",json!({})).as_array().unwrap().len(),2);
    assert_eq!(reopened.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),4);
}
#[test]
fn legacy_script_migrates_without_losing_its_manuscript() {
    let dir=tempfile::tempdir().unwrap();
    let mut s=Store::open(dir.path()).unwrap();
    let pid=call(&mut s,"create_project",json!({
        "title":"Legacy video","author":"Writer","project_type":"Video Script"}))["id"].as_str().unwrap().to_owned();
    let chapter_id=chapter(&mut s,&pid);
    call(&mut s,"save_chapter",json!({"id":chapter_id,"project_id":pid,"version":0,
        "html":"<p>Keep me</p>","text":"Keep me"}));
    let ch=call(&mut s,"save_channel",json!({"name":"Channel A","confirmed":true}))["id"].as_str().unwrap().to_owned();
    assert!(s.request("channel_script_references",json!({"project_id":pid})).is_err());
    call(&mut s,"update_project",json!({"project_id":pid,"title":"Legacy video","author":"Writer",
        "project_type":"Video Script","channel_id":ch,"script_status":"In Production","settings":{}}));
    assert_eq!(call(&mut s,"chapter",json!({"project_id":pid,"id":chapter_id}))["text"],"Keep me");
}
