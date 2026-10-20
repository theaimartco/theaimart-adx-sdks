use theaimart_adx::{
    build_serve_query, percent_encode_all, raw_query_is_waf_safe, SQL_INJECTION_KEYWORDS,
};

const NASTY: &str = "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com\
&sel=select a table; drop-- update union open cast 1=1";

#[test]
fn percent_encode_all_is_uppercase_hex() {
    assert_eq!(percent_encode_all("aZ0"), "%61%5A%30");
    assert_eq!(percent_encode_all("a@ =é"), "%61%40%20%3D%C3%A9");
}

#[test]
fn build_query_skips_none() {
    let q = build_serve_query(&[
        ("api_key", Some("pk")),
        ("slot_id", None),
        ("page_url", Some("x")),
    ]);
    assert!(q.contains("api_key="));
    assert!(!q.contains("slot_id="));
    assert!(q.contains("page_url="));
}

#[test]
fn built_query_is_waf_safe_for_hostile_input() {
    let q = build_serve_query(&[
        ("api_key", Some("pk_live")),
        ("slot_id", Some("11111111-2222-3333-4444-555555555555")),
        ("page_url", Some(NASTY)),
        ("page_keywords", Some("select,table,update,cast,end,open")),
    ]);
    let lowered = q.to_lowercase();
    let offenders: Vec<&&str> = SQL_INJECTION_KEYWORDS
        .iter()
        .filter(|kw| lowered.contains(**kw))
        .collect();
    assert!(offenders.is_empty(), "built query leaks WAF keywords: {:?}", offenders);
    assert!(raw_query_is_waf_safe(&q));
}
