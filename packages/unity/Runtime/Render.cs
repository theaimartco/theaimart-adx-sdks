namespace Theaimart.Adx
{
    /// <summary>What this surface can actually draw for a given decision.</summary>
    public enum RenderPlan
    {
        /// <summary>Draw <c>Creative.Html</c> in a sandboxed WebView.</summary>
        Html,

        /// <summary>Draw <c>Creative.AssetUrl</c> as an image.</summary>
        Image,

        /// <summary>Nothing can be drawn — not an impression.</summary>
        None,
    }

    /// <summary>
    /// The §9c render gate, as a pure decision — CONTRACT.md §9c.
    ///
    /// Every SDK asks this one question before it draws anything, and the answer is the *only*
    /// thing allowed to arm the viewability beacon. <see cref="RenderPlan.None"/> means this
    /// surface cannot draw the creative, so it is not an impression: no beacon, and the slot
    /// backs off and refills (§9a).
    ///
    /// Deliberately free of UnityEngine types so the rule is exercised by edit-mode unit tests.
    /// </summary>
    public static class AdxRender
    {
        /// <param name="canRenderHtml">
        /// Whether this surface actually has a WebView available right now. Unity's
        /// <c>RawImage</c> banner passes <c>false</c>: it cannot draw OpenRTB markup, so those
        /// fills are refused rather than counted as views of an invisible ad.
        /// </param>
        public static RenderPlan Plan(Ad ad, bool canRenderHtml)
        {
            if (ad == null || !ad.Filled || ad.Creative == null) return RenderPlan.None;
            Creative creative = ad.Creative;

            if (ad.Kind == AdKind.Html)
            {
                bool hasHtml = !string.IsNullOrEmpty(creative.Html);
                return (hasHtml && canRenderHtml) ? RenderPlan.Html : RenderPlan.None;
            }

            // §4e: a hostile asset URL is dropped, and a dropped creative is not an impression.
            return Adx.IsSafeHttpUrl(creative.AssetUrl) ? RenderPlan.Image : RenderPlan.None;
        }
    }
}
