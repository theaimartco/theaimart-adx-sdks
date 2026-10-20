import Foundation

/// Which demand source filled the request. `.internal` when the response carries no `source`.
public enum AdSource: String {
    case `internal`
    case openrtb
    case house
}

/// How to render the ad.
public enum AdKind {
    case noFill
    case image
    case html
}

public struct Auction {
    public let type: String?
    public let clearingPricePaise: Int?
    public let qualityScore: Double?
    public let effectiveBid: Double?
    public let winnerBidPaise: Int?
    public let winnerEcpmPaise: Int?
}

public struct Creative {
    public let width: Int
    public let height: Int
    public let assetURL: String?
    public let clickURL: String?
    public let html: String?
    public let headline: String?
    public let description: String?
    public let id: String?
    public let campaignID: String?
}

/// A normalized ad decision. An unfillable/errored request yields `filled == false` (fail-closed).
public struct Ad {
    public let filled: Bool
    public let kind: AdKind
    public let source: AdSource
    public let httpStatus: Int
    public let impID: String?
    public let identityID: String?
    public let dsp: String?
    public let reason: String?
    public let creative: Creative?
    public let auction: Auction?
    public let retryAfterSeconds: Int?
    public let setIdentityCookie: String?

    /// True iff a viewability beacon can be fired (an `impID` is present).
    public var isTrackable: Bool { impID != nil }

    static func noFill(
        httpStatus: Int,
        reason: String? = nil,
        retryAfterSeconds: Int? = nil,
        setIdentityCookie: String? = nil
    ) -> Ad {
        Ad(
            filled: false, kind: .noFill, source: .internal, httpStatus: httpStatus,
            impID: nil, identityID: nil, dsp: nil, reason: reason, creative: nil,
            auction: nil, retryAfterSeconds: retryAfterSeconds, setIdentityCookie: setIdentityCookie
        )
    }

    /// Parse an HTTP status + JSON body into a normalized `Ad`. Fail-closed: any non-200 status,
    /// unparseable body, or `fill != true` becomes a no-fill (CONTRACT.md §4).
    static func fromJSON(
        httpStatus: Int,
        data: Data?,
        retryAfterSeconds: Int? = nil,
        setIdentityCookie: String? = nil
    ) -> Ad {
        let object = parseObject(data)
        guard httpStatus == 200, let json = object else {
            return noFill(
                httpStatus: httpStatus,
                reason: object?["reason"] as? String,
                retryAfterSeconds: retryAfterSeconds,
                setIdentityCookie: setIdentityCookie
            )
        }
        guard (json["fill"] as? Bool) == true else {
            return noFill(
                httpStatus: httpStatus,
                reason: json["reason"] as? String,
                retryAfterSeconds: retryAfterSeconds,
                setIdentityCookie: setIdentityCookie
            )
        }

        let creativeJSON = json["creative"] as? [String: Any] ?? [:]
        let html = creativeJSON["html"] as? String
        let sourceField = json["source"] as? String

        let kind: AdKind
        let source: AdSource
        if html != nil {
            kind = .html; source = .openrtb
        } else if sourceField == "house" {
            kind = .image; source = .house
        } else {
            kind = .image; source = .internal
        }

        return Ad(
            filled: true,
            kind: kind,
            source: source,
            httpStatus: httpStatus,
            impID: json["imp_id"] as? String,
            identityID: json["identity_id"] as? String,
            dsp: json["dsp"] as? String,
            reason: nil,
            creative: toCreative(creativeJSON),
            auction: (json["auction"] as? [String: Any]).map(toAuction),
            retryAfterSeconds: retryAfterSeconds,
            setIdentityCookie: setIdentityCookie
        )
    }

    private static func parseObject(_ data: Data?) -> [String: Any]? {
        guard let data = data, !data.isEmpty else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private static func toCreative(_ o: [String: Any]) -> Creative {
        Creative(
            width: intValue(o["width"]) ?? 300,
            height: intValue(o["height"]) ?? 250,
            assetURL: o["asset_url"] as? String,
            clickURL: o["click_url"] as? String,
            html: o["html"] as? String,
            headline: o["headline"] as? String,
            description: o["description"] as? String,
            id: o["id"] as? String,
            campaignID: o["campaign_id"] as? String
        )
    }

    private static func toAuction(_ o: [String: Any]) -> Auction {
        Auction(
            type: o["type"] as? String,
            clearingPricePaise: intValue(o["clearing_price_paise"]),
            qualityScore: doubleValue(o["quality_score"]),
            effectiveBid: doubleValue(o["effective_bid"]),
            winnerBidPaise: intValue(o["winner_bid_paise"]),
            winnerEcpmPaise: intValue(o["winner_ecpm_paise"])
        )
    }

    private static func intValue(_ any: Any?) -> Int? {
        if let n = any as? Int { return n }
        if let d = any as? Double { return Int(d) }
        if let s = any as? String { return Int(s) }
        return nil
    }

    private static func doubleValue(_ any: Any?) -> Double? {
        if let d = any as? Double { return d }
        if let n = any as? Int { return Double(n) }
        if let s = any as? String { return Double(s) }
        return nil
    }
}
