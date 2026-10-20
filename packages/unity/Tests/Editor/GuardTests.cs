using System.Collections.Generic;
using System.Text;
using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    /// <summary>Outbound request guard (CONTRACT.md §12). Same vectors as node/test/guard.test.ts.</summary>
    public class GuardTests
    {
        private const string Slot = "6f1c2a9e-3b4d-4c5e-8f7a-9b0c1d2e3f4a";

        [Test]
        public void PublishableKey()
        {
            foreach (var ok in new[] { "pk_x", "pk_0123456789abcdef0123456789abcdef", "pk_virgo_live-1" })
                Assert.IsTrue(AdxGuard.IsPublishableKey(ok), ok);
            foreach (var bad in new[] { "", "pk_", "sk_live_abc", "eyJhbGciOiJIUzI1NiJ9.e30.x", "pk_a b", "pk_a\n", "PK_x", "pk_" + new string('a', 98) })
                Assert.IsFalse(AdxGuard.IsPublishableKey(bad), bad);
        }

        [Test]
        public void BaseUrl()
        {
            Assert.AreEqual("https://api.adx.theaimart.co", AdxGuard.NormalizeBaseUrl("https://api.adx.theaimart.co/"));
            Assert.AreEqual("https://h:8443/prefix", AdxGuard.NormalizeBaseUrl("  https://h:8443/prefix// "));
            foreach (var local in new[] { "http://localhost:8080", "http://127.0.0.1:9", "http://10.0.2.2:8080", "http://192.168.1.5", "http://172.20.0.1", "http://[::1]:80", "http://dev.localhost" })
                Assert.AreEqual(local, AdxGuard.NormalizeBaseUrl(local), local);
            foreach (var bad in new[]
            {
                "http://api.adx.theaimart.co", "http://10.evil.com", "http://172.32.0.1",
                "https://user:pw@api.adx.theaimart.co", "https://api.adx.theaimart.co@evil.com",
                "https://h/?x=1", "https://h/#f", "https://h\\@evil.com", "https://h /x", "ftp://h",
                "javascript:alert(1)", "https://",
            })
                Assert.IsNull(AdxGuard.NormalizeBaseUrl(bad), bad);
        }

        [Test]
        public void ImpIdAndIdentity()
        {
            Assert.IsTrue(AdxGuard.IsSafeImpId("1751600000000_550e8400-e29b-41d4-a716-446655440000"));
            foreach (var bad in new[] { "", "a b", "x\"}", "a\r\nb", new string('a', 129), null })
                Assert.IsFalse(AdxGuard.IsSafeImpId(bad), bad ?? "null");
            Assert.IsTrue(AdxGuard.IsSafeIdentityCookie("550e8400-e29b-41d4-a716-446655440000.SGVsbG8+/w=="));
            foreach (var bad in new[] { "", "a;b", "a b", "ok\r\nSet-Cookie: x", "a,b", new string('a', 513) })
                Assert.IsFalse(AdxGuard.IsSafeIdentityCookie(bad), bad);
        }

        [Test]
        public void PageUrl()
        {
            var cases = new Dictionary<string, string>
            {
                { "https://site.com/a/b?q=shoes#access_token=abc", "https://site.com/a/b?q=shoes" },
                { "https://user:pw@site.com/x", "https://site.com/x" },
                { "https://site.com/cb?code=abc&state=xyz&page=2", "https://site.com/cb?page=2" },
                { "https://site.com/?Token=1&id_token=2&sessionId=3&X-Api-Key=4&utm_source=nl", "https://site.com/?utm_source=nl" },
                { "https://site.com/?u=alice@example.com&v=bob%40example.com&w=1", "https://site.com/?w=1" },
                { "https://site.com/@handle/post?ref=home", "https://site.com/@handle/post?ref=home" },
                { "https://site.com/x?password=hunter2", "https://site.com/x" },
                { "https://site.com/x?&&a=1&&", "https://site.com/x?a=1" },
                { "app://screen/home", "app://screen/home" },
                { "/settings/profile?email=a@b.c", "/settings/profile" },
                { "  \u0000https://site.com/\r\n  ", "https://site.com/" },
                { "https://site.com/reset/9f86d081884c7d659a2feaa0c55ad015/confirm", "https://site.com/reset/*/confirm" },
                { "https://site.com/m/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln", "https://site.com/m/*" },
                { "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026", "https://site.com/blog/how-to-build-a-rest-api-in-rust-2026" },
                { "https://site.com/p/550e8400-e29b-41d4-a716-446655440000", "https://site.com/p/550e8400-e29b-41d4-a716-446655440000" },
                { "https://site.com/?t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln&q=shoes", "https://site.com/?q=shoes" },
                { "https://site.com/?k=Zx81kQ2mT7vB4nR9sW3yL6pA&page=3", "https://site.com/?page=3" },
                { "https://site.com/?%74oken=abc&%41PI%2dKEY=x&q=1", "https://site.com/?q=1" },
                { "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high", "https://site.com/s?q=nike+air+max+270+review+2026&sort=price-low-to-high" },
                { "#only-a-fragment", null },
                { "", null },
            };
            foreach (var kv in cases) Assert.AreEqual(kv.Value, AdxGuard.SanitizePageUrl(kv.Key), kv.Key);
            string output = AdxGuard.SanitizePageUrl("https://site.com/" + new string('é', 5000));
            Assert.LessOrEqual(Encoding.UTF8.GetByteCount(output), AdxGuard.MaxPageUrlBytes);
            StringAssert.StartsWith("https://site.com/éé", output);
        }

        [Test]
        public void LooksLikeSecret()
        {
            foreach (var yes in new[] { "9f86d081884c7d659a2feaa0c55ad015", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2ln", "Zx81kQ2mT7vB4nR9sW3yL6pA", "sess_4f9a8b7c6d5e4f3a2b1c" })
                Assert.IsTrue(AdxGuard.LooksLikeSecret(yes), yes);
            foreach (var no in new[] { "how-to-build-a-rest-api-in-rust-2026", "550e8400-e29b-41d4-a716-446655440000", "nike+air+max+270+review+2026", "supercalifragilisticexpialidocious", "123456789012345678901234567890", "short1a", "" })
                Assert.IsFalse(AdxGuard.LooksLikeSecret(no), no);
        }

        [Test]
        public void TruncateUtf8NeverSplits()
        {
            const string s = "aé😀b";
            Assert.AreEqual("a", AdxGuard.TruncateUtf8(s, 1));
            Assert.AreEqual("a", AdxGuard.TruncateUtf8(s, 2));
            Assert.AreEqual("aé", AdxGuard.TruncateUtf8(s, 3));
            Assert.AreEqual("aé", AdxGuard.TruncateUtf8(s, 6));
            Assert.AreEqual("aé😀", AdxGuard.TruncateUtf8(s, 7));
            Assert.AreEqual(s, AdxGuard.TruncateUtf8(s, 99));
        }

        [Test]
        public void Keywords()
        {
            Assert.AreEqual("a,b,c", AdxGuard.SanitizeKeywords(" a,b\u0007,c "));
            Assert.IsNull(AdxGuard.SanitizeKeywords("   "));
            Assert.AreEqual(AdxGuard.MaxKeywordsBytes, AdxGuard.SanitizeKeywords(new string('k', 5000)).Length);
        }

        [Test]
        public void PrivacySignalsAreNeverLost()
        {
            Assert.AreEqual("1YYN", AdxGuard.SanitizeUsPrivacy("1YYN"));
            Assert.AreEqual("1-Y-", AdxGuard.SanitizeUsPrivacy(" 1-Y-\n"));
            StringAssert.StartsWith("1YY", AdxGuard.SanitizeUsPrivacy("1YY" + new string('x', 100)));
            Assert.AreEqual("7", AdxGuard.SanitizeGppSid("7"));
            Assert.AreEqual("7,8", AdxGuard.SanitizeGppSid("7_8"));
            Assert.AreEqual("7,8", AdxGuard.SanitizeGppSid("7;8"));
            Assert.AreEqual("2,7", AdxGuard.SanitizeGppSid(" 2 , 7 "));
            Assert.IsNull(AdxGuard.SanitizeGppSid("abc"));
            Assert.LessOrEqual(AdxGuard.SanitizeGppSid(new StringBuilder().Insert(0, "1,", 200).ToString()).Length, 128);
            const string tcf = "CPXxRfAPXxRfAAfKABENB-CgAAAAAAAAAAYgAAAAAAAA";
            Assert.AreEqual(tcf, AdxGuard.SanitizeConsent(" " + tcf + " "));
            string max = new string('C', AdxGuard.MaxConsentBytes);
            Assert.AreEqual(max, AdxGuard.SanitizeConsent(max));
            Assert.IsNull(AdxGuard.SanitizeConsent(max + "C"));
        }

        [Test]
        public void InvalidSlotIsNeverSent()
        {
            Assert.IsNull(AdxGuard.GuardServeParams("pk_x", new AdRequest()));
            Assert.IsNull(AdxGuard.GuardServeParams("pk_x", new AdRequest { SlotId = "s1" }));
            Assert.IsNull(AdxGuard.GuardServeParams("pk_x", new AdRequest { SlotId = Slot + "' or 1=1" }));
            Assert.IsNull(AdxGuard.GuardServeParams("pk_x", new AdRequest { SlotName = "  " }));
            Assert.IsNull(AdxGuard.GuardServeParams("pk_x", new AdRequest { SlotName = new string('n', 129) }));
            var p = AdxGuard.GuardServeParams("pk_x", new AdRequest { SlotId = " " + Slot + " ", SlotName = "ignored", PageUrl = "https://s.com/#t" });
            var map = new Dictionary<string, string>();
            foreach (var kv in p) map[kv.Key] = kv.Value;
            Assert.AreEqual("pk_x", map["api_key"]);
            Assert.AreEqual(Slot, map["slot_id"]);
            Assert.IsNull(map["slot_name"]);
            Assert.AreEqual("https://s.com/", map["page_url"]);
        }

        [Test]
        public void RequestBudget()
        {
            var g = new AdxRequestGuard();
            const long t0 = 1000000;
            for (int i = 0; i < AdxGuard.MaxRequestsPerMinute; i++) Assert.IsNull(g.Acquire(t0));
            Assert.AreEqual(1, g.Acquire(t0));
            Assert.IsNull(g.Acquire(t0 + 1000));
            Assert.AreEqual(1, g.Acquire(t0 + 1000));
        }

        [Test]
        public void Breaker429()
        {
            var g = new AdxRequestGuard();
            g.Record(429, 30, 0);
            Assert.AreEqual(29, g.Acquire(1000));
            Assert.IsNull(g.Acquire(30000));
            var d = new AdxRequestGuard();
            d.Record(429, null, 0);
            Assert.AreEqual(60, d.Acquire(0));
            var c = new AdxRequestGuard();
            c.Record(429, 86400, 0);
            Assert.AreEqual(600, c.Acquire(0));
            var o = new AdxRequestGuard();
            o.Record(503, 999, 0);
            Assert.IsNull(o.Acquire(0));
        }

        [Test]
        public void UnsafeConfigDisablesClient()
        {
            Assert.IsNotNull(new Adx("sk_live_secret").ConfigError);
            Assert.IsNotNull(new Adx("pk_x", "http://api.adx.theaimart.co").ConfigError);
            Assert.IsNotNull(new Adx("pk_x", "https://api.adx.theaimart.co@evil.com").ConfigError);
            Assert.IsNull(new Adx(" pk_x\n", "http://localhost:8080").ConfigError);
        }
    }
}
