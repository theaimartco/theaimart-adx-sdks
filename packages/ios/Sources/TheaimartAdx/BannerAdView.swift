// WebKit and `UIApplication.open` do not exist on tvOS, so this view compiles only where
// both frameworks are available. The core `Adx` client still builds everywhere.
#if canImport(UIKit) && canImport(WebKit)
import UIKit
import WebKit
import ImageIO

/// A drop-in banner view. Requests an ad, renders it (image via `UIImageView` with a
/// click-through, or html/openrtb via a sandboxed `WKWebView`), and implements CONTRACT.md §9
/// in full:
///
///  * **§9a continuous fill** — set `refreshSeconds` and the slot keeps itself filled, backing off
///    exponentially (30s → 300s) whenever a cycle does not render, so one no-fill never leaves the
///    slot permanently dark. Leave it 0 for a single shot.
///  * **§9b visibility gating** — no request is made while the app is backgrounded or the view is
///    off screen / not in a window; it resumes, firing at once if overdue, when shown again.
///  * **§9c** — the viewability beacon is armed **only** by a creative that actually attached. An
///    image whose download failed, or a creative rejected by the §4e scheme allowlist, is reported
///    through `onAdFailed` and is *not* an impression.
///
/// ```swift
/// let banner = BannerAdView(frame: CGRect(x: 0, y: 0, width: 300, height: 250))
/// banner.refreshSeconds = 60          // continuous fill
/// banner.load(Adx(apiKey: "pk_..."), request: AdRequest(slotID: "8b1f-uuid"))
/// view.addSubview(banner)
/// // when the host screen goes away:
/// banner.destroy()
/// ```
public final class BannerAdView: UIView {
    private enum RenderState: Equatable {
        case pending
        case ok
        case failed
    }

    private var adx: Adx?
    private var pendingRequest: AdRequest?
    private var currentAd: Ad?
    private var renderState: RenderState = .pending

    private var beaconFired = false
    private var visibleSince: Date?
    private var driver: Timer?
    private var clickURL: String?
    private var imageTask: URLSessionDataTask?

    // Continuous fill (§9a/§9b).
    private var failures = 0
    private var dueAt: Date?
    private var cycle = 0
    private var settledCycle = -1
    private var appActive = true
    private var destroyed = false

    /// Continuous-fill interval in seconds (CONTRACT.md §9a); clamped up to
    /// `AdxConstants.minRefreshSeconds`. 0 (the default) is a single shot.
    public var refreshSeconds: Int = 0

    /// Visual-only surface options. They never affect ad requests or tracking.
    public var cornerRadius: CGFloat = 12 {
        didSet { applySurfaceStyle() }
    }
    public var surfaceColor: UIColor? { didSet { applySurfaceStyle() } }
    public var elevated = true { didSet { applySurfaceStyle() } }

    public var onAdLoaded: ((Ad) -> Void)?
    public var onAdFailed: ((String) -> Void)?

    public override init(frame: CGRect) {
        super.init(frame: frame)
        applySurfaceStyle()
        observeAppState()
    }

    public required init?(coder: NSCoder) {
        super.init(coder: coder)
        applySurfaceStyle()
        observeAppState()
    }

    deinit {
        driver?.invalidate()
        imageTask?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Public API

    /// Request and render an ad. Safe to call again to restart the loop with a new request.
    public func load(_ client: Adx, request: AdRequest) {
        adx = client
        pendingRequest = request
        failures = 0
        dueAt = nil
        // Timer scheduling needs the main run loop.
        if Thread.isMainThread {
            requestCycle()
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.requestCycle()
            }
        }
    }

    /// Stop the loop for good. Call from the host view controller's teardown.
    public func destroy() {
        destroyed = true
        cycle += 1
        driver?.invalidate()
        driver = nil
        imageTask?.cancel()
        imageTask = nil
        clearCreativeSubviews()
        dueAt = nil
        currentAd = nil
    }

    // MARK: - Lifecycle

    private func observeAppState() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleAppBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        center.addObserver(
            self,
            selector: #selector(handleAppForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    @objc private func handleAppBackground() {
        appActive = false
        visibleSince = nil
        driver?.invalidate()
        driver = nil
    }

    @objc private func handleAppForeground() {
        appActive = true
        scheduleDriver(immediate: true)
    }

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil {
            driver?.invalidate()
            driver = nil
        } else {
            scheduleDriver(immediate: true)
        }
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        layer.shadowPath = UIBezierPath(
            roundedRect: bounds,
            cornerRadius: effectiveCornerRadius
        ).cgPath
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if surfaceColor == nil { applySurfaceStyle() }
    }

    // MARK: - Request / render cycle

    private func requestCycle() {
        guard !destroyed, let client = adx, let request = pendingRequest else { return }
        cycle += 1
        let myCycle = cycle
        renderState = .pending
        beaconFired = false
        visibleSince = nil

        // `Adx.requestAd` already delivers its completion on the main queue.
        client.requestAd(request) { [weak self] ad in
            guard let self = self, !self.destroyed, myCycle == self.cycle else { return }
            self.render(ad, forCycle: myCycle)
        }
    }

    private func render(_ ad: Ad, forCycle: Int) {
        currentAd = ad
        imageTask?.cancel()
        imageTask = nil
        clearCreativeSubviews()
        clickURL = nil

        switch renderPlan(ad, canRenderHTML: true) {
        case .html:
            isHidden = false
            renderHTML(ad.creative?.html ?? "")
            markRendered(true, ad: ad, forCycle: forCycle)
        case .image:
            isHidden = false
            // Settles asynchronously: an image only counts once its bytes actually decoded.
            renderImage(ad, forCycle: forCycle)
        case .none:
            isHidden = true
            markRendered(false, ad: ad, forCycle: forCycle)
        }
    }

    private func markRendered(_ ok: Bool, ad: Ad, forCycle: Int) {
        guard !destroyed, forCycle == cycle else { return }
        renderState = ok ? .ok : .failed
        if ok {
            onAdLoaded?(ad)
        } else {
            onAdFailed?(ad.filled ? "creative could not be rendered" : (ad.reason ?? "no fill"))
        }
        settle(ok, retryAfterSeconds: ad.retryAfterSeconds, forCycle: forCycle)
    }

    /// §9a — once a cycle settles, decide when (or whether) to ask again.
    private func settle(_ ok: Bool, retryAfterSeconds: Int?, forCycle: Int) {
        guard settledCycle != forCycle else { return }
        settledCycle = forCycle
        failures = ok ? 0 : failures + 1
        if let delay = nextDelaySeconds(
            rendered: ok,
            consecutiveFailures: failures,
            retryAfterSeconds: retryAfterSeconds,
            refreshSeconds: refreshSeconds
        ) {
            dueAt = Date().addingTimeInterval(TimeInterval(delay))
        } else {
            dueAt = nil
        }
        scheduleDriver()
    }

    // MARK: - Drawing

    private func renderHTML(_ html: String) {
        let webView = WKWebView(frame: bounds)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.accessibilityLabel = "Advertisement"
        webView.layer.cornerRadius = effectiveCornerRadius
        webView.clipsToBounds = true
        // A nil baseURL gives the creative a unique origin — it can reach nothing of ours.
        webView.loadHTMLString(html, baseURL: nil)
        addSubview(webView)
    }

    private func renderImage(_ ad: Ad, forCycle: Int) {
        guard let creative = ad.creative,
              let assetURL = creative.assetURL,
              isSafeHTTPURL(assetURL),
              let url = URL(string: assetURL) else {
            isHidden = true
            markRendered(false, ad: ad, forCycle: forCycle)
            return
        }
        clickURL = isSafeHTTPURL(creative.clickURL) ? creative.clickURL : nil

        let imageView = UIImageView(frame: bounds)
        imageView.contentMode = .scaleAspectFit
        imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        imageView.isUserInteractionEnabled = true
        imageView.isAccessibilityElement = true
        imageView.accessibilityLabel = creative.headline ?? "Advertisement"
        imageView.accessibilityTraits = clickURL == nil ? .image : [.image, .link]
        imageView.alpha = 0
        imageView.layer.cornerRadius = effectiveCornerRadius
        imageView.clipsToBounds = true
        if clickURL != nil {
            imageView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(handleTap)))
        }
        addSubview(imageView)

        var request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad,
                                 timeoutInterval: AdxConstants.defaultTimeout)
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        let target = CGSize(width: max(bounds.width, CGFloat(creative.width)),
                            height: max(bounds.height, CGFloat(creative.height)))
        let task = URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            let image = data.flatMap {
                $0.count <= Self.maxCreativeBytes ? Self.downsample($0, to: target) : nil
            }
            DispatchQueue.main.async { [weak self] in
                guard let self = self, !self.destroyed, forCycle == self.cycle else { return }
                self.imageTask = nil
                if let image = image {
                    imageView.image = image
                    UIView.animate(withDuration: 0.16) { imageView.alpha = 1 }
                    self.markRendered(true, ad: ad, forCycle: forCycle)
                } else {
                    // §9c: an empty box is not an impression. Hide it and let §9a refill.
                    self.isHidden = true
                    self.markRendered(false, ad: ad, forCycle: forCycle)
                }
            }
        }
        imageTask = task
        task.resume()
    }

    private static func downsample(_ data: Data, to size: CGSize) -> UIImage? {
        guard !data.isEmpty,
              let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let scale = UIScreen.main.scale
        let maxPixels = max(1, max(size.width, size.height) * scale)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private var effectiveCornerRadius: CGFloat { min(48, max(0, cornerRadius)) }

    private func clearCreativeSubviews() {
        subviews.forEach {
            if let webView = $0 as? WKWebView { webView.stopLoading() }
            $0.removeFromSuperview()
        }
    }

    private func applySurfaceStyle() {
        if let surfaceColor = surfaceColor {
            backgroundColor = surfaceColor
        } else if #available(iOS 13.0, *) {
            backgroundColor = .secondarySystemBackground
        } else {
            backgroundColor = UIColor(white: 0.96, alpha: 1)
        }
        layer.cornerRadius = effectiveCornerRadius
        layer.masksToBounds = false
        layer.shadowColor = UIColor.black.cgColor
        layer.shadowOpacity = elevated ? 0.13 : 0
        layer.shadowRadius = elevated ? 14 : 0
        layer.shadowOffset = elevated ? CGSize(width: 0, height: 8) : .zero
        subviews.forEach {
            $0.layer.cornerRadius = effectiveCornerRadius
            $0.clipsToBounds = true
        }
        setNeedsLayout()
    }

    @objc private func handleTap() {
        // §4e: only http/https click URLs are opened — javascript:/file:/intent: are rejected.
        guard let clickURL = clickURL, isSafeHTTPURL(clickURL), let url = URL(string: clickURL) else {
            return
        }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    // MARK: - Driver (viewability + refresh clock)

    private func scheduleDriver(immediate: Bool = false) {
        driver?.invalidate()
        driver = nil
        guard !destroyed, appActive, window != nil else { return }

        let tracking = renderState == .ok && currentAd?.isTrackable == true &&
            currentAd?.impID != nil && !beaconFired
        let delay: TimeInterval?
        if tracking {
            delay = 0.25
        } else if let due = dueAt {
            delay = max(0.25, due.timeIntervalSinceNow)
        } else {
            delay = nil
        }
        guard let interval = delay else { return }
        let timer = Timer(timeInterval: immediate ? 0 : interval, repeats: false) {
            [weak self] _ in
            guard let self = self, !self.destroyed else { return }
            self.driver = nil
            self.tick()
            self.scheduleDriver()
        }
        driver = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func tick() {
        let ratio = visibleFraction()

        // §9c: only a cycle that actually drew arms the beacon.
        if renderState == .ok,
           let ad = currentAd,
           ad.isTrackable,
           let impID = ad.impID,
           !beaconFired {
            if ratio >= 0.5 {
                if visibleSince == nil {
                    visibleSince = Date()
                } else if Date().timeIntervalSince(visibleSince!) >= 1.0 {
                    beaconFired = true
                    // Outlives this cycle on purpose: a late delivery is still this view (§5).
                    adx?.deliverViewable(impID, retryable: ad.source == .internal)
                }
            } else {
                visibleSince = nil
            }
        }

        maybeAdvance(onScreen: ratio > 0)
    }

    private func maybeAdvance(onScreen: Bool) {
        guard !destroyed, let due = dueAt else { return }
        // §9b: nothing is requested while the app is backgrounded or the view has no window…
        guard appActive, window != nil else { return }
        // …and a drawn ad that is scrolled away waits, while a slot showing nothing must still
        // be able to recover.
        if renderState == .ok && !onScreen { return }
        guard Date() >= due else { return }
        dueAt = nil
        requestCycle()
    }

    private func visibleFraction() -> CGFloat {
        guard let window = window, !isHidden, bounds.width > 0, bounds.height > 0 else { return 0 }
        let inWindow = convert(bounds, to: nil)
        let intersection = inWindow.intersection(window.screen.bounds)
        guard !intersection.isNull else { return 0 }
        return (intersection.width * intersection.height) / (bounds.width * bounds.height)
    }

    private static let maxCreativeBytes = 5 * 1024 * 1024
}
#endif
