use crate::{id, now, Result, Store};
use rusqlite::params;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
const MAX_BYTES: u64 = 256 * 1024 * 1024;
pub struct Passage {
    pub location: String,
    pub text: String,
}
pub struct Message {
    pub conversation_id: String,
    pub title: String,
    pub node_id: String,
    pub parent: Option<String>,
    pub speaker: String,
    pub text: String,
    pub timestamp: Option<String>,
    pub raw: String,
}
pub struct PreparedImport {
    pub source_id: String,
    pub name: String,
    pub kind: String,
    pub original: PathBuf,
    pub relative: String,
    pub passages: Vec<Passage>,
    pub messages: Vec<Message>,
    pub warning: String,
}
// Unicode-safe bounded passages; location is precise within the extracted text.
fn chunk(text: &str, label: &str, out: &mut Vec<Passage>) {
    let chars: Vec<char> = text.chars().collect();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + 1600).min(chars.len());
        let s: String = chars[start..end].iter().collect();
        if !s.trim().is_empty() {
            out.push(Passage {
                location: format!("{label} · characters {}–{}", start + 1, end),
                text: s,
            });
        }
        if end == chars.len() {
            break;
        }
        start = end - 160;
    }
}
use quick_xml::{escape::unescape, events::Event, Reader};
use zip::ZipArchive;
use std::io::Cursor;
const MAX_XML_FILE: u64 = 12 * 1024 * 1024;
const MAX_EXTRACTED_TEXT: usize = 16 * 1024 * 1024;
fn zip_read(archive: &mut ZipArchive<Cursor<&[u8]>>, file: &str) -> Result<Option<Vec<u8>>> {
    let mut entry = match archive.by_name(file) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(format!("Cannot read ebook archive: {e}").into()),
    };
    if entry.size() > MAX_XML_FILE { return Err("A book section exceeds the safe import limit".into()); }
    let mut bytes=Vec::new();
    entry.take(MAX_XML_FILE + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_XML_FILE {return Err("A book section expanded beyond the safe limit".into());}
    Ok(Some(bytes))
}
fn clean_xml(bytes:&[u8], docx:bool)->Result<String> {
    let mut reader=Reader::from_reader(bytes);
    let mut output=String::new();
    loop {
        let event=reader.read_event().map_err(|e|format!("Cannot read XML document: {e}"))?;
        match event {
            Event::Text(t) => {
                let value=reader.decoder().decode(t.as_ref())?;
                let plain=unescape(&value).map_err(|e|format!("Malformed document text: {e}"))?;
                output.push_str(&plain);
            }
            Event::CData(t) => output.push_str(&reader.decoder().decode(t.as_ref())?),
            Event::Start(t)|Event::Empty(t) => {
                let tag=t.name();
                let n=tag.as_ref();
                if (docx && (n==b"w:br" || n==b"w:cr")) || (!docx && n==b"br") {output.push('\n');}
                if docx && n==b"w:tab" {output.push('\t');}
            }
            Event::End(t) => {
                let n=t.name();
                let n=n.as_ref();
                if (docx && (n==b"w:p" || n==b"w:tr")) ||
                   (!docx && [b"p".as_slice(),b"h1",b"h2",b"h3",b"h4",b"h5",b"h6",b"li",b"div",b"blockquote"].contains(&n))
                {output.push_str("\n\n");}
            }
            Event::Eof => break,
            _=>{}
        }
        if output.len()>MAX_EXTRACTED_TEXT{return Err("Extracted document exceeds the safe text limit".into());}
    }
    Ok(output)
}
fn xml_attrs(bytes:&[u8], tag:&[u8], attribute:&[u8])->Result<Vec<String>> {
    let mut rdr=Reader::from_reader(bytes);
    let mut vals=Vec::new();
    loop {
        match rdr.read_event().map_err(|e|format!("Invalid EPUB manifest: {e}"))? {
            Event::Start(t)|Event::Empty(t) if t.name().as_ref()==tag => {
                for a in t.attributes().flatten() {
                    if a.key.as_ref()==attribute {
                        vals.push(String::from_utf8(a.value.into_owned())?);
                    }
                }
            }
            Event::Eof=>break,
            _=>{}
        }
    }
    Ok(vals)
}
fn ep_path(base:&str,name:&str)->String {
    let mut stack:Vec<&str>=base.split('/').filter(|x|!x.is_empty()).collect();
    if !stack.is_empty(){stack.pop();}
    for seg in name.split('/') {
        if seg==".." {stack.pop();}
        else if seg!="." && !seg.is_empty(){stack.push(seg);}
    }
    stack.join("/")
}
fn zipped_passages(bytes:&[u8], kind:&str, passages:&mut Vec<Passage>)->Result<String> {
    let mut archive=ZipArchive::new(Cursor::new(bytes)).map_err(|_|"This Word/EPUB file is not a valid ZIP archive")?;
    if kind=="docx" {
        let text=zip_read(&mut archive,"word/document.xml")?.ok_or("Word file has no document.xml")?;
        let plain=clean_xml(&text,true)?;
        chunk(&plain,"Word document · original text",passages);
        return Ok("Word document imported in reading order. Formatting, images, comments and original page numbers are not indexed.".into());
    }
    // EPUB container references the package file, whose spine determines the reading order.
    let root=zip_read(&mut archive,"META-INF/container.xml")?
        .ok_or("EPUB is missing META-INF/container.xml")?;
    let package=xml_attrs(&root,b"rootfile",b"full-path")?.into_iter().next().ok_or("EPUB has no package document")?;
    let opf=zip_read(&mut archive,&package)?.ok_or("EPUB package document not found")?;
    let mut rdr=Reader::from_reader(opf.as_slice());
    let mut resources=std::collections::HashMap::<String,String>::new();
    let mut spine=Vec::<String>::new();
    loop {
        match rdr.read_event().map_err(|e|format!("Invalid EPUB structure: {e}"))? {
            Event::Start(t)|Event::Empty(t) if t.name().as_ref()==b"item" => {
                let mut id=None;let mut href=None;
                for a in t.attributes().flatten() {
                    let val=String::from_utf8(a.value.into_owned())?;
                    if a.key.as_ref()==b"id"{id=Some(val);}
                    else if a.key.as_ref()==b"href"{href=Some(val);}
                }
                if let (Some(k),Some(v))=(id,href){resources.insert(k,v);}
            }
            Event::Start(t)|Event::Empty(t) if t.name().as_ref()==b"itemref" => {
                for a in t.attributes().flatten(){
                    if a.key.as_ref()==b"idref"{spine.push(String::from_utf8(a.value.into_owned())?);}
                }
            }
            Event::Eof => break,
            _=>{}
        }
    }
    if spine.is_empty(){return Err("EPUB reading order (spine) is missing".into());}
    let mut chapter=0;
    for item in spine {
        let href=resources.get(&item).ok_or("EPUB chapter is missing from manifest")?;
        let target=ep_path(&package,href.split('#').next().unwrap_or(href));
        let page=zip_read(&mut archive,&target)?.ok_or("An EPUB spine chapter cannot be read")?;
        let plain=clean_xml(&page,false)?;
        chapter+=1;
        chunk(&plain,&format!("EPUB section {chapter} · {target}"),passages);
    }
    Ok("DRM-free EPUB imported in reading order. Images, embedded media and page numbers are not indexed.".into())
}
pub fn prepare(root: &Path, path: &Path) -> Result<PreparedImport> {
    let meta = fs::metadata(path)?;
    if !meta.is_file() {
        return Err("Select a file".into());
    }
    if meta.len() > MAX_BYTES {
        return Err("This file exceeds the 256 MiB per-file limit in NOEMA 0.1. Split the archive into smaller files.".into());
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid filename")?
        .to_owned();
    let kind = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["txt", "md", "markdown", "json", "pdf", "docx", "epub"].contains(&kind.as_str()) {
        return Err("Supported files: TXT, Markdown, JSON conversations, text-based PDF, Word DOCX, and DRM-free EPUB".into());
    }
    let source_id = id();
    let relative = format!("originals/{source_id}.{kind}");
    let original = root.join(&relative);
    let mut dest = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&original)?;
    let result = (|| -> Result<PreparedImport> {
        let mut bytes = Vec::new();
        fs::File::open(path)?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("File grew beyond the import size limit".into());
        }
        dest.write_all(&bytes)?;
        dest.sync_all()?;
        // On Windows an open writer can interfere with a second handle reading
        // the PDF, even after sync_all. Close the writer before parsing.
        drop(dest);
        let mut p = PreparedImport {
            source_id,
            name,
            kind: kind.clone(),
            original: original.clone(),
            relative,
            passages: vec![],
            messages: vec![],
            warning: String::new(),
        };
        if kind == "pdf" {
            // The original file has been fully written, synced and closed.
            // Let the PDF extractor open the durable local copy by path.
            let pages = pdf_extract::extract_text_by_pages(&original).map_err(|e| {
                format!(
                    "PDF text extraction failed: {e}. Encrypted and scanned PDFs are unsupported."
                )
            })?;
            let mut blank = 0;
            for (i, page) in pages.iter().enumerate() {
                if page.trim().is_empty() {
                    blank += 1
                }
                chunk(page, &format!("Page {}", i + 1), &mut p.passages)
            }
            if blank > 0 {
                p.warning=format!("{blank} page(s) had no extractable text. Image content is not indexed; OCR is not available.")
            }
        } else if kind == "docx" || kind == "epub" {
            p.warning=zipped_passages(&bytes,&kind,&mut p.passages)?;
        } else {
            let text = std::str::from_utf8(&bytes)
                .map_err(|_| "This file is not UTF-8 text. Save it as UTF-8 and import it again.")?
                .trim_start_matches('\u{feff}');
            if kind == "json" {
                let value: Value =
                    serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;
                p.messages = parse_conversations(value)?;
                for (i, m) in p.messages.iter().enumerate() {
                    chunk(
                        &m.text,
                        &format!(
                            "{} · message {} · {} · node {}",
                            m.title,
                            i + 1,
                            m.speaker,
                            m.node_id
                        ),
                        &mut p.passages,
                    );
                }
                p.warning="All recognized messages and branch links are preserved. Attachments, images and audio are retained in the original JSON only; their contents are not searchable. Branches are displayed parent-first, not flattened into a single conversation.".into();
            } else {
                chunk(text, "Extracted text", &mut p.passages)
            }
        }
        if p.passages.is_empty() {
            return Err("No readable text found. Scanned PDFs need OCR; empty or attachment-only documents cannot be indexed.".into());
        }
        Ok(p)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&original);
    }
    result
}
fn content(m: &Value) -> Result<String> {
    if let Some(s) = m["content"].as_str() {
        return Ok(s.into());
    }
    if let Some(parts) = m["content"]["parts"].as_array() {
        return Ok(parts
            .iter()
            .filter_map(Value::as_str)
            .collect::<Vec<_>>()
            .join("\n"));
    }
    if m["content"].is_null() {
        return Ok(String::new());
    }
    if m["content"]["content_type"].as_str().is_some() {
        return Ok(String::new());
    }
    Err("Unrecognized message content. Expected text content or ChatGPT content.parts.".into())
}
fn stamp(v: &Value) -> Option<String> {
    if v.is_null() {
        None
    } else if let Some(s) = v.as_str() {
        Some(s.into())
    } else {
        Some(v.to_string())
    }
}
pub fn parse_conversations(value: Value) -> Result<Vec<Message>> {
    let conversations: Vec<Value> = if value.is_array() {
        let list = value.as_array().unwrap();
        if list.first().is_some_and(|v| v.get("role").is_some()) {
            vec![json!({"messages":value})]
        } else {
            list.clone()
        }
    } else if value["conversations"].is_array() {
        value["conversations"].as_array().unwrap().clone()
    } else {
        vec![value]
    };
    let mut out = Vec::new();
    for (cidx, c) in conversations.iter().enumerate() {
        let cid = c["id"]
            .as_str()
            .or(c["conversation_id"].as_str())
            .map(str::to_string)
            .unwrap_or_else(|| format!("conversation-{}", cidx + 1));
        let title = c["title"]
            .as_str()
            .unwrap_or("Imported conversation")
            .to_string();
        if let Some(mapping) = c["mapping"].as_object() {
            let mut children: HashMap<String, Vec<String>> = HashMap::new();
            let mut roots = Vec::new();
            for (key, node) in mapping {
                if let Some(parent) = node["parent"].as_str().filter(|p| mapping.contains_key(*p)) {
                    children.entry(parent.into()).or_default().push(key.clone());
                } else {
                    roots.push(key.clone());
                }
            }
            let order = |a: &String, b: &String| {
                let ta = mapping[a]["message"]["create_time"].as_f64().unwrap_or(0.0);
                let tb = mapping[b]["message"]["create_time"].as_f64().unwrap_or(0.0);
                ta.total_cmp(&tb).then(a.cmp(b))
            };
            roots.sort_by(order);
            for ch in children.values_mut() {
                ch.sort_by(order)
            }
            let mut queue: VecDeque<_> = roots.into();
            let mut seen = HashSet::new();
            while let Some(key) = queue.pop_front() {
                if !seen.insert(key.clone()) {
                    return Err("Conversation contains a cycle or repeated node".into());
                }
                let node = &mapping[&key];
                let m = &node["message"];
                if m.is_object() {
                    out.push(Message {
                        conversation_id: cid.clone(),
                        title: title.clone(),
                        node_id: key.clone(),
                        parent: node["parent"].as_str().map(str::to_string),
                        speaker: m["author"]["role"].as_str().unwrap_or("unknown").into(),
                        text: content(m)?,
                        timestamp: stamp(&m["create_time"]),
                        raw: m.to_string(),
                    });
                }
                if let Some(ch) = children.get(&key) {
                    queue.extend(ch.clone())
                }
            }
            if seen.len() != mapping.len() {
                return Err("Conversation graph has cyclic or unreachable nodes".into());
            }
        } else if let Some(messages) = c["messages"].as_array() {
            for (i, m) in messages.iter().enumerate() {
                let role = m["role"]
                    .as_str()
                    .or(m["speaker"].as_str())
                    .ok_or("Message has no role or speaker")?;
                out.push(Message {
                    conversation_id: cid.clone(),
                    title: title.clone(),
                    node_id: m["id"]
                        .as_str()
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("message-{}", i + 1)),
                    parent: None,
                    speaker: role.into(),
                    text: content(m)?,
                    timestamp: stamp(
                        m.get("timestamp")
                            .or(m.get("create_time"))
                            .unwrap_or(&Value::Null),
                    ),
                    raw: m.to_string(),
                })
            }
        } else {
            return Err("Unrecognized JSON conversation format. Use ChatGPT conversations.json, a conversation with a messages array, or an array of role/content messages.".into());
        }
    }
    if out.is_empty() {
        return Err("No conversation messages were recognized".into());
    }
    Ok(out)
}
impl Store {
    pub fn commit_import(&mut self, project: &str, p: PreparedImport) -> Result<Value> {
        let result = (|| -> Result<Value> {
            let tx = self.conn.transaction()?;
            tx.execute("INSERT INTO sources(id,project_id,name,kind,original_path,created_at,warning) VALUES(?,?,?,?,?,?,?)",params![p.source_id,project,p.name,p.kind,p.relative,now(),p.warning])?;
            {
                let mut stmt = tx.prepare(
                    "INSERT INTO passages(source_id,project_id,location,text) VALUES(?,?,?,?)",
                )?;
                for passage in &p.passages {
                    stmt.execute(params![
                        p.source_id,
                        project,
                        passage.location,
                        passage.text
                    ])?;
                }
            }
            {
                let mut stmt = tx.prepare("INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?,?)")?;
                for (i, m) in p.messages.iter().enumerate() {
                    stmt.execute(params![
                        id(),
                        p.source_id,
                        m.conversation_id,
                        m.title,
                        m.node_id,
                        m.parent,
                        i as i64,
                        m.speaker,
                        m.text,
                        m.timestamp,
                        m.raw
                    ])?;
                }
            }
            tx.commit()?;
            Ok(
                json!({"id":p.source_id,"passages":p.passages.len(),"messages":p.messages.len(),"warning":p.warning}),
            )
        })();
        if result.is_err() {
            let _ = fs::remove_file(p.original);
        }
        result
    }
}
