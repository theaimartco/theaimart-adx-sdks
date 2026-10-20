using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    /// <summary>
    /// CONTRACT.md §9c — the render gate. A fill this surface cannot draw is NOT an impression,
    /// so it must never arm the viewability beacon.
    /// </summary>
    public class RenderTests
    {
        private static Ad ImageAd(string assetUrl)
        {
            string body =
                "{\"fill\":true,\"imp_id\":\"imp1\",\"creative\":{\"asset_url\":\"" + assetUrl +
                "\",\"click_url\":\"https://x/c\",\"width\":300,\"height\":250}}";
            return Ad.FromJson(200, body);
        }

        private const string HtmlBody =
            "{\"fill\":true,\"source\":\"openrtb\",\"imp_id\":\"imp1\"," +
            "\"creative\":{\"html\":\"<b>ad</b>\",\"width\":300,\"height\":250}}";

        [Test]
        public void NoFillAndTransportErrors_AreNeverRenderable()
        {
            Assert.AreEqual(RenderPlan.None, AdxRender.Plan(Ad.FromJson(200, "{\"fill\":false}"), true));
            Assert.AreEqual(RenderPlan.None, AdxRender.Plan(Ad.FromJson(0, ""), true));
            Assert.AreEqual(RenderPlan.None, AdxRender.Plan(null, true));
        }

        [Test]
        public void OrdinaryImageCreative_Renders()
        {
            Assert.AreEqual(RenderPlan.Image, AdxRender.Plan(ImageAd("https://cdn/x.png"), false));
            Assert.AreEqual(RenderPlan.Image, AdxRender.Plan(ImageAd("http://cdn/x.png"), false));
        }

        [Test]
        public void HostileAssetUrl_IsDropped()
        {
            string[] hostile =
            {
                "javascript:alert(1)", "file:///etc/passwd", "data:image/png;base64,AAAA", "intent://x",
            };
            foreach (string url in hostile)
            {
                Assert.AreEqual(RenderPlan.None, AdxRender.Plan(ImageAd(url), true), url);
            }
        }

        [Test]
        public void OpenRtbFill_RendersOnlyWhereAWebViewExists()
        {
            Assert.AreEqual(RenderPlan.Html, AdxRender.Plan(Ad.FromJson(200, HtmlBody), true));
            // This is the bug the Unity banner shipped: with no WebView the ad was never drawn,
            // yet a viewability beacon fired for it. It is not an impression.
            Assert.AreEqual(RenderPlan.None, AdxRender.Plan(Ad.FromJson(200, HtmlBody), false));
        }

        [Test]
        public void HouseAd_RendersButIsNotTrackable()
        {
            const string body =
                "{\"fill\":true,\"source\":\"house\",\"creative\":{\"asset_url\":\"https://cdn/h.png\"," +
                "\"click_url\":\"https://adv/x\",\"width\":300,\"height\":250}}";
            Ad house = Ad.FromJson(200, body);
            Assert.AreEqual(RenderPlan.Image, AdxRender.Plan(house, true));
            Assert.IsFalse(house.IsTrackable);
        }
    }
}
