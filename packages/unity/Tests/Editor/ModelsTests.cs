using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    public class ModelsTests
    {
        [Test]
        public void ParsesInternalFill_NoSourceField()
        {
            const string body =
                "{\"fill\":true,\"imp_id\":\"imp1\",\"identity_id\":\"id1\"," +
                "\"auction\":{\"type\":\"second_price\",\"clearing_price_paise\":120,\"quality_score\":0.83}," +
                "\"creative\":{\"asset_url\":\"https://cdn/x.png\",\"click_url\":\"c\",\"headline\":\"Hi\",\"width\":300,\"height\":250}}";
            Ad ad = Ad.FromJson(200, body);
            Assert.IsTrue(ad.Filled);
            Assert.AreEqual(AdKind.Image, ad.Kind);
            Assert.AreEqual(AdSource.Internal, ad.Source);
            Assert.AreEqual("imp1", ad.ImpId);
            Assert.IsTrue(ad.IsTrackable);
            Assert.AreEqual("https://cdn/x.png", ad.Creative.AssetUrl);
            Assert.AreEqual(120, ad.Auction.ClearingPricePaise);
        }

        [Test]
        public void ParsesOpenRtbHtmlFill()
        {
            const string body = "{\"fill\":true,\"source\":\"openrtb\",\"imp_id\":\"i\",\"dsp\":\"DSP\",\"creative\":{\"html\":\"<div>ad</div>\",\"width\":320,\"height\":50}}";
            Ad ad = Ad.FromJson(200, body);
            Assert.AreEqual(AdKind.Html, ad.Kind);
            Assert.AreEqual(AdSource.OpenRtb, ad.Source);
            Assert.AreEqual("DSP", ad.Dsp);
            Assert.AreEqual("<div>ad</div>", ad.Creative.Html);
        }

        [Test]
        public void ParsesHouseFill_NotTrackable()
        {
            const string body = "{\"fill\":true,\"source\":\"house\",\"creative\":{\"asset_url\":\"https://cdn/h.png\",\"click_url\":\"https://adv/landing\",\"width\":300,\"height\":250}}";
            Ad ad = Ad.FromJson(200, body);
            Assert.AreEqual(AdSource.House, ad.Source);
            Assert.AreEqual(AdKind.Image, ad.Kind);
            Assert.IsNull(ad.ImpId);
            Assert.IsFalse(ad.IsTrackable);
        }

        [Test]
        public void NoFillAndErrorVariants()
        {
            Assert.IsFalse(Ad.FromJson(200, "{\"fill\":false}").Filled);
            Assert.AreEqual("fraud_rejected", Ad.FromJson(200, "{\"fill\":false,\"reason\":\"fraud_rejected\"}").Reason);
            Assert.AreEqual(60, Ad.FromJson(429, "{\"fill\":false}", 60).RetryAfterSeconds);
            Assert.IsFalse(Ad.FromJson(400, "not json").Filled);
            Assert.IsFalse(Ad.FromJson(200, null).Filled);
        }

        [Test]
        public void CreativeDimensionsDefault()
        {
            Ad ad = Ad.FromJson(200, "{\"fill\":true,\"creative\":{\"asset_url\":\"x\",\"click_url\":\"y\"}}");
            Assert.AreEqual(300, ad.Creative.Width);
            Assert.AreEqual(250, ad.Creative.Height);
        }

        [Test]
        public void ExtractIdentityCookie()
        {
            Assert.AreEqual("abc123", Adx.ExtractIdentityCookie("_an_id=abc123; Path=/; HttpOnly"));
            Assert.IsNull(Adx.ExtractIdentityCookie(null));
        }

        [Test]
        public void IsSafeHttpUrl_Allowlist()
        {
            Assert.IsTrue(Adx.IsSafeHttpUrl("https://x.example/a"));
            Assert.IsTrue(Adx.IsSafeHttpUrl("http://x.example"));
            Assert.IsFalse(Adx.IsSafeHttpUrl("javascript:alert(1)"));
            Assert.IsFalse(Adx.IsSafeHttpUrl("file:///etc/passwd"));
            Assert.IsFalse(Adx.IsSafeHttpUrl(null));
        }
    }
}
