using System.Collections.Generic;

namespace Theaimart.Adx
{
    /// <summary>Which demand source filled the request. Internal when no `source` field is present.</summary>
    public enum AdSource { Internal, OpenRtb, House }

    /// <summary>How to render the ad.</summary>
    public enum AdKind { NoFill, Image, Html }

    public sealed class Auction
    {
        public string Type;
        public int? ClearingPricePaise;
        public double? QualityScore;
        public double? EffectiveBid;
        public int? WinnerBidPaise;
        public int? WinnerEcpmPaise;
    }

    public sealed class Creative
    {
        public int Width = 300;
        public int Height = 250;
        public string AssetUrl;
        public string ClickUrl;
        public string Html;
        public string Headline;
        public string Description;
        public string Id;
        public string CampaignId;
    }

    /// <summary>A normalized ad decision. Fail-closed: unfillable/errored requests set Filled=false.</summary>
    public sealed class Ad
    {
        public bool Filled;
        public AdKind Kind;
        public AdSource Source;
        public int HttpStatus;
        public string ImpId;
        public string IdentityId;
        public string Dsp;
        public string Reason;
        public Creative Creative;
        public Auction Auction;
        public int? RetryAfterSeconds;
        public string SetIdentityCookie;

        /// <summary>True iff a viewability beacon can be fired (an ImpId is present).</summary>
        public bool IsTrackable => ImpId != null;

        public static Ad NoFill(int httpStatus, string reason = null, int? retryAfterSeconds = null, string setIdentityCookie = null)
        {
            return new Ad
            {
                Filled = false,
                Kind = AdKind.NoFill,
                Source = AdSource.Internal,
                HttpStatus = httpStatus,
                Reason = reason,
                RetryAfterSeconds = retryAfterSeconds,
                SetIdentityCookie = setIdentityCookie,
            };
        }

        /// <summary>
        /// Parse an HTTP status + JSON body into a normalized Ad. Fail-closed: any non-200 status,
        /// unparseable body, or fill != true becomes a no-fill (CONTRACT.md §4).
        /// </summary>
        public static Ad FromJson(int httpStatus, string body, int? retryAfterSeconds = null, string setIdentityCookie = null)
        {
            var obj = Json.Parse(body) as Dictionary<string, object>;
            if (httpStatus != 200 || obj == null)
            {
                return NoFill(httpStatus, GetString(obj, "reason"), retryAfterSeconds, setIdentityCookie);
            }
            if (!(obj.TryGetValue("fill", out object fillValue) && fillValue is bool fill && fill))
            {
                return NoFill(httpStatus, GetString(obj, "reason"), retryAfterSeconds, setIdentityCookie);
            }

            Dictionary<string, object> creativeObj = GetDict(obj, "creative") ?? new Dictionary<string, object>();
            string html = GetString(creativeObj, "html");
            string sourceField = GetString(obj, "source");

            AdKind kind;
            AdSource source;
            if (html != null)
            {
                kind = AdKind.Html;
                source = AdSource.OpenRtb;
            }
            else if (sourceField == "house")
            {
                kind = AdKind.Image;
                source = AdSource.House;
            }
            else
            {
                kind = AdKind.Image;
                source = AdSource.Internal;
            }

            Dictionary<string, object> auctionObj = GetDict(obj, "auction");
            return new Ad
            {
                Filled = true,
                Kind = kind,
                Source = source,
                HttpStatus = httpStatus,
                ImpId = GetString(obj, "imp_id"),
                IdentityId = GetString(obj, "identity_id"),
                Dsp = GetString(obj, "dsp"),
                Creative = ToCreative(creativeObj),
                Auction = auctionObj != null ? ToAuction(auctionObj) : null,
                RetryAfterSeconds = retryAfterSeconds,
                SetIdentityCookie = setIdentityCookie,
            };
        }

        private static Creative ToCreative(Dictionary<string, object> o)
        {
            return new Creative
            {
                Width = GetInt(o, "width") ?? 300,
                Height = GetInt(o, "height") ?? 250,
                AssetUrl = GetString(o, "asset_url"),
                ClickUrl = GetString(o, "click_url"),
                Html = GetString(o, "html"),
                Headline = GetString(o, "headline"),
                Description = GetString(o, "description"),
                Id = GetString(o, "id"),
                CampaignId = GetString(o, "campaign_id"),
            };
        }

        private static Auction ToAuction(Dictionary<string, object> o)
        {
            return new Auction
            {
                Type = GetString(o, "type"),
                ClearingPricePaise = GetInt(o, "clearing_price_paise"),
                QualityScore = GetDouble(o, "quality_score"),
                EffectiveBid = GetDouble(o, "effective_bid"),
                WinnerBidPaise = GetInt(o, "winner_bid_paise"),
                WinnerEcpmPaise = GetInt(o, "winner_ecpm_paise"),
            };
        }

        private static string GetString(Dictionary<string, object> o, string key)
        {
            if (o != null && o.TryGetValue(key, out object v) && v is string s) return s;
            return null;
        }

        private static int? GetInt(Dictionary<string, object> o, string key)
        {
            if (o != null && o.TryGetValue(key, out object v))
            {
                if (v is double d) return (int)d;
                if (v is string s && int.TryParse(s, out int n)) return n;
            }
            return null;
        }

        private static double? GetDouble(Dictionary<string, object> o, string key)
        {
            if (o != null && o.TryGetValue(key, out object v))
            {
                if (v is double d) return d;
                if (v is string s && double.TryParse(s, out double n)) return n;
            }
            return null;
        }

        private static Dictionary<string, object> GetDict(Dictionary<string, object> o, string key)
        {
            if (o != null && o.TryGetValue(key, out object v)) return v as Dictionary<string, object>;
            return null;
        }
    }
}
