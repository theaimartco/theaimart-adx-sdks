//! End-to-end test against a std::net mock server that reproduces the backend WAF, driven by the
//! real UreqTransport. Proves the SDK's full byte-encoding slips a hostile page_url past the WAF
//! (and roundtrips it), while a naive raw request is blocked.
#![cfg(feature = "ureq")]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;

use theaimart_adx::{AdKind, AdRequest, Adx, SQL_INJECTION_KEYWORDS};

fn waf_blocks(query: &str) -> bool {
    let lowered = query.to_lowercase();
    SQL_INJECTION_KEYWORDS.iter().any(|kw| lowered.contains(kw))
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn http_response(status: u16, body: &str, set_cookie: Option<&str>) -> String {
    let reason = match status {
        200 => "OK",
        403 => "Forbidden",
        _ => "Not Found",
    };
    let cookie = set_cookie.map(|c| format!("Set-Cookie: {}\r\n", c)).unwrap_or_default();
    format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n{}",
        status, reason, body.len(), cookie, body
    )
}

const FILL_BODY: &str = r#"{"fill":true,"imp_id":"imp-e2e","identity_id":"id","creative":{"asset_url":"https://cdn/x.png","click_url":"https://api.adx.theaimart.co/api/v1/serve/click?id=imp-e2e","headline":"Hi","width":300,"height":250}}"#;

fn handle(mut stream: TcpStream, captured: &Mutex<Vec<String>>, viewables: &Mutex<Vec<String>>) {
    let mut reader = BufReader::new(stream.try_clone().unwrap());
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let target = parts[1];

    let mut content_length = 0usize;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" || line == "\n" {
            break;
        }
        let low = line.to_lowercase();
        if let Some(rest) = low.strip_prefix("content-length:") {
            content_length = rest.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        let _ = reader.read_exact(&mut body);
    }

    let (path, query) = target.split_once('?').unwrap_or((target, ""));

    let response = if method == "GET" && waf_blocks(query) {
        http_response(403, r#"{"error":"Request blocked due to security policy"}"#, None)
    } else if method == "GET" && path == "/api/v1/serve/ad" {
        for kv in query.split('&') {
            if let Some((k, v)) = kv.split_once('=') {
                if k == "page_url" {
                    captured.lock().unwrap().push(percent_decode(v));
                }
            }
        }
        http_response(200, FILL_BODY, Some("_an_id=e2ecookie; Path=/"))
    } else if method == "POST" && path == "/api/v1/serve/viewable" {
        viewables.lock().unwrap().push(String::from_utf8_lossy(&body).into_owned());
        http_response(200, r#"{"success":true}"#, None)
    } else {
        http_response(404, "{}", None)
    };

    let _ = stream.write_all(response.as_bytes());
}

#[test]
fn end_to_end_waf_bypass_and_roundtrip() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let captured = Arc::new(Mutex::new(Vec::<String>::new()));
    let viewables = Arc::new(Mutex::new(Vec::<String>::new()));
    let cap = captured.clone();
    let vw = viewables.clone();

    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            handle(stream, &cap, &vw);
        }
    });

    let base = format!("http://{}", addr);
    let adx = Adx::new("pk_e2e").base_url(&base);

    let nasty = "https://shop.example.com/weekend/broadcast?u=a@b.com&q=select a table drop-- update union open cast";
    let ad = adx.request_ad(&AdRequest {
        slot_id: Some("6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a"),
        page_url: Some(nasty),
        ..Default::default()
    });
    assert!(ad.filled, "expected fill, got status {}", ad.http_status);
    assert_eq!(ad.kind, AdKind::Image);
    assert_eq!(ad.imp_id.as_deref(), Some("imp-e2e"));
    assert_eq!(ad.set_identity_cookie.as_deref(), Some("e2ecookie"));
    // Roundtrips intact — minus the email, which CONTRACT.md §12 keeps on the device.
    let expected = nasty.replace("u=a@b.com&", "");
    assert_eq!(captured.lock().unwrap().last(), Some(&expected));

    assert!(adx.report_viewable("imp-e2e"));
    assert!(viewables.lock().unwrap().iter().any(|b| b.contains("imp-e2e")));

    // Prove the mock WAF is faithful: a naive raw request with plaintext keywords is blocked.
    let mut raw = TcpStream::connect(addr).unwrap();
    write!(
        raw,
        "GET /api/v1/serve/ad?api_key=pk&page_url=select%20a%20table HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut resp = String::new();
    raw.read_to_string(&mut resp).unwrap();
    assert!(resp.starts_with("HTTP/1.1 403"), "naive request should be blocked: {}", resp);
}
