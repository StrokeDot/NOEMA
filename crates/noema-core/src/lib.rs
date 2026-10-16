pub mod import;
use rusqlite::{params, types::ValueRef, Connection};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn required<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    let s = v[key].as_str().ok_or_else(|| format!("Missing {key}"))?;
    if s.trim().is_empty() {
        return Err(format!("{key} cannot be empty").into());
    }
    Ok(s)
}
fn string<'a>(v: &'a Value, key: &str) -> &'a str {
    v[key].as_str().unwrap_or("")
}
fn offset(v: &Value) -> i64 {
    v["offset"].as_i64().unwrap_or(0).max(0)
}
fn rows(conn: &Connection, sql: &str, p: impl rusqlite::Params) -> Result<Value> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let vals = stmt
        .query_map(p, |r| {
            let mut obj = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(x) => json!(x),
                    ValueRef::Real(x) => json!(x),
                    ValueRef::Text(x) => json!(String::from_utf8_lossy(x)),
                    _ => Value::Null,
                };
                obj.insert(name.clone(), v);
            }
            Ok(Value::Object(obj))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(json!(vals))
}
pub struct Store {
    pub conn: Connection,
    pub root: PathBuf,
}
impl Store {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("originals"))?;
        let conn = Connection::open(root.join("noema.sqlite3"))?;
        conn.busy_timeout(std::time::Duration::from_secs(10))?;
        conn.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )?;
        let ver: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if ver > 3 {
            return Err(
                "This database was created by a newer NOEMA version. Please update NOEMA.".into(),
            );
        }
        if ver < 1 {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(include_str!("schema.sql"))?;
            tx.commit()?;
        }
        if ver < 2 {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(include_str!("migrations/v2_book_gems.sql"))?;
            tx.commit()?;
        }
        if ver < 3 {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(include_str!("migrations/v3_script_frameworks.sql"))?;
            tx.commit()?;
        }
        Ok(Self { conn, root })
    }
    pub fn request(&mut self, action: &str, a: Value) -> Result<Value> {
        match action {
            "projects" => rows(&self.conn, "SELECT * FROM projects ORDER BY created_at DESC", []),
            "create_project" => {
                let title = required(&a, "title")?.trim();
                let author = required(&a, "author")?.trim();
                if title.len() > 500 || author.len() > 500 {
                    return Err("Title or author is too long".into());
                }
                let kind = a["project_type"].as_str().unwrap_or("Book");
                if kind != "Book" && kind != "Video Script" { return Err("Unsupported project type".into()); }
                let id = id();
                self.conn.execute(
                    "INSERT INTO projects(id,title,author,description,project_type,created_at) VALUES(?,?,?,?,?,?)",
                    params![id,title,author,string(&a,"description"),kind,now()])?;
                Ok(json!({
                "id":id}
                ))
            }
            "update_project" => {
                self.conn.execute(
                    "UPDATE projects SET title=?,author=?,description=?,settings=?,project_type=COALESCE(NULLIF(?,''),project_type) WHERE id=?",
                    params![
                        required(&a, "title")?,
                        required(&a, "author")?,
                        string(&a, "description"),
                        a["settings"].to_string(),
                        string(&a, "project_type"),
                        required(&a, "project_id")?
                    ],
                )?;
                Ok(json!(true))
            }
            "chapters" => rows(&self.conn, "SELECT id,title,position,version,updated_at,length(text) AS characters FROM chapters WHERE project_id=? AND deleted=0 ORDER BY position,id", params![required(&a, "project_id")?]),
            "chapter" => {
                let value = rows(
                    &self.conn,
                    "SELECT * FROM chapters WHERE id=? AND project_id=? AND deleted=0",
                    params![required(&a, "id")?, required(&a, "project_id")?],
                )?;
                value[0].as_object().ok_or("Chapter not found")?;
                Ok(value[0].clone())
            }
            "create_chapter" => {
                let id = id();
                self.conn.execute(
                    "INSERT INTO chapters(id,project_id,title,position,updated_at) VALUES(?,?,?,COALESCE((SELECT MAX(position)+1 FROM chapters WHERE project_id=?),0),?)",
                    params![
                        id,
                        required(&a, "project_id")?,
                        required(&a, "title")?,
                        required(&a, "project_id")?,
                        now()
                    ],
                )?;
                Ok(json!({
                "id":id}
                ))
            }
            "rename_chapter" => {
                self.conn.execute(
                    "UPDATE chapters SET title=? WHERE id=? AND project_id=? AND deleted=0",
                    params![
                        required(&a, "title")?,
                        required(&a, "id")?,
                        required(&a, "project_id")?
                    ],
                )?;
                Ok(json!(true))
            }
            "delete_chapter" => {
                self.conn
                    .execute("UPDATE chapters SET deleted=1 WHERE id=? AND project_id=?", params![required(&a, "id")?, required(&a, "project_id")?])?;
                Ok(json!(true))
            }
            "reorder_chapters" => {
                let project = required(&a, "project_id")?;
                let ids = a["ids"].as_array().ok_or("Expected chapter IDs")?;
                let existing = rows(&self.conn, "SELECT id FROM chapters WHERE project_id=? AND deleted=0", params![project])?;
                let mut wanted: Vec<_> = ids.iter().filter_map(Value::as_str).collect();
                wanted.sort();
                let mut current: Vec<_> = existing
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter_map(|v| v["id"].as_str())
                    .collect();
                current.sort();
                if wanted != current {
                    return Err("Chapter order must contain each chapter exactly once".into());
                }
                let tx = self.conn.transaction()?;
                for (i, id) in ids.iter().enumerate() {
                    tx.execute("UPDATE chapters SET position=? WHERE id=? AND project_id=?", params![i as i64, id.as_str(), project])?;
                }
                tx.commit()?;
                Ok(json!(true))
            }
            "save_chapter" => self.save(&a),
            "revisions" => rows(
                &self.conn,
                "SELECT r.id,r.created_at,length(r.text) AS characters FROM revisions r JOIN chapters c ON c.id=r.chapter_id WHERE c.id=? AND c.project_id=? ORDER BY r.created_at DESC LIMIT 100",
                params![required(&a, "id")?, required(&a, "project_id")?],
            ),
            "revision" => {
                let v = rows(
                    &self.conn,
                    "SELECT r.* FROM revisions r JOIN chapters c ON c.id=r.chapter_id WHERE r.id=? AND c.project_id=?",
                    params![required(&a, "id")?, required(&a, "project_id")?],
                )?;
                if v[0].is_null() {
                    return Err("Revision not found".into());
                }
                Ok(v[0].clone())
            }
            "sources" => {
                let order = match string(&a, "sort") {
                    "name" => "name COLLATE NOCASE,id",
                    "type" => "kind,name COLLATE NOCASE,id",
                    _ => "created_at DESC,id",
                };
                let sql = format!("SELECT id,name,kind,tags,created_at,warning FROM sources WHERE project_id=? AND (?='' OR kind=?) AND (instr(lower(name),lower(?))>0 OR instr(lower(tags),lower(?))>0) ORDER BY {order} LIMIT 50 OFFSET ?");
                rows(&self.conn, &sql, params![required(&a,"project_id")?,string(&a,"kind"),string(&a,"kind"),string(&a,"filter"),string(&a,"filter"),offset(&a)])
            }
            "source_tags" => {
                self.conn.execute(
                    "UPDATE sources SET tags=? WHERE id=? AND project_id=?",
                    params![
                        string(&a, "tags"),
                        required(&a, "id")?,
                        required(&a, "project_id")?
                    ],
                )?;
                Ok(json!(true))
            }
            "source_offset" => {
                let n: i64 = self.conn.query_row(
                    "SELECT count(*) FROM passages WHERE source_id=? AND project_id=? AND id<?",
                    params![
                        required(&a, "id")?,
                        required(&a, "project_id")?,
                        a["passage_id"].as_i64().ok_or("Missing passage")?
                    ],
                    |r| r.get(0),
                )?;
                Ok(json!({
                "offset":n}
                ))
            }
            "source_passages" => rows(
                &self.conn,
                "SELECT id,location,text FROM passages WHERE source_id=? AND project_id=? ORDER BY id LIMIT 30 OFFSET ?",
                params![required(&a, "id")?, required(&a, "project_id")?, offset(&a)],
            ),
            "search" => {
                let query = string(&a, "query")
                    .split_whitespace()
                    .take(20)
                    .map(|w| format!("\"{}\"", w.replace('"', "\"\"")))
                    .collect::<Vec<_>>()
                    .join(" AND ");
                if query.is_empty() {
                    return Ok(json!([]));
                }
                rows(
                    &self.conn,
                    "SELECT p.id,p.source_id,p.location,s.name,s.kind,snippet(passage_fts,0,'','', ' … ',48) AS excerpt FROM passage_fts JOIN passages p ON p.id=passage_fts.rowid JOIN sources s ON s.id=p.source_id WHERE passage_fts MATCH ? AND p.project_id=? ORDER BY rank LIMIT 40 OFFSET ?",
                    params![query, required(&a, "project_id")?, offset(&a)],
                )
            }
            "memories" => rows(
                &self.conn,
                "SELECT m.*,s.name AS source_name FROM memories m LEFT JOIN sources s ON s.id=m.source_id WHERE m.project_id=? AND (?='' OR m.category=?) AND (instr(lower(m.title),lower(?))>0 OR instr(lower(m.body),lower(?))>0) ORDER BY m.updated_at DESC LIMIT 100 OFFSET ?",
                params![
                    required(&a, "project_id")?,
                    string(&a, "category"),
                    string(&a, "category"),
                    string(&a, "query"),
                    string(&a, "query"),
                    offset(&a)
                ],
            ),
            "save_memory" => {
                let sid = a["source_id"].as_str().filter(|s| !s.is_empty());
                let pid = required(&a, "project_id")?;
                if let Some(s) = sid {
                    let count: i64 = self.conn.query_row("SELECT count(*) FROM sources WHERE id=? AND project_id=?", params![s, pid], |r| r.get(0))?;
                    if count != 1 {
                        return Err("Source must belong to this project".into());
                    }
                }
                let mid = a["id"].as_str().map(str::to_string).unwrap_or_else(id);
                self.conn.execute(
                    "INSERT INTO memories(id,project_id,category,title,body,source_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,title=excluded.title,body=excluded.body,source_id=excluded.source_id,updated_at=excluded.updated_at WHERE memories.project_id=excluded.project_id",
                    params![
                        mid,
                        pid,
                        required(&a, "category")?,
                        required(&a, "title")?,
                        string(&a, "body"),
                        sid,
                        now()
                    ],
                )?;
                Ok(json!({
                "id":mid}
                ))
            }
            "delete_memory" => {
                self.conn.execute(
                    "DELETE FROM memories WHERE id=? AND project_id=?",
                    params![required(&a, "id")?, required(&a, "project_id")?],
                )?;
                Ok(json!(true))
            }
            "gems" => {
                let project = required(&a, "project_id")?;
                let chapter = string(&a, "chapter_id");
                let category = string(&a, "kind");
                let q = string(&a, "query");
                rows(&self.conn,
                    "SELECT * FROM book_gems WHERE project_id=? AND deleted=0 AND (?='' OR chapter_id=?) AND (?='' OR kind=?) AND (instr(lower(text),lower(?))>0 OR instr(lower(notes),lower(?))>0) ORDER BY updated_at DESC,id LIMIT 100 OFFSET ?",
                    params![project,chapter,chapter,category,category,q,q,offset(&a)])
            }
            "save_gem" => {
                let project = required(&a, "project_id")?;
                let text = required(&a, "text")?.trim();
                if text.len() > 100_000 { return Err("Book gem is too long".into()); }
                let kind = required(&a, "kind")?;
                let origin = required(&a, "origin")?;
                let status = required(&a, "status")?;
                let chapter = a["chapter_id"].as_str().filter(|s| !s.is_empty());
                if let Some(cid) = chapter {
                    let found: i64 = self.conn.query_row(
                        "SELECT count(*) FROM chapters WHERE id=? AND project_id=? AND deleted=0",
                        params![cid,project],|r|r.get(0))?;
                    if found != 1 { return Err("Chapter must belong to this book".into()); }
                }
                let gid = a["id"].as_str().filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(id);
                let affected = self.conn.execute(
                    "INSERT INTO book_gems(id,project_id,chapter_id,kind,original_text,text,notes,origin,source_label,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET chapter_id=excluded.chapter_id,kind=excluded.kind,text=excluded.text,notes=excluded.notes,status=excluded.status,updated_at=excluded.updated_at WHERE book_gems.project_id=excluded.project_id AND book_gems.deleted=0",
                    params![gid,project,chapter,kind,text,text,string(&a,"notes"),origin,string(&a,"source_label"),status,now(),now()])?;
                if affected == 0 { return Err("Gem not found in this book".into()); }
                Ok(json!({"id":gid}))
            }
            "delete_gem" => {
                let affected = self.conn.execute(
                    "UPDATE book_gems SET deleted=1,updated_at=? WHERE id=? AND project_id=? AND deleted=0",
                    params![now(),required(&a,"id")?,required(&a,"project_id")?])?;
                if affected == 0 { return Err("Gem not found in this book".into()); }
                Ok(json!(true))
            }
            "frameworks" => {
                let pid = required(&a, "project_id")?;
                rows(&self.conn,
                    "SELECT f.*,COALESCE(pf.active,0) AS active FROM belief_frameworks f LEFT JOIN project_frameworks pf ON pf.framework_id=f.id AND pf.project_id=? WHERE f.deleted=0 ORDER BY f.updated_at DESC,f.id LIMIT 250",
                    params![pid])
            }
            "save_framework" => {
                let title = required(&a,"title")?.trim();
                let principles = required(&a,"principles")?.trim();
                let perspective = required(&a,"perspective")?;
                let status = required(&a,"status")?;
                if !["Author","External","Character","Custom"].contains(&perspective) {
                    return Err("Invalid framework perspective".into());
                }
                if !["Draft","Confirmed"].contains(&status) {
                    return Err("Invalid framework status".into());
                }
                if title.len() > 500 || principles.len() > 500_000 || string(&a,"qualifications").len() > 100_000 {
                    return Err("Framework text exceeds storage limits".into());
                }
                let fid = a["id"].as_str().filter(|v|!v.is_empty());
                let id = fid.map(str::to_string).unwrap_or_else(id);
                let changed = if fid.is_some() {
                    self.conn.execute(
                        "UPDATE belief_frameworks SET title=?,perspective=?,principles=?,qualifications=?,status=?,updated_at=? WHERE id=? AND deleted=0",
                        params![title,perspective,principles,string(&a,"qualifications"),status,now(),id])?
                } else {
                    self.conn.execute(
                        "INSERT INTO belief_frameworks(id,title,perspective,principles,original_text,qualifications,source_label,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        params![id,title,perspective,principles,principles,string(&a,"qualifications"),string(&a,"source_label"),status,now(),now()])?
                };
                if changed != 1 { return Err("Framework not found".into()); }
                if status == "Draft" {
                    self.conn.execute(
                        "UPDATE project_frameworks SET active=0 WHERE framework_id=?",
                        params![id])?;
                }
                Ok(json!({"id":id}))
            }
            "set_framework_active" => {
                let project = required(&a,"project_id")?;
                let framework = required(&a,"framework_id")?;
                let active = a["active"].as_bool().ok_or("Missing active flag")?;
                let confirmed: i64 = self.conn.query_row(
                    "SELECT count(*) FROM belief_frameworks WHERE id=? AND deleted=0 AND status='Confirmed'",
                    params![framework],|r|r.get(0))?;
                if confirmed != 1 && active { return Err("Confirm the framework before activating it".into()); }
                let affected = self.conn.execute(
                    "INSERT INTO project_frameworks(project_id,framework_id,active) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=?) AND EXISTS(SELECT 1 FROM belief_frameworks WHERE id=? AND deleted=0) ON CONFLICT(project_id,framework_id) DO UPDATE SET active=excluded.active",
                    params![project,framework,if active {1} else {0},project,framework])?;
                if affected != 1 { return Err("Project or framework not found".into()); }
                Ok(json!(true))
            }
            "framework_context" => {
                rows(&self.conn,
                    "SELECT f.id,f.title,f.perspective,f.principles,f.qualifications,f.source_label FROM project_frameworks pf JOIN belief_frameworks f ON f.id=pf.framework_id WHERE pf.project_id=? AND pf.active=1 AND f.status='Confirmed' AND f.deleted=0 ORDER BY f.title",
                    params![required(&a,"project_id")?])
            }
            "archive_framework" => {
                let fid=required(&a,"id")?;
                let tx=self.conn.transaction()?;
                let n=tx.execute("UPDATE belief_frameworks SET deleted=1,updated_at=? WHERE id=? AND deleted=0",params![now(),fid])?;
                if n!=1 { return Err("Framework not found".into()); }
                tx.execute("UPDATE project_frameworks SET active=0 WHERE framework_id=?",params![fid])?;
                tx.commit()?;
                Ok(json!(true))
            }
            "storage" => Ok(json!({
            "path":self.root.to_string_lossy(),"schema":3}
            )),
            "backup" => {
                let requested = PathBuf::from(required(&a, "path")?);
                if !requested.is_absolute() { return Err("Choose an absolute backup location".into()); }
                let parent = requested.parent().ok_or("Invalid backup location")?.canonicalize()?;
                let dest = parent.join(requested.file_name().ok_or("Choose a new backup folder name")?);
                if dest.exists() {
                    return Err("Choose a new folder name for the backup".into());
                }
                if dest.starts_with(self.root.canonicalize()?) {
                    return Err("Choose a backup location outside NOEMA's data folder".into());
                }
                fs::create_dir_all(&dest)?;
                let result = (|| -> Result<()> {
                    self.conn
                        .execute("VACUUM INTO ?", params![dest.join("noema.sqlite3").to_string_lossy()])?;
                    copy_dir(&self.root.join("originals"), &dest.join("originals"))?;
                    Ok(())
                })();
                if let Err(e) = result {
                    return Err(format!("Backup incomplete: {e}. The partial backup is at {}", dest.display()).into());
                }
                Ok(json!({
                "path":dest.to_string_lossy()}
                ))
            }
            _ => Err(format!("Unknown operation: {action}").into()),
        }
    }

    fn save(&mut self, a: &Value) -> Result<Value> {
        let cid = required(a, "id")?;
        let pid = required(a, "project_id")?;
        let expected = a["version"].as_i64().ok_or("Missing revision version")?;
        let html = string(a, "html");
        let text = string(a, "text");
        let tx = self.conn.transaction()?;
        let (old_html, old_text, version): (String, String, i64) = tx.query_row(
            "SELECT html,text,version FROM chapters WHERE id=? AND project_id=? AND deleted=0",
            params![cid, pid],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        if expected != version {
            return Err("This chapter changed in another window. Your text has not been overwritten. Copy your current text before reloading.".into());
        }
        if old_html == html {
            return Ok(json!({"version":version}));
        }
        let last: i64 = tx.query_row(
            "SELECT COALESCE(MAX(created_at),0) FROM revisions WHERE chapter_id=?",
            params![cid],
            |r| r.get(0),
        )?;
        if now() - last >= 60_000 || a["snapshot"].as_bool().unwrap_or(false) {
            tx.execute(
                "INSERT INTO revisions VALUES(?,?,?,?,?)",
                params![id(), cid, old_html, old_text, now()],
            )?;
        }
        tx.execute(
            "UPDATE chapters SET html=?,text=?,version=version+1,updated_at=? WHERE id=?",
            params![html, text, now(), cid],
        )?;
        tx.commit()?;
        Ok(json!({"version":version+1}))
    }
}
fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let e = entry?;
        if e.file_type()?.is_dir() {
            copy_dir(&e.path(), &to.join(e.file_name()))?
        } else {
            fs::copy(e.path(), to.join(e.file_name()))?;
        }
    }
    Ok(())
}
