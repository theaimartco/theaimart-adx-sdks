import 'dart:convert';

/// Which demand source filled the request. `internal` when the response carries no `source`.
enum AdSource { internal, openrtb, house }

/// How to render the ad.
enum AdKind { noFill, image, html }

class Auction {
  final String? type;
  final int? clearingPricePaise;
  final double? qualityScore;
  final double? effectiveBid;
  final int? winnerBidPaise;
  final int? winnerEcpmPaise;

  const Auction({
    this.type,
    this.clearingPricePaise,
    this.qualityScore,
    this.effectiveBid,
    this.winnerBidPaise,
    this.winnerEcpmPaise,
  });
}

class Creative {
  final int width;
  final int height;
  final String? assetUrl;
  final String? clickUrl;
  final String? html;
  final String? headline;
  final String? description;
  final String? id;
  final String? campaignId;

  const Creative({
    this.width = 300,
    this.height = 250,
    this.assetUrl,
    this.clickUrl,
    this.html,
    this.headline,
    this.description,
    this.id,
    this.campaignId,
  });
}

/// A normalized ad decision. An unfillable/errored request yields [filled] == false (fail-closed).
class Ad {
  final bool filled;
  final AdKind kind;
  final AdSource source;
  final int httpStatus;
  final String? impId;
  final String? identityId;
  final String? dsp;
  final String? reason;
  final Creative? creative;
  final Auction? auction;
  final int? retryAfterSeconds;
  final String? setIdentityCookie;

  const Ad({
    required this.filled,
    required this.kind,
    required this.source,
    required this.httpStatus,
    this.impId,
    this.identityId,
    this.dsp,
    this.reason,
    this.creative,
    this.auction,
    this.retryAfterSeconds,
    this.setIdentityCookie,
  });

  /// True iff a viewability beacon can be fired (an [impId] is present).
  bool get isTrackable => impId != null;

  factory Ad.noFill(
    int httpStatus, {
    String? reason,
    int? retryAfterSeconds,
    String? setIdentityCookie,
  }) =>
      Ad(
        filled: false,
        kind: AdKind.noFill,
        source: AdSource.internal,
        httpStatus: httpStatus,
        reason: reason,
        retryAfterSeconds: retryAfterSeconds,
        setIdentityCookie: setIdentityCookie,
      );

  /// Parse an HTTP status + JSON body into a normalized [Ad]. Fail-closed: any non-200 status,
  /// unparseable body, or `fill != true` becomes a no-fill (CONTRACT.md §4).
  factory Ad.fromResponse(
    int httpStatus,
    String? body, {
    int? retryAfterSeconds,
    String? setIdentityCookie,
  }) {
    final json = _parseObject(body);
    if (httpStatus != 200 || json == null) {
      return Ad.noFill(
        httpStatus,
        reason: json != null ? json['reason'] as String? : null,
        retryAfterSeconds: retryAfterSeconds,
        setIdentityCookie: setIdentityCookie,
      );
    }
    if (json['fill'] != true) {
      return Ad.noFill(
        httpStatus,
        reason: json['reason'] as String?,
        retryAfterSeconds: retryAfterSeconds,
        setIdentityCookie: setIdentityCookie,
      );
    }

    final creativeJson = json['creative'] is Map
        ? json['creative'] as Map<String, dynamic>
        : <String, dynamic>{};
    final html = creativeJson['html'] as String?;
    final sourceField = json['source'] as String?;

    final AdKind kind;
    final AdSource source;
    if (html != null) {
      kind = AdKind.html;
      source = AdSource.openrtb;
    } else if (sourceField == 'house') {
      kind = AdKind.image;
      source = AdSource.house;
    } else {
      kind = AdKind.image;
      source = AdSource.internal;
    }

    return Ad(
      filled: true,
      kind: kind,
      source: source,
      httpStatus: httpStatus,
      impId: json['imp_id'] as String?,
      identityId: json['identity_id'] as String?,
      dsp: json['dsp'] as String?,
      creative: _toCreative(creativeJson),
      auction: json['auction'] is Map
          ? _toAuction(json['auction'] as Map<String, dynamic>)
          : null,
      retryAfterSeconds: retryAfterSeconds,
      setIdentityCookie: setIdentityCookie,
    );
  }

  static Map<String, dynamic>? _parseObject(String? body) {
    if (body == null || body.isEmpty) return null;
    try {
      final decoded = jsonDecode(body);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  static Creative _toCreative(Map<String, dynamic> o) => Creative(
        width: _asInt(o['width']) ?? 300,
        height: _asInt(o['height']) ?? 250,
        assetUrl: o['asset_url'] as String?,
        clickUrl: o['click_url'] as String?,
        html: o['html'] as String?,
        headline: o['headline'] as String?,
        description: o['description'] as String?,
        id: o['id'] as String?,
        campaignId: o['campaign_id'] as String?,
      );

  static Auction _toAuction(Map<String, dynamic> o) => Auction(
        type: o['type'] as String?,
        clearingPricePaise: _asInt(o['clearing_price_paise']),
        qualityScore: _asDouble(o['quality_score']),
        effectiveBid: _asDouble(o['effective_bid']),
        winnerBidPaise: _asInt(o['winner_bid_paise']),
        winnerEcpmPaise: _asInt(o['winner_ecpm_paise']),
      );

  static int? _asInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  static double? _asDouble(dynamic v) {
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }
}
