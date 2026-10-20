//! Normalized ad model — parses the backend's 4-way discriminated union (CONTRACT.md §4).

use serde_json::{Map, Value};

/// Which demand source filled the request. `Internal` when the response carries no `source` field.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdSource {
    Internal,
    OpenRtb,
    House,
}

/// How to render the ad.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdKind {
    NoFill,
    Image,
    Html,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Auction {
    pub auction_type: Option<String>,
    pub clearing_price_paise: Option<i64>,
    pub quality_score: Option<f64>,
    pub effective_bid: Option<f64>,
    pub winner_bid_paise: Option<i64>,
    pub winner_ecpm_paise: Option<i64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Creative {
    pub width: i64,
    pub height: i64,
    pub asset_url: Option<String>,
    pub click_url: Option<String>,
    pub html: Option<String>,
    pub headline: Option<String>,
    pub description: Option<String>,
    pub id: Option<String>,
    pub campaign_id: Option<String>,
}

impl Default for Creative {
    fn default() -> Self {
        Creative {
            width: 300,
            height: 250,
            asset_url: None,
            click_url: None,
            html: None,
            headline: None,
            description: None,
            id: None,
            campaign_id: None,
        }
    }
}

/// A normalized ad decision. An unfillable/errored request yields `filled == false` (fail-closed).
#[derive(Debug, Clone, PartialEq)]
pub struct Ad {
    pub filled: bool,
    pub kind: AdKind,
    pub source: AdSource,
    pub http_status: u16,
    pub imp_id: Option<String>,
    pub identity_id: Option<String>,
    pub dsp: Option<String>,
    pub reason: Option<String>,
    pub creative: Option<Creative>,
    pub auction: Option<Auction>,
    pub retry_after_seconds: Option<u32>,
    pub set_identity_cookie: Option<String>,
}

impl Ad {
    /// True iff a viewability beacon can be fired (an `imp_id` is present).
    pub fn is_trackable(&self) -> bool {
        self.imp_id.is_some()
    }

    pub fn no_fill(
        http_status: u16,
        reason: Option<String>,
        retry_after_seconds: Option<u32>,
        set_identity_cookie: Option<String>,
    ) -> Ad {
        Ad {
            filled: false,
            kind: AdKind::NoFill,
            source: AdSource::Internal,
            http_status,
            imp_id: None,
            identity_id: None,
            dsp: None,
            reason,
            creative: None,
            auction: None,
            retry_after_seconds,
            set_identity_cookie,
        }
    }

    /// Parse an HTTP status + JSON body into a normalized [`Ad`]. Fail-closed: any non-200 status,
    /// unparseable body, or `fill != true` becomes a no-fill. Parse order matches CONTRACT.md §4:
    /// fill? → html? → source=="house"? → internal.
    pub fn from_response(
        http_status: u16,
        body: &[u8],
        retry_after_seconds: Option<u32>,
        set_identity_cookie: Option<String>,
    ) -> Ad {
        let value: Option<Value> = serde_json::from_slice(body).ok();
        let obj: Option<&Map<String, Value>> = value.as_ref().and_then(Value::as_object);

        let obj = match obj {
            Some(map) if http_status == 200 => map,
            other => {
                let reason = other.and_then(|m| get_str(m, "reason"));
                return Ad::no_fill(http_status, reason, retry_after_seconds, set_identity_cookie);
            }
        };

        if obj.get("fill").and_then(Value::as_bool) != Some(true) {
            return Ad::no_fill(
                http_status,
                get_str(obj, "reason"),
                retry_after_seconds,
                set_identity_cookie,
            );
        }

        let creative_obj = obj.get("creative").and_then(Value::as_object);
        let html = creative_obj.and_then(|c| get_str(c, "html"));
        let source_field = obj.get("source").and_then(Value::as_str);

        let (kind, source) = if html.is_some() {
            (AdKind::Html, AdSource::OpenRtb)
        } else if source_field == Some("house") {
            (AdKind::Image, AdSource::House)
        } else {
            (AdKind::Image, AdSource::Internal)
        };

        Ad {
            filled: true,
            kind,
            source,
            http_status,
            imp_id: get_str(obj, "imp_id"),
            identity_id: get_str(obj, "identity_id"),
            dsp: get_str(obj, "dsp"),
            reason: None,
            creative: Some(parse_creative(creative_obj)),
            auction: obj.get("auction").and_then(Value::as_object).map(parse_auction),
            retry_after_seconds,
            set_identity_cookie,
        }
    }
}

fn parse_creative(obj: Option<&Map<String, Value>>) -> Creative {
    let map = match obj {
        Some(m) => m,
        None => return Creative::default(),
    };
    Creative {
        width: get_i64(map, "width").unwrap_or(300),
        height: get_i64(map, "height").unwrap_or(250),
        asset_url: get_str(map, "asset_url"),
        click_url: get_str(map, "click_url"),
        html: get_str(map, "html"),
        headline: get_str(map, "headline"),
        description: get_str(map, "description"),
        id: get_str(map, "id"),
        campaign_id: get_str(map, "campaign_id"),
    }
}

fn parse_auction(map: &Map<String, Value>) -> Auction {
    Auction {
        auction_type: get_str(map, "type"),
        clearing_price_paise: get_i64(map, "clearing_price_paise"),
        quality_score: get_f64(map, "quality_score"),
        effective_bid: get_f64(map, "effective_bid"),
        winner_bid_paise: get_i64(map, "winner_bid_paise"),
        winner_ecpm_paise: get_i64(map, "winner_ecpm_paise"),
    }
}

fn get_str(map: &Map<String, Value>, key: &str) -> Option<String> {
    map.get(key).and_then(Value::as_str).map(String::from)
}

fn get_i64(map: &Map<String, Value>, key: &str) -> Option<i64> {
    let v = map.get(key)?;
    v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))
}

fn get_f64(map: &Map<String, Value>, key: &str) -> Option<f64> {
    map.get(key).and_then(Value::as_f64)
}
