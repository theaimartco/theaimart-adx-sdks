using NUnit.Framework;

namespace Theaimart.Adx.Tests
{
    /// <summary>
    /// CONTRACT.md §9a — the continuous-fill scheduling policy.
    ///
    /// This is the shared conformance table. Every SDK in the repository ships the same cases;
    /// if you change one, change them all.
    /// </summary>
    public class ScheduleTests
    {
        [Test]
        public void RefreshDisabled_IsSingleShot()
        {
            Assert.IsNull(AdxSchedule.NextDelaySeconds(true, 0, null, 0));
            Assert.IsNull(AdxSchedule.NextDelaySeconds(false, 3, null, 0));
            Assert.IsNull(AdxSchedule.NextDelaySeconds(false, 1, 60, -5));
        }

        [Test]
        public void RenderedAd_RefreshesAtRequestedInterval_FlooredAt30s()
        {
            Assert.AreEqual(60, AdxSchedule.NextDelaySeconds(true, 0, null, 60));
            Assert.AreEqual(30, AdxSchedule.NextDelaySeconds(true, 0, null, 30));
            Assert.AreEqual(AdxConstants.MinRefreshSeconds, AdxSchedule.NextDelaySeconds(true, 0, null, 10));
            Assert.AreEqual(AdxConstants.MinRefreshSeconds, AdxSchedule.NextDelaySeconds(true, 0, null, 1));
        }

        [Test]
        public void Failures_BackOffAndCap()
        {
            Assert.AreEqual(30, AdxSchedule.NextDelaySeconds(false, 1, null, 30));
            Assert.AreEqual(60, AdxSchedule.NextDelaySeconds(false, 2, null, 30));
            Assert.AreEqual(120, AdxSchedule.NextDelaySeconds(false, 3, null, 30));
            Assert.AreEqual(240, AdxSchedule.NextDelaySeconds(false, 4, null, 30));
            Assert.AreEqual(AdxConstants.MaxRetrySeconds, AdxSchedule.NextDelaySeconds(false, 5, null, 30));
            Assert.AreEqual(AdxConstants.MaxRetrySeconds, AdxSchedule.NextDelaySeconds(false, 99, null, 30));
            // A very long outage must not overflow into a negative or absurd delay.
            Assert.AreEqual(AdxConstants.MaxRetrySeconds, AdxSchedule.NextDelaySeconds(false, int.MaxValue, null, 30));
        }

        [Test]
        public void RetryAfter_PushesOutNeverIn()
        {
            Assert.AreEqual(90, AdxSchedule.NextDelaySeconds(false, 1, 90, 30));
            Assert.AreEqual(AdxConstants.MaxRetrySeconds, AdxSchedule.NextDelaySeconds(false, 5, 10, 30));
            Assert.AreEqual(30, AdxSchedule.NextDelaySeconds(false, 1, 0, 30));
            Assert.AreEqual(30, AdxSchedule.NextDelaySeconds(false, 1, null, 30));
        }

        [Test]
        public void SlowRequestedInterval_IsHonouredOnFailureToo()
        {
            Assert.AreEqual(600, AdxSchedule.NextDelaySeconds(false, 1, null, 600));
            Assert.AreEqual(600, AdxSchedule.NextDelaySeconds(true, 0, null, 600));
        }

        [Test]
        public void Loop_StaysInsideThePerKeyRateLimit()
        {
            int? floor = AdxSchedule.NextDelaySeconds(true, 0, null, 1);
            Assert.IsNotNull(floor);
            Assert.LessOrEqual(60.0 / floor.Value, 2.0);
        }
    }
}
