//! Development-only browser integration harness. Never bundled in NOEMA.
use noema_core::Store;
use serde_json::{json, Value};
use tiny_http::{Header, Response, Server};
fn main() {
    let root = std::env::var("NOEMA_TEST_DATA")
        .expect("Set NOEMA_TEST_DATA to an isolated test directory");
    let mut store = Store::open(root).unwrap();
    let server = Server::http("127.0.0.1:4318").unwrap();
    for mut req in server.incoming_requests() {
        let headers = [
            Header::from_bytes("Access-Control-Allow-Origin", "http://127.0.0.1:1420").unwrap(),
            Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap(),
            Header::from_bytes("Content-Type", "application/json").unwrap(),
        ];
        if req.url() == "/health" || req.method().as_str() == "OPTIONS" {
            let mut resp = Response::from_string("");
            for h in headers {
                resp.add_header(h)
            }
            let _ = req.respond(resp);
            continue;
        }
        let mut body = String::new();
        req.as_reader().read_to_string(&mut body).unwrap();
        let result = (|| -> noema_core::Result<Value> {
            let v: Value = serde_json::from_str(&body)?;
            let action = v["action"].as_str().ok_or("action missing")?;
            let args = v["args"].clone();
            if action == "import" {
                let p = noema_core::import::prepare(
                    &store.root,
                    std::path::Path::new(args["path"].as_str().ok_or("path missing")?),
                )?;
                store.commit_import(args["project_id"].as_str().ok_or("project missing")?, p)
            } else {
                store.request(action, args)
            }
        })();
        let (status, value) = match result {
            Ok(v) => (200, v),
            Err(e) => (400, json!({"error":e.to_string()})),
        };
        let mut resp = Response::from_string(value.to_string()).with_status_code(status);
        for h in headers {
            resp.add_header(h)
        }
        let _ = req.respond(resp);
    }
}
