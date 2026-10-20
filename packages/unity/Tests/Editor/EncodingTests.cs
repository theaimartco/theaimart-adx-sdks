using System.Collections.Generic;
using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    public class EncodingTests
    {
        private const string Nasty =
            "https://shop.example.com/weekend/broadcast?ref=frontend&u=alice@example.com" +
            "&sel=select a table; drop-- update union open cast 1=1";

        [Test]
        public void PercentEncodeAll_IsUppercaseHex()
        {
            Assert.AreEqual("%61%5A%30", AdxEncoding.PercentEncodeAll("aZ0"));
            Assert.AreEqual("%61%40%20%3D%C3%A9", AdxEncoding.PercentEncodeAll("a@ =é"));
        }

        [Test]
        public void BuildServeQuery_SkipsNulls()
        {
            string q = AdxEncoding.BuildServeQuery(new List<KeyValuePair<string, string>>
            {
                new KeyValuePair<string, string>("api_key", "pk"),
                new KeyValuePair<string, string>("slot_id", null),
                new KeyValuePair<string, string>("page_url", "x"),
            });
            Assert.IsTrue(q.Contains("api_key="));
            Assert.IsFalse(q.Contains("slot_id="));
            Assert.IsTrue(q.Contains("page_url="));
        }

        [Test]
        public void BuiltQuery_IsWafSafe_ForHostileInput()
        {
            string q = AdxEncoding.BuildServeQuery(new List<KeyValuePair<string, string>>
            {
                new KeyValuePair<string, string>("api_key", "pk_live"),
                new KeyValuePair<string, string>("page_url", Nasty),
                new KeyValuePair<string, string>("page_keywords", "select,table,cast,end,open"),
            });
            string lowered = q.ToLowerInvariant();
            foreach (string kw in AdxEncoding.SqlInjectionKeywords)
            {
                Assert.IsFalse(lowered.Contains(kw), "built query leaks WAF keyword: " + kw);
            }
            Assert.IsTrue(AdxEncoding.RawQueryIsWafSafe(q));
        }
    }
}
