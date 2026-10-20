using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    /// <summary>CONTRACT.md §5 beacon outcomes + resend schedule, and §3 identity persistence.</summary>
    public class ViewableTests
    {
        [TestCase(200, "{\"success\":true}", ViewableOutcome.Recorded)]
        [TestCase(200, "{\"success\":true,\"duplicate\":true}", ViewableOutcome.Recorded)]
        [TestCase(200, "{\"success\":false,\"reason\":\"impression_not_recorded_yet\",\"retry\":true}", ViewableOutcome.Retry)]
        [TestCase(0, null, ViewableOutcome.Retry)]
        [TestCase(429, "{\"error\":\"rate limit\"}", ViewableOutcome.Retry)]
        [TestCase(500, "", ViewableOutcome.Retry)]
        [TestCase(503, "oops", ViewableOutcome.Retry)]
        [TestCase(400, "Json deserialize error", ViewableOutcome.Drop)]
        [TestCase(404, null, ViewableOutcome.Drop)]
        [TestCase(200, "{\"success\":false}", ViewableOutcome.Drop)]
        [TestCase(200, "", ViewableOutcome.Drop)]
        [TestCase(200, "[true]", ViewableOutcome.Drop)]
        [TestCase(200, "{\"success\":\"true\"}", ViewableOutcome.Drop)]
        public void Classify_EveryContractResponse(int status, string body, ViewableOutcome want)
        {
            Assert.AreEqual(want, AdxViewable.Classify(status, body));
        }

        [Test]
        public void ShouldResend_FollowsTheSchedule()
        {
            Assert.IsTrue(AdxViewable.ShouldResend(ViewableOutcome.Retry, true, 0));
            Assert.IsTrue(AdxViewable.ShouldResend(ViewableOutcome.Retry, true, 2));
            Assert.IsFalse(AdxViewable.ShouldResend(ViewableOutcome.Retry, true, 3), "gives up after 1/2/4s");
            Assert.IsFalse(AdxViewable.ShouldResend(ViewableOutcome.Retry, false, 0), "OpenRTB is sent once");
            Assert.IsFalse(AdxViewable.ShouldResend(ViewableOutcome.Drop, true, 0));
            Assert.IsFalse(AdxViewable.ShouldResend(ViewableOutcome.Recorded, true, 0));
            CollectionAssert.AreEqual(new[] { 1, 2, 4 }, AdxViewable.RetryDelaysSeconds);
        }

        [Test]
        public void IsStorableIdentity_AcceptsOnlyTheCookieAlphabet()
        {
            Assert.IsTrue(AdxViewable.IsStorableIdentity(
                "1a45674e-a8b0-4acb-ada9-774f3055ef15._X8sLEOxqwz4akZKKJtrFW4n6xnpcbTGPWH1tPf6IT0"));
            Assert.IsTrue(AdxViewable.IsStorableIdentity("86ee3b2a-511e-4ff2-bb54-3f696a6525b8"));
            Assert.IsFalse(AdxViewable.IsStorableIdentity(null));
            Assert.IsFalse(AdxViewable.IsStorableIdentity(""));
            Assert.IsFalse(AdxViewable.IsStorableIdentity("abc; Path=/"));
            Assert.IsFalse(AdxViewable.IsStorableIdentity("abc\r\nX-Evil: 1"));
            Assert.IsFalse(AdxViewable.IsStorableIdentity(new string('a', 257)));
        }
    }
}
