//! HTTP transport abstraction. The default [`UreqTransport`] (behind the `ureq` feature) uses
//! blocking `ureq`; implement [`HttpTransport`] yourself to use `reqwest`, a mock, etc.

use std::time::Duration;

/// A minimal HTTP response.
#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    /// Case-insensitive header lookup.
    pub fn header(&self, name: &str) -> Option<&str> {
        let lname = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| k.to_ascii_lowercase() == lname)
            .map(|(_, v)| v.as_str())
    }
}

/// A network-level transport failure (connection, DNS, timeout). HTTP error *statuses* are NOT
/// errors — they are returned as an [`HttpResponse`] so the client can treat 403/429 as no-fill.
#[derive(Debug)]
pub struct TransportError(pub String);

impl std::fmt::Display for TransportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "transport error: {}", self.0)
    }
}

impl std::error::Error for TransportError {}

/// Pluggable HTTP transport used by [`crate::Adx`].
pub trait HttpTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError>;

    fn post(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        body: &[u8],
        timeout: Duration,
    ) -> Result<HttpResponse, TransportError>;
}

#[cfg(feature = "ureq")]
mod ureq_impl {
    use super::{HttpResponse, HttpTransport, TransportError};
    use std::io::Read;
    use std::time::Duration;

    /// Default blocking transport built on `ureq`. The request URL is sent verbatim, so the fully
    /// percent-encoded (WAF-safe) query reaches the server intact.
    #[derive(Debug, Default, Clone)]
    pub struct UreqTransport;

    impl UreqTransport {
        pub fn new() -> Self {
            UreqTransport
        }
    }

    /// One shared agent (connection pooling across requests) that never follows a redirect: no
    /// serve endpoint redirects, and following one would replay the `Cookie` to another host.
    fn agent() -> &'static ureq::Agent {
        static AGENT: std::sync::OnceLock<ureq::Agent> = std::sync::OnceLock::new();
        AGENT.get_or_init(|| ureq::AgentBuilder::new().redirects(0).build())
    }

    fn collect(resp: ureq::Response) -> HttpResponse {
        let status = resp.status();
        let headers: Vec<(String, String)> = resp
            .headers_names()
            .into_iter()
            .filter_map(|name| resp.header(&name).map(|v| (name.clone(), v.to_string())))
            .collect();
        // Bounded read (CONTRACT.md §12): a misbehaving upstream cannot exhaust memory. An
        // over-long body is cut, which makes it unparseable, which makes it a no-fill.
        let mut body = Vec::new();
        let _ = resp
            .into_reader()
            .take(crate::guard::MAX_RESPONSE_BYTES + 1)
            .read_to_end(&mut body);
        if body.len() as u64 > crate::guard::MAX_RESPONSE_BYTES {
            body.clear();
        }
        HttpResponse { status, headers, body }
    }

    impl HttpTransport for UreqTransport {
        fn get(
            &self,
            url: &str,
            headers: &[(&str, &str)],
            timeout: Duration,
        ) -> Result<HttpResponse, TransportError> {
            let mut req = agent().get(url).timeout(timeout);
            for (k, v) in headers {
                req = req.set(k, v);
            }
            match req.call() {
                Ok(resp) => Ok(collect(resp)),
                Err(ureq::Error::Status(_, resp)) => Ok(collect(resp)),
                Err(e) => Err(TransportError(e.to_string())),
            }
        }

        fn post(
            &self,
            url: &str,
            headers: &[(&str, &str)],
            body: &[u8],
            timeout: Duration,
        ) -> Result<HttpResponse, TransportError> {
            let mut req = agent().post(url).timeout(timeout);
            for (k, v) in headers {
                req = req.set(k, v);
            }
            match req.send_bytes(body) {
                Ok(resp) => Ok(collect(resp)),
                Err(ureq::Error::Status(_, resp)) => Ok(collect(resp)),
                Err(e) => Err(TransportError(e.to_string())),
            }
        }
    }
}

#[cfg(feature = "ureq")]
pub use ureq_impl::UreqTransport;
