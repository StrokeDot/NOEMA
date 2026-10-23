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
    let imported = import(&mut s, &p, &fixture);
    let original_path: String = s.conn.query_row(
        "SELECT original_path FROM sources WHERE id=?",
        [imported["id"].as_str().unwrap()], |r| r.get(0)
    ).unwrap();
    assert_eq!(fs::read(s.root.join(original_path)).unwrap(), fs::read(&fixture).unwrap());
    let first = call(&mut s, "search", json!({"project_id":p,"query":"redemption"}));
    assert!(first[0]["location"].as_str().unwrap().starts_with("Page 1"));
    let hits = call(
        &mut s,
        "search",
        json!({"project_id":p,"query":"responsibility"}),
    );
    assert!(hits[0]["location"].as_str().unwrap().starts_with("Page 2"));
    let scan = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/scanned.pdf");
    let error = match prepare(&s.root, &scan) {
        Ok(_) => panic!("Text extraction must not report success for a page with no text"),
        Err(e) => e.to_string(),
    };
    assert!(error.contains("No readable text found"), "Unexpected parse error: {error}");
    assert!(error.contains("OCR"));
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
        11
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
    assert_eq!(store.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
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
    s.conn.execute_batch("DROP INDEX source_project_origin; ALTER TABLE sources DROP COLUMN source_origin; DROP TABLE writer_profile_notes; DROP TABLE conversation_draft_items; DROP TABLE conversation_draft_settings; DROP TABLE writing_turns; DROP INDEX source_working_project; ALTER TABLE sources DROP COLUMN working_document; DROP TABLE project_chat_messages; ALTER TABLE sources DROP COLUMN use_guidance; ALTER TABLE sources DROP COLUMN role; DROP TABLE script_cue_revisions; DROP TABLE script_cues; DROP INDEX projects_channel; ALTER TABLE projects DROP COLUMN script_status; ALTER TABLE projects DROP COLUMN channel_id; DROP TABLE channel_profiles; DROP TABLE project_frameworks; DROP TABLE belief_frameworks; ALTER TABLE projects DROP COLUMN project_type; DROP TABLE book_gems; PRAGMA user_version=1;").unwrap();
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
    assert_eq!(reopened.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
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
    let cue=call(&mut s,"create_script_cue",json!({"project_id":script_b,"heading":"Scene source"}))["id"].as_str().unwrap().to_string();
    call(&mut s,"save_script_cue",json!({"project_id":script_b,"id":cue,"version":0,
        "heading":"Scene source","narration":"Here is a redemption comparison",
        "visuals":"Relevant video clip","status":"Draft"}));
    let cross=call(&mut s,"channel_script_references",json!({
        "project_id":script_a,"include_other_channels":true,"query":"redemption"}));
    assert_eq!(cross.as_array().unwrap().len(),2);
    assert!(cross.as_array().unwrap().iter().any(|r|r["section_kind"]=="Production cue"));
    drop(s);
    let mut reopened=Store::open(dir.path()).unwrap();
    assert_eq!(call(&mut reopened,"channel_scripts",json!({"channel_id":channel_b}))[0]["script_status"],"Published");
    assert_eq!(call(&mut reopened,"channels",json!({})).as_array().unwrap().len(),2);
    assert_eq!(reopened.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
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

#[test]
fn video_cues_preserve_separate_narration_visuals_sources_and_revisions() {
    let dir=tempfile::tempdir().unwrap();
    let mut s=Store::open(dir.path()).unwrap();
    let book=project(&mut s,"A book");
    assert!(s.request("create_script_cue",json!({"project_id":book})).is_err());
    let script=call(&mut s,"create_project",json!({"title":"Arthur video","author":"Writer",
        "project_type":"Video Script"}))["id"].as_str().unwrap().to_string();
    let cid=call(&mut s,"create_script_cue",json!({"project_id":script,"heading":"Opening"}))["id"]
        .as_str().unwrap().to_string();
    let other=call(&mut s,"create_project",json!({"title":"Other","author":"Writer",
        "project_type":"Video Script"}))["id"].as_str().unwrap().to_string();
    let unrelated=call(&mut s,"create_script_cue",json!({"project_id":other,"heading":"Separate"}))["id"]
        .as_str().unwrap().to_string();
    assert_eq!(call(&mut s,"script_cues",json!({"project_id":other})).as_array().unwrap().len(),1);
    let first=call(&mut s,"save_script_cue",json!({
        "project_id":script,"id":cid,"version":0,"heading":"Opening",
        "narration":"Arthur seeks redemption.","visuals":"Slow close-up on Arthur",
        "evidence_notes":"Review scene source before publishing",
        "source_locator":"RDR2 bench scene",
        "planned_seconds":15,"status":"Draft","snapshot":true
    }));
    assert_eq!(first["version"],1);
    assert!(s.request("save_script_cue",json!({"project_id":script,"id":cid,"version":0,
        "status":"Ready"})).is_err());
    assert!(s.request("save_script_cue",json!({"project_id":other,"id":cid,"version":1,
        "status":"Ready"})).is_err());
    assert!(s.request("save_script_cue",json!({"project_id":script,"id":cid,"version":1,
        "source_id":"not-a-source","status":"Ready"})).is_err());
    let second=call(&mut s,"create_script_cue",json!({"project_id":script,"heading":"Finale"}))["id"]
        .as_str().unwrap().to_string();
    assert!(s.request("reorder_script_cues",json!({"project_id":script,"ids":[cid,cid]})).is_err());
    assert!(s.request("reorder_script_cues",json!({"project_id":script,"ids":[cid,unrelated]})).is_err());
    call(&mut s,"reorder_script_cues",json!({"project_id":script,"ids":[second,cid]}));
    assert_eq!(call(&mut s,"script_cues",json!({"project_id":script}))[0]["heading"],"Finale");
    assert_eq!(call(&mut s,"script_cue_history",json!({"project_id":script,"id":cid})).as_array().unwrap().len(),1);
    drop(s);
    let mut reopened=Store::open(dir.path()).unwrap();
    let cue=call(&mut reopened,"script_cues",json!({"project_id":script}))[1].clone();
    assert_eq!(cue["narration"],"Arthur seeks redemption.");
    assert_eq!(cue["visuals"],"Slow close-up on Arthur");
    assert_eq!(cue["source_locator"],"RDR2 bench scene");
    assert_eq!(cue["planned_seconds"],15);
    assert_eq!(reopened.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
    call(&mut reopened,"delete_script_cue",json!({"project_id":script,"id":cid}));
    assert_eq!(call(&mut reopened,"script_cues",json!({"project_id":script})).as_array().unwrap().len(),1);
    let retained:i64=reopened.conn.query_row("SELECT count(*) FROM script_cues WHERE id=?",[cid],|r|r.get(0)).unwrap();
    assert_eq!(retained,1);
}

// Check the PDF byte-level invariants, not just whether a forgiving parser can
// recover damaged files. This catches Windows newline conversion at checkout.
#[test]
fn pdf_fixture_xref_offsets_survive_checkout() {
    for name in ["research.pdf", "scanned.pdf"] {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures").join(name);
        let bytes = fs::read(path).unwrap();
        let marker = b"startxref";
        let start = bytes.windows(marker.len()).rposition(|w| w == marker).unwrap();
        let trailer = std::str::from_utf8(&bytes[start + marker.len()..]).unwrap();
        let xref: usize = trailer.split_whitespace().next().unwrap().parse().unwrap();
        assert_eq!(bytes.get(xref..xref + 4), Some(b"xref".as_slice()),
            "{name}: startxref no longer points to xref. Check .gitattributes and core.autocrlf.");
        let table = std::str::from_utf8(&bytes[xref..]).unwrap();
        let mut lines = table.lines();
        assert_eq!(lines.next(), Some("xref"));
        let header: Vec<usize> = lines.next().unwrap().split_whitespace().map(|x| x.parse().unwrap()).collect();
        for (index, line) in lines.take(header[1]).enumerate() {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields[2] == "n" {
                let offset: usize = fields[0].parse().unwrap();
                let object = format!("{} {} obj", header[0] + index, fields[1].parse::<usize>().unwrap());
                assert!(bytes[offset..].starts_with(object.as_bytes()), "{name}: wrong object offset {offset}");
            }
        }
        assert!(trailer.trim_end().ends_with("%%EOF"));
    }
}

#[test]
fn writing_context_separates_confirmed_author_premises_from_project_sources() {
    let dir=tempfile::tempdir().unwrap();
    let mut store=Store::open(dir.path()).unwrap();
    let p=project(&mut store,"Reasoning book");
    let another=project(&mut store,"Another book");
    let f=call(&mut store,"save_framework",json!({
        "title":"Author's free will position","perspective":"Author","principles":"Freedom matures.",
        "status":"Confirmed"
    }))["id"].as_str().unwrap().to_string();
    call(&mut store,"set_framework_active",json!({"project_id":p,"framework_id":f,"active":true}));
    let source=dir.path().join("research-note.txt");
    fs::write(&source,"Evidence should be assessed independently.").unwrap();
    let id=import(&mut store,&p,&source)["id"]
        .as_str().unwrap().to_string();
    call(&mut store,"source_guidance",json!({"project_id":p,"id":id,"role":"Critical Perspective",
        "use_guidance":"Steelman before rebutting"}));
    assert!(store.request("source_guidance",json!({"project_id":another,"id":id,"role":"Primary Reference"})).is_err());
    let x=call(&mut store,"project_writing_context",json!({"project_id":p}));
    assert_eq!(x["frameworks"][0]["perspective"],"Author");
    assert_eq!(x["sources"][0]["role"],"Critical Perspective");
    assert_eq!(x["sources"][0]["use_guidance"],"Steelman before rebutting");
    assert_eq!(call(&mut store,"project_writing_context",json!({"project_id":another}))["sources"],json!([]));
    drop(store);
    let mut reopened=Store::open(dir.path()).unwrap();
    assert_eq!(call(&mut reopened,"project_writing_context",json!({"project_id":p}))["sources"][0]["role"],"Critical Perspective");
}

#[test]
fn word_epub_and_project_chat_persist_with_strict_isolation() {
    use std::io::Write;
    let d=tempfile::tempdir().unwrap();
    let mut s=Store::open(d.path()).unwrap();
    let book=project(&mut s,"Research-backed book");
    let other=project(&mut s,"Unrelated book");
    let docx=d.path().join("chapters.docx");
    {
        let file=fs::File::create(&docx).unwrap();
        let mut zip=zip::ZipWriter::new(file);
        zip.start_file("word/document.xml",zip::write::SimpleFileOptions::default()).unwrap();
        zip.write_all(br#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Chapter about freedom</w:t></w:r></w:p><w:p><w:r><w:t>Personal responsibility</w:t></w:r></w:p></w:body></w:document>"#).unwrap();
        zip.finish().unwrap();
    }
    let word=import(&mut s,&book,&docx);
    let sid=word["id"].as_str().unwrap().to_string();
    assert_eq!(word["passages"],1);
    assert_eq!(call(&mut s,"source_passages",json!({"project_id":book,"id":sid}))[0]["text"]
        .as_str().unwrap().contains("Personal responsibility"),true);
    assert_eq!(call(&mut s,"source_passages",json!({"project_id":other,"id":sid})),json!([]));
    call(&mut s,"set_working_document",json!({"project_id":book,"source_id":sid,"enabled":true}));
    assert!(s.request("set_working_document",json!({"project_id":other,"source_id":sid,"enabled":true})).is_err());
    let chapter=call(&mut s,"create_chapter_from_source",
        json!({"project_id":book,"source_id":sid,"title":"Imported draft"}))["id"].as_str().unwrap().to_string();
    let imported=call(&mut s,"chapter",json!({"project_id":book,"id":chapter}));
    assert!(imported["text"].as_str().unwrap().contains("Chapter about freedom"));
    assert!(!imported["html"].as_str().unwrap().contains("<script>"));
    assert!(s.request("create_chapter_from_source",
        json!({"project_id":other,"source_id":sid,"title":"Do not copy"})).is_err());
    let epub=d.path().join("notes.epub");
    {
        let file=fs::File::create(&epub).unwrap();
        let mut zip=zip::ZipWriter::new(file);
        let opt=zip::write::SimpleFileOptions::default();
        zip.start_file("META-INF/container.xml",opt).unwrap();
        zip.write_all(br#"<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>"#).unwrap();
        zip.start_file("OEBPS/book.opf",opt).unwrap();
        zip.write_all(br#"<package><manifest><item id="one" href="1.xhtml"/><item id="two" href="2.xhtml"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>"#).unwrap();
        zip.start_file("OEBPS/1.xhtml",opt).unwrap();
        zip.write_all(b"<html><body><p>First book chapter</p></body></html>").unwrap();
        zip.start_file("OEBPS/2.xhtml",opt).unwrap();
        zip.write_all(b"<html><body><p>Second book chapter</p></body></html>").unwrap();
        zip.finish().unwrap();
    }
    let ebook=import(&mut s,&book,&epub);
    let passages=call(&mut s,"source_passages",json!({"project_id":book,"id":ebook["id"]}));
    assert_eq!(passages[0]["location"].as_str().unwrap().contains("2.xhtml"),true);
    assert!(passages[0]["text"].as_str().unwrap().contains("Second book chapter"));
    assert!(passages[1]["text"].as_str().unwrap().contains("First book chapter"));
    call(&mut s,"append_chat_message",json!({"project_id":book,"role":"user","content":"Explain my freedom framework"}));
    call(&mut s,"append_chat_message",json!({"project_id":book,"role":"assistant","content":"Here is one candidate passage.","provider":"ollama"}));
    let context=call(&mut s,"chat_context",json!({"project_id":book,"query":"responsibility freedom"}));
    assert!(!context["passages"].as_array().unwrap().is_empty());
    assert_eq!(context["recent_messages"].as_array().unwrap().len(),2);
    assert!(context["passages"].as_array().unwrap().iter().any(|x|x["working_document"]==1));
    assert_eq!(call(&mut s,"chat_history",json!({"project_id":other})),json!([]));
    let made=call(&mut s,"create_chapter_from_text",json!({"project_id":book,"title":"AI proposal",
        "text":"<script>danger</script> & truthful thinking"}));
    let escaped=call(&mut s,"chapter",json!({"project_id":book,"id":made["id"]}));
    assert!(escaped["html"].as_str().unwrap().contains("&lt;script&gt;"));
    assert!(s.request("append_chat_message",json!({"project_id":other,"role":"system","content":"No"})).is_err());
    drop(s);
    let mut again=Store::open(d.path()).unwrap();
    assert_eq!(call(&mut again,"chat_history",json!({"project_id":book})).as_array().unwrap().len(),2);
    assert_eq!(call(&mut again,"sources",json!({"project_id":book})).as_array().unwrap().iter()
        .filter(|s|s["working_document"]==1).count(),1);
}

#[test]
fn v9_conversation_preserves_original_and_requires_writer_confirmation() {
    let tmp=tempfile::tempdir().unwrap();
    let mut store=Store::open(tmp.path()).unwrap();
    let book=project(&mut store,"The Book");
    let other=project(&mut store,"Different Book");
    assert_eq!(store.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
    let original="I don't have the full idea but I feel what responsibility mean, in the moment.";
    let turn=call(&mut store,"begin_writing_turn",json!({"project_id":book,"original_text":original}))["id"]
        .as_str().unwrap().to_string();
    assert_eq!(call(&mut store,"writing_turns",json!({"project_id":book}))[0]["original_text"],original);
    assert_eq!(call(&mut store,"writing_turns",json!({"project_id":other})),json!([]));
    call(&mut store,"set_draft_auto_collect",json!({"project_id":book,"enabled":true}));
    call(&mut store,"complete_writing_turn",json!({"project_id":book,"turn_id":turn,
        "original_evidence":original,
        "interpreted_text":"Responsibility matters even while the idea is forming.",
        "assistant_response":"We should distinguish agency from blame.",
        "provider":"ollama","model":"gpt-oss:20b",
        "profile_suggestions":[{"dimension":"Reasoning style",
            "claim":"Prefers exploratory spoken reasoning.",
            "evidence_quote":"I don't have the full idea"}],
        "draft_candidate":"Responsibility is a question worth examining carefully."}));
    assert!(store.request("complete_writing_turn",json!({"project_id":book,"turn_id":turn,
        "interpreted_text":"overwritten","assistant_response":"bad"})).is_err());
    let note=call(&mut store,"writer_profile",json!({}));
    assert_eq!(note.as_array().unwrap().len(),1);
    assert_eq!(note[0]["state"],"Candidate");
    assert_eq!(call(&mut store,"writer_profile_context",json!({})),json!([]));
    let draft=call(&mut store,"conversation_draft",json!({"project_id":book}));
    assert_eq!(draft.as_array().unwrap().len(),1);
    assert_eq!(draft[0]["state"],"Candidate");
    let draft_id=draft[0]["id"].as_str().unwrap().to_owned();
    assert!(store.request("review_draft_item",json!({"project_id":other,"id":draft_id,"state":"Approved"})).is_err());
    call(&mut store,"review_draft_item",json!({"project_id":book,"id":draft_id,"state":"Approved"}));
    assert_eq!(call(&mut store,"approved_conversation_draft",json!({"project_id":book}))
        .as_array().unwrap().len(),1);
    assert_eq!(call(&mut store,"approved_conversation_draft",json!({"project_id":other})),json!([]));
    let nid=note[0]["id"].as_str().unwrap().to_owned();
    call(&mut store,"review_writer_profile_note",json!({"id":nid,"state":"Confirmed"}));
    assert_eq!(call(&mut store,"writer_profile_context",json!({}))[0]["dimension"],"Reasoning style");
    assert_eq!(call(&mut store,"chat_context",json!({"project_id":book,"query":"responsibility"}))
        ["writer_profile"][0]["claim"],"Prefers exploratory spoken reasoning.");
    call(&mut store,"correct_turn_meaning",json!({"project_id":book,"turn_id":turn,
        "interpreted_text":"My position is not complete yet."}));
    let record=call(&mut store,"writing_turns",json!({"project_id":book}));
    assert_eq!(record[0]["original_text"],original);
    assert_eq!(record[0]["interpreted_text"],"My position is not complete yet.");
    assert_eq!(record[0]["interpretation_author_corrected"],1);
    assert!(store.request("correct_turn_meaning",json!({"project_id":other,"turn_id":turn,
        "interpreted_text":"cannot edit"})).is_err());
    drop(store);
    let mut reopened=Store::open(tmp.path()).unwrap();
    assert_eq!(call(&mut reopened,"writing_turns",json!({"project_id":book}))[0]["original_text"],original);
    assert_eq!(call(&mut reopened,"conversation_draft",json!({"project_id":book}))[0]["state"],"Approved");
}

#[test]
fn v9_keeps_an_untouched_pending_input_when_a_provider_fails() {
    let tmp=tempfile::tempdir().unwrap();
    let mut store=Store::open(tmp.path()).unwrap();
    let book=project(&mut store,"Book");
    let turn=call(&mut store,"begin_writing_turn",
        json!({"project_id":book,"original_text":"Unfinished thought."}));
    drop(store);
    let mut reopened=Store::open(tmp.path()).unwrap();
    let record=call(&mut reopened,"writing_turns",json!({"project_id":book}));
    assert_eq!(record[0]["original_text"],"Unfinished thought.");
    assert_eq!(record[0]["state"],"pending");
    assert_eq!(record[0]["interpreted_text"],"");
    assert!(reopened.request("review_writer_profile_note",json!({"id":turn["id"],"state":"Confirmed"})).is_err());
}


#[test]
fn author_and_external_sources_are_isolated_and_critical_review_requires_acknowledgement(){
    let dir=tempfile::tempdir().unwrap();
    let mut store=Store::open(dir.path().join("data")).unwrap();
    let book=project(&mut store,"Author's first book");
    let other=project(&mut store,"Other author's book");
    assert_eq!(store.conn.query_row("PRAGMA user_version",[],|r|r.get::<_,i64>(0)).unwrap(),11);
    let author_source=dir.path().join("author.md");
    let external_source=dir.path().join("external.md");
    fs::write(&author_source,"The author proposes an early argument about moral freedom.").unwrap();
    fs::write(&external_source,"Another writer presents a contrasting interpretation of moral freedom.").unwrap();
    let own=import(&mut store,&book,&author_source);
    let ext=import(&mut store,&book,&external_source);
    let ownid=own["id"].as_str().unwrap();
    let extid=ext["id"].as_str().unwrap();
    call(&mut store,"source_origin",json!({"project_id":book,"id":ownid,"origin":"Author"}));
    assert!(store.request("source_origin",json!({"project_id":other,"id":ownid,"origin":"External"})).is_err());
    assert!(store.request("source_origin",json!({"project_id":book,"id":extid,"origin":"Somebody"})).is_err());
    let list=call(&mut store,"sources",json!({"project_id":book}));
    assert!(list.as_array().unwrap().iter().any(|x|x["id"]==ownid&&x["source_origin"]=="Author"));
    assert!(list.as_array().unwrap().iter().any(|x|x["id"]==extid&&x["source_origin"]=="External"));
    assert_eq!(call(&mut store,"sources",json!({"project_id":other})),json!([]));
    let context=call(&mut store,"chat_context",json!({"project_id":book,"query":"moral freedom"}));
    assert!(context["passages"].as_array().unwrap().iter().any(|v|v["source_origin"]=="Author"));
    assert!(context["passages"].as_array().unwrap().iter().any(|v|v["source_origin"]=="External"));
    let tid=call(&mut store,"begin_writing_turn",json!({"project_id":book,"original_text":"This is unfinished."}))
        ["id"].as_str().unwrap().to_string();
    call(&mut store,"complete_writing_turn",json!({"project_id":book,"turn_id":tid,
        "original_evidence":"This is unfinished.","interpreted_text":"The claim is still being formed.",
        "assistant_response":"Using the author's provisional position, we should first clarify responsibility.",
        "critical_review":"A serious alternative is that responsibility changes under coercion.",
        "provider":"ollama","model":"example","profile_suggestions":[],"draft_candidate":""}));
    let before=call(&mut store,"writing_turns",json!({"project_id":book}));
    assert_eq!(before[0]["critical_review"],"A serious alternative is that responsibility changes under coercion.");
    assert_eq!(before[0]["critique_explored"],0);
    assert!(store.request("mark_critique_explored",json!({"project_id":other,"turn_id":tid,"explored":true})).is_err());
    call(&mut store,"mark_critique_explored",json!({"project_id":book,"turn_id":tid,"explored":true}));
    drop(store);
    let mut reopened=Store::open(dir.path().join("data")).unwrap();
    assert_eq!(call(&mut reopened,"writing_turns",json!({"project_id":book}))[0]["critique_explored"],1);
    assert_eq!(call(&mut reopened,"sources",json!({"project_id":book}))
        .as_array().unwrap().iter().find(|x|x["id"]==ownid).unwrap()["source_origin"],"Author");
}

#[test]
fn writer_profile_corrections_are_approved_and_audited_without_changing_evidence() {
    let tmp=tempfile::tempdir().unwrap();
    let mut store=Store::open(tmp.path()).unwrap();
    let book=project(&mut store,"Thoughtful essays");
    let statement="I want a serious critic, not someone who only agrees with me.";
    let tid=call(&mut store,"begin_writing_turn",
        json!({"project_id":book,"original_text":statement}))["id"]
        .as_str().unwrap().to_string();
    call(&mut store,"complete_writing_turn",json!({
        "project_id":book,"turn_id":tid,"original_evidence":statement,
        "interpreted_text":statement,"assistant_response":"Your arguments should be examined.",
        "critical_review":"Counterarguments still matter.","provider":"ollama","model":"test",
        "profile_suggestions":[{
            "dimension":"Reasoning style",
            "claim":"The writer expects total agreement.",
            "evidence_quote":"a serious critic, not someone who only agrees"
        }],
        "draft_candidate":""
    }));
    let profile=call(&mut store,"writer_profile",json!({}));
    assert_eq!(profile[0]["state"],"Candidate");
    let note=profile[0]["id"].as_str().unwrap().to_string();
    let before=call(&mut store,"chat_context",json!({"project_id":book,"query":"critic"}));
    assert_eq!(before["writer_profile"],json!([]));
    assert!(store.request("edit_writer_profile_note",json!({"id":note,
        "dimension":"Not a dimension","claim":"bad"})).is_err());
    call(&mut store,"edit_writer_profile_note",json!({"id":note,
        "dimension":"Reasoning style",
        "claim":"The writer values a faithful explanation followed by a genuinely independent critique."}));
    let corrected=call(&mut store,"writer_profile",json!({}));
    assert_eq!(corrected[0]["state"],"Confirmed");
    assert_eq!(corrected[0]["evidence_quote"],"a serious critic, not someone who only agrees");
    assert_eq!(corrected[0]["source_turn_id"],tid);
    assert_eq!(corrected[0]["claim"],"The writer values a faithful explanation followed by a genuinely independent critique.");
    let history=call(&mut store,"writer_profile_history",json!({"id":note}));
    assert_eq!(history.as_array().unwrap().len(),1);
    assert_eq!(history[0]["previous_state"],"Candidate");
    assert_eq!(history[0]["previous_claim"],"The writer expects total agreement.");
    let context=call(&mut store,"chat_context",json!({"project_id":book,"query":"critic"}));
    assert_eq!(context["writer_profile"][0]["claim"], corrected[0]["claim"]);
    call(&mut store,"review_writer_profile_note",json!({"id":note,"state":"Rejected"}));
    assert_eq!(call(&mut store,"chat_context",json!({"project_id":book,"query":"critic"}))
        ["writer_profile"],json!([]));
    drop(store);
    let mut reopened=Store::open(tmp.path()).unwrap();
    let history=call(&mut reopened,"writer_profile_history",json!({"id":note}));
    assert_eq!(history.as_array().unwrap().len(),2);
    assert_eq!(history[0]["previous_state"],"Confirmed");
    assert_eq!(call(&mut reopened,"writer_profile",json!({}))[0]["evidence_quote"],
        "a serious critic, not someone who only agrees");
}

#[test]
fn relevant_passages_retrieved_across_old_and_new_sources_without_project_leaks() {
    let tmp=tempfile::tempdir().unwrap();
    let mut store=Store::open(tmp.path().join("data")).unwrap();
    let book=project(&mut store,"First book");
    let other=project(&mut store,"Other book");
    let own_path=tmp.path().join("own.md");
    let study_path=tmp.path().join("study.md");
    fs::write(&own_path,"Responsibility includes genuine freedom and contextual assessment.").unwrap();
    fs::write(&study_path,"A study disputes the same responsibility and freedom framework.").unwrap();
    let own=import(&mut store,&book,&own_path);
    let study=import(&mut store,&book,&study_path);
    call(&mut store,"source_origin",json!({"project_id":book,"id":own["id"],"origin":"Author"}));
    let original=call(&mut store,"chat_context",json!({"project_id":book,"query":"responsibility"}));
    assert!(original["passages"].as_array().unwrap().iter().any(|p|p["source_origin"]=="Author"));
    assert!(original["passages"].as_array().unwrap().iter().any(|p|p["source_origin"]=="External"));
    // Insert newer unrelated passages so the author source would fall beyond
    // the old 1500-passage recency window. The FTS retrieval must still find it.
    let filler=study["id"].as_str().unwrap();
    let tx=store.conn.transaction().unwrap();
    for index in 0..1520 {
        tx.execute("INSERT INTO passages(source_id,project_id,location,text) VALUES(?,?,?,?)",
            rusqlite::params![filler,book,format!("noise {index}"),"A passage about an unrelated gardening topic."]).unwrap();
    }
    tx.commit().unwrap();
    let context=call(&mut store,"chat_context",json!({"project_id":book,"query":"responsibility"}));
    assert!(context["passages"].as_array().unwrap().iter().any(|p|p["source_origin"]=="Author"));
    assert!(context["passages"].as_array().unwrap().iter().any(|p|p["source_origin"]=="External"));
    let unrelated=call(&mut store,"chat_context",json!({"project_id":other,"query":"responsibility"}));
    assert_eq!(unrelated["passages"],json!([]));
}
