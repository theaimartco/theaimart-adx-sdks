# Theaimart ADX Unity SDK

The official **Theaimart ADX SDK for Unity**, distributed as a Unity Package Manager package for integrating advertisements and monetizing Unity games and applications.

`co.theaimart.adx` provides a lightweight Unity advertising integration built with:

* `UnityWebRequest`
* Unity coroutines
* Unity UI
* A small bundled JSON parser
* No third-party runtime dependencies

The SDK supports managed banner rendering through the `AdxBanner` component and lower-level programmatic access through the `Adx` client.

It implements version 1 of the [Theaimart ADX wire contract](../../CONTRACT.md).

> **Unity version:** Unity 2020.3 or later
> **Package format:** Unity Package Manager
> **Language:** C#
> **Runtime dependencies:** None
> **Primary platforms:** Android and iOS
> **License:** Apache License 2.0

---

## Features

* Official Theaimart ADX Unity SDK
* Unity game monetization
* Android game advertising
* iOS game advertising
* Unity Package Manager integration
* Drop-in `AdxBanner` component
* Programmatic `Adx` client
* Unity coroutine-based networking
* Native `UnityWebRequest` transport
* Unity UI `RawImage` rendering
* Automatic banner click handling
* Automatic viewability reporting
* Internal-ad support
* OpenRTB demand support
* House-ad support
* Normalized no-fill responses
* Platform-aware User-Agent
* Android and iPhone device classification
* SQL-filter-safe parameter encoding
* Typed four-way response parsing
* Fail-closed network behavior
* Edit Mode unit tests
* No third-party runtime packages
* Theaimart ADX wire contract v1 compatibility

---

## Table of Contents

* [What is Theaimart ADX?](#what-is-theaimart-adx)
* [Why use the Unity SDK?](#why-use-the-unity-sdk)
* [Supported Unity Versions](#supported-unity-versions)
* [Supported Platforms](#supported-platforms)
* [Requirements](#requirements)
* [Installation](#installation)
* [Quick Start](#quick-start)
* [Drop-In Banner Integration](#drop-in-banner-integration)
* [Inspector Configuration](#inspector-configuration)
* [Programmatic Integration](#programmatic-integration)
* [Complete MonoBehaviour Example](#complete-monobehaviour-example)
* [Image Creative Rendering](#image-creative-rendering)
* [HTML and OpenRTB Creatives](#html-and-openrtb-creatives)
* [Viewability Tracking](#viewability-tracking)
* [Click Handling](#click-handling)
* [Ad Response Model](#ad-response-model)
* [Demand Sources](#demand-sources)
* [Four-Way Union Parsing](#four-way-union-parsing)
* [User-Agent and Device Classification](#user-agent-and-device-classification)
* [SQL-Filter-Safe Encoding](#sql-filter-safe-encoding)
* [Error and No-Fill Handling](#error-and-no-fill-handling)
* [API Reference](#api-reference)
* [Unity Lifecycle](#unity-lifecycle)
* [Scene Management](#scene-management)
* [Android Integration Notes](#android-integration-notes)
* [iOS Integration Notes](#ios-integration-notes)
* [Editor and Device Testing](#editor-and-device-testing)
* [Production Recommendations](#production-recommendations)
* [Security Guidance](#security-guidance)
* [Performance and Memory](#performance-and-memory)
* [Testing](#testing)
* [Development](#development)
* [Frequently Asked Questions](#frequently-asked-questions)
* [Wire Contract](#wire-contract)
* [License](#license)

---

## What is Theaimart ADX?

[Theaimart ADX](https://adx.theaimart.co) is an advertising and application-monetization platform for developers, publishers, games, mobile applications, websites, and software products.

The Unity SDK connects a Unity project to the Theaimart advertising infrastructure.

It allows a Unity game or application to:

1. Authenticate using a public publisher API key.
2. Request an advertisement for a configured slot.
3. Receive an internal, OpenRTB, house, or no-fill response.
4. Render supported image creatives.
5. Handle intentional advertisement interactions.
6. Measure advertisement viewability.
7. Report viewable impressions.
8. Preserve platform and device classification.
9. Handle network and parsing failures safely.
10. Monetize eligible Unity application traffic.

The package provides two integration levels:

* `AdxBanner` for a managed Unity UI banner
* `Adx` for custom request and rendering logic

---

## Why use the Unity SDK?

A custom Unity advertising implementation must handle more than a basic HTTP request.

Common production issues include:

* Generic or blocked User-Agent values
* Incorrect Android or iOS device classification
* Web Application Firewall false positives
* Multiple backend response formats
* Invalid creative payloads
* Incorrect impression timing
* Unsafe click navigation
* Texture-loading failures
* Scene changes during network requests
* Destroyed Unity objects receiving late callbacks
* Network errors affecting gameplay

Theaimart ADX Unity SDK addresses these issues through:

* A platform-aware SDK User-Agent
* Contract-compliant request encoding
* Typed response normalization
* Managed banner rendering
* Coroutine-based request execution
* Automatic viewability handling
* Safe no-fill behavior
* Failure isolation

For polished scaling, keep `preserveAspect` enabled. `fadeInSeconds` controls the unscaled
creative fade-in and can be set to `0` when motion should be disabled.
* No third-party runtime networking dependency

Advertising failures should not interrupt gameplay or crash the host application.

---

## Supported Unity Versions

The package supports:

```text
Unity 2020.3 LTS or later
```

Before publishing a production game, test the package against the exact Unity editor and player versions used by your project.

Recommended verification targets include:

* The minimum supported Unity version
* The current Unity LTS version used by the project
* Android release builds
* iOS release builds
* Development and non-development players

---

## Supported Platforms

The SDK is primarily intended for Unity applications targeting:

| Platform              | Support                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Android               | Supported                                                                  |
| iPhone                | Supported                                                                  |
| iPad                  | Supported where the Unity project supports it                              |
| Unity Editor          | Supported for development and applicable networking tests                  |
| Android emulator      | Supported for integration testing                                          |
| iOS simulator         | Supported where the Unity project and dependencies permit                  |
| Other Unity platforms | Verify against the package implementation and backend classification rules |

The SDK-generated User-Agent is designed to include recognizable platform tokens such as Android or iPhone.

Rendering and click behavior should be tested separately on every platform included in the final release.

---

## Requirements

The Unity project requires:

* Unity 2020.3 or later
* A valid Theaimart ADX public publisher key
* A valid Theaimart ADX slot ID
* Network connectivity
* A Canvas for managed UI banners
* A Unity `EventSystem` for click interaction
* A `RawImage` for the drop-in banner workflow

The SDK uses Unity-provided runtime APIs and includes its own small JSON parser.

No external JSON, HTTP, or advertising package is required.

---

## Installation

The package can be installed through Unity Package Manager using a Git URL.

### Install through `Packages/manifest.json`

Open:

```text
Packages/manifest.json
```

Add the package inside the `dependencies` object:

```json
{
  "dependencies": {
    "co.theaimart.adx": "https://github.com/theaimartco/theaimart-adx-sdks.git?path=packages/unity"
  }
}
```

Preserve the other dependencies already present in your project.

Unity will download and import the package after the manifest is saved.

---

## Install through Package Manager

In the Unity Editor:

1. Open **Window → Package Manager**.
2. Select the **+** menu.
3. Choose **Add package from git URL**.
4. Enter:

```text
https://github.com/theaimartco/theaimart-adx-sdks.git?path=packages/unity
```

5. Select **Add**.

After installation, the package should appear in the Package Manager and under the project's Packages directory.

---

## Pinning a Release

For reproducible production builds, pin the dependency to a tagged release where supported by your Git package workflow.

Conceptual format:

```text
https://github.com/theaimartco/theaimart-adx-sdks.git?path=packages/unity#v1.1.0
```

Releases are SemVer tags at the repository root (`v1.1.0`), shared with the iOS SDK.

Avoid tracking an unpinned development branch in production builds.

---

## Quick Start

The fastest integration uses `AdxBanner`.

1. Create or open a Unity scene.
2. Add a Canvas.
3. Ensure the scene has an `EventSystem`.
4. Add a `RawImage` under the Canvas.
5. Attach the `AdxBanner` component.
6. Enter the public publisher API key.
7. Enter the slot ID.
8. Run the scene.

The component requests and renders the advertisement according to its configured behavior.

---

## Drop-In Banner Integration

### Create the UI hierarchy

A typical hierarchy is:

```text
Canvas
└── AdContainer
    └── BannerRawImage
```

The scene also requires:

```text
EventSystem
```

Select the `BannerRawImage` GameObject and attach:

```text
AdxBanner
```

The component uses the Unity UI element to display supported image creatives.

### Recommended hierarchy

```text
Canvas
├── GameUI
├── AdContainer
│   └── BannerRawImage
└── OtherUI

EventSystem
```

Keep the advertisement inside a dedicated container so the placement can be hidden or collapsed after no-fill.

---

## Inspector Configuration

Configure the `AdxBanner` component in the Unity Inspector.

Typical fields include:

| Field       | Description                                                   |
| ----------- | ------------------------------------------------------------- |
| `apiKey`    | Public Theaimart ADX publisher key                            |
| `slotId`    | Configured publisher slot identifier; blank uses the GameObject name |
| `baseUrl`   | Ad server base URL; leave the production default unless overriding it |
| `RawImage`  | Required component on the same GameObject; it displays image creatives |

Use the exact serialized fields exposed by the installed package version.

Example publisher key:

```text
pk_your_publisher_key
```

Example slot ID:

```text
8b1f2c3d-0000-0000-0000-000000000000
```

Do not use placeholder values in production.

---

## Canvas Configuration

For predictable banner placement:

* Use an appropriate Canvas render mode.
* Configure `CanvasScaler` for the target resolution.
* Give the banner explicit dimensions.
* Preserve the creative's aspect ratio.
* Keep the banner inside the safe area.
* Avoid placing critical controls directly beside the ad.
* Ensure the banner is not clipped by masks or parent layouts.
* Ensure the `RawImage` can receive pointer interaction.
* Verify the scene contains an active `EventSystem`.

Recommended Canvas Scaler configuration depends on the game's UI design and supported aspect ratios.

Test the placement across:

* Phones
* Tablets
* Landscape orientation
* Portrait orientation
* Notched devices
* Different display densities
* Foldable or unusual aspect-ratio devices where supported

---

## Programmatic Integration

Use the `Adx` client when the application requires custom behavior.

```csharp
using Theaimart.Adx;
using UnityEngine;

public sealed class AdExample : MonoBehaviour
{
    private Adx _adx;

    private void Awake()
    {
        _adx = new Adx("pk_your_publisher_key");
    }

    private void Start()
    {
        StartCoroutine(
            _adx.RequestAd(
                new AdRequest
                {
                    SlotId = "8b1f2c3d-0000-0000-0000-000000000000"
                },
                ad =>
                {
                    if (!ad.Filled)
                    {
                        Debug.Log($"No fill: {ad.Reason}");
                        return;
                    }

                    Debug.Log($"Advertisement filled by {ad.Source}");

                    // Render ad.Creative according to its creative type.

                    if (ad.IsTrackable && !string.IsNullOrEmpty(ad.ImpId))
                    {
                        StartCoroutine(
                            _adx.ReportViewable(ad.ImpId)
                        );
                    }
                }
            )
        );
    }
}
```

When using custom rendering, do not report viewability immediately unless the advertisement has actually met the required visibility threshold.

---

## Complete MonoBehaviour Example

The following example shows a programmatic image-banner workflow.

```csharp
using System.Collections;
using Theaimart.Adx;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public sealed class TheaimartBannerController : MonoBehaviour
{
    [Header("Theaimart ADX")]
    [SerializeField]
    private string apiKey = "pk_your_publisher_key";

    [SerializeField]
    private string slotId =
        "8b1f2c3d-0000-0000-0000-000000000000";

    [Header("UI")]
    [SerializeField]
    private RawImage bannerImage;

    [SerializeField]
    private GameObject bannerContainer;

    private Adx adx;
    private bool destroyed;

    private void Awake()
    {
        adx = new Adx(apiKey);

        if (bannerContainer != null)
        {
            bannerContainer.SetActive(false);
        }
    }

    private void Start()
    {
        StartCoroutine(LoadAdvertisement());
    }

    private IEnumerator LoadAdvertisement()
    {
        Ad loadedAd = null;

        yield return adx.RequestAd(
            new AdRequest
            {
                SlotId = slotId
            },
            ad =>
            {
                loadedAd = ad;
            }
        );

        if (destroyed || loadedAd == null || !loadedAd.Filled)
        {
            HideBanner();
            yield break;
        }

        if (
            loadedAd.Creative == null ||
            string.IsNullOrWhiteSpace(
                loadedAd.Creative.AssetUrl
            )
        )
        {
            HideBanner();
            yield break;
        }

        using UnityWebRequest request =
            UnityWebRequestTexture.GetTexture(
                loadedAd.Creative.AssetUrl
            );

        yield return request.SendWebRequest();

        if (
            destroyed ||
            request.result != UnityWebRequest.Result.Success
        )
        {
            HideBanner();
            yield break;
        }

        Texture2D texture =
            DownloadHandlerTexture.GetContent(request);

        if (bannerImage == null || texture == null)
        {
            if (texture != null)
            {
                Destroy(texture);
            }

            HideBanner();
            yield break;
        }

        bannerImage.texture = texture;

        if (bannerContainer != null)
        {
            bannerContainer.SetActive(true);
        }

        // A custom renderer should measure visibility before reporting.
        // Do not report here unless the viewability threshold is met.
    }

    private void HideBanner()
    {
        if (bannerContainer != null)
        {
            bannerContainer.SetActive(false);
        }
    }

    private void OnDestroy()
    {
        destroyed = true;

        if (
            bannerImage != null &&
            bannerImage.texture != null
        )
        {
            Destroy(bannerImage.texture);
            bannerImage.texture = null;
        }
    }
}
```

Adapt the creative model, callback behavior, and coroutine signatures to the exact package API.

The managed `AdxBanner` component is preferable when custom rendering is unnecessary.

---

## Image Creative Rendering

Image advertisements use a remote creative asset URL.

A custom image workflow generally includes:

1. Request the advertisement.
2. Confirm `ad.Filled`.
3. Confirm the creative kind is an image.
4. Validate the asset URL.
5. Download the image through `UnityWebRequestTexture`.
6. Assign the texture to a `RawImage`.
7. Preserve the expected aspect ratio.
8. Measure viewability.
9. Report the impression after eligibility.
10. Handle intentional pointer clicks.

Conceptual download:

```csharp
using UnityEngine.Networking;

using UnityWebRequest request =
    UnityWebRequestTexture.GetTexture(
        ad.Creative.AssetUrl
    );

yield return request.SendWebRequest();

if (
    request.result ==
    UnityWebRequest.Result.Success
)
{
    Texture2D texture =
        DownloadHandlerTexture.GetContent(
            request
        );

    rawImage.texture = texture;
}
```

Always dispose downloaded textures when the placement is destroyed or replaced.

---

## Aspect Ratio Handling

Avoid stretching an advertisement creative.

A `RawImage` can use its UV rectangle and `RectTransform` with an `AspectRatioFitter`.

Recommended hierarchy:

```text
AdContainer
└── BannerRawImage
    ├── RawImage
    ├── AspectRatioFitter
    └── AdxBanner
```

Possible `AspectRatioFitter` modes include:

* Fit In Parent
* Envelope Parent
* Width Controls Height
* Height Controls Width

Select the behavior that matches the placement design.

Do not distort creative dimensions merely to fill available space.

---

## HTML and OpenRTB Creatives

Unity does not include a universal cross-platform HTML advertisement view in its standard UI system.

The exact handling of HTML or OpenRTB creatives depends on the SDK implementation and platform-specific renderer available to the host application.

Possible approaches include:

* A supported SDK-provided renderer
* A platform-specific WebView package
* A native mobile WebView integration
* A custom creative renderer
* Restricting the publisher slot to image creatives

When implementing HTML rendering, consider:

* Navigation restrictions
* JavaScript behavior
* Native bridge exposure
* External-link validation
* File-system access
* Local-resource access
* Mixed-content behavior
* Explicit creative dimensions
* Click-tracking integrity
* Application lifecycle
* Platform compatibility

Do not expose privileged Unity or native functions to untrusted advertisement JavaScript.

Verify the exact creative types supported by `AdxBanner` before enabling HTML demand for a production slot.

---

## Viewability Tracking

A filled response should not be counted as a viewable impression merely because it was downloaded.

The standard viewability requirement described by this integration is:

* At least 50% of the advertisement visible
* For at least one continuous second

The managed `AdxBanner` component handles viewability automatically according to the SDK implementation.

For a managed integration:

```text
AdxBanner loads creative
        ↓
Banner becomes visible
        ↓
Visible area reaches at least 50%
        ↓
Visibility remains eligible for one second
        ↓
Viewability beacon is reported
```

When using `Adx` directly, the application is responsible for determining when the threshold has been met.

---

## Custom Viewability Considerations

A custom Unity implementation should consider:

* Canvas visibility
* `GameObject.activeInHierarchy`
* `CanvasGroup.alpha`
* Screen-space bounds
* Parent masks
* ScrollRect clipping
* Scene visibility
* Application focus
* Application pause state
* Opaque overlays
* Orientation changes
* Resolution changes
* Component destruction
* Creative-load completion
* Duplicate reports

Do not report viewability when:

* The GameObject is inactive
* The application is paused
* The application has lost focus
* The banner is outside the visible screen
* More than half of the banner is clipped
* The creative has not finished rendering
* Another opaque panel covers the placement
* The one-second duration has not completed

---

## Manual Viewability Reporting

After your renderer confirms eligibility:

```csharp
if (
    ad.IsTrackable &&
    !string.IsNullOrEmpty(ad.ImpId)
)
{
    StartCoroutine(
        adx.ReportViewable(ad.ImpId)
    );
}
```

The viewability beacon is best effort.

A tracking failure should not:

* Crash the game
* Freeze gameplay
* Remove an already-rendered creative
* Trigger an uncontrolled retry loop
* Block scene transitions

House advertisements may not have a trackable impression ID.

Always check `IsTrackable` and `ImpId`.

---

## Click Handling

The managed banner handles click behavior according to the SDK implementation.

A custom banner can register Unity pointer events through:

* `Button`
* `EventTrigger`
* `IPointerClickHandler`
* A transparent interaction component attached to the same visible placement

Conceptual custom handler:

```csharp
using Theaimart.Adx;
using UnityEngine;
using UnityEngine.EventSystems;

public sealed class AdClickHandler :
    MonoBehaviour,
    IPointerClickHandler
{
    public Adx AdxClient { get; set; }

    public string ImpressionId { get; set; }

    public void OnPointerClick(
        PointerEventData eventData
    )
    {
        if (
            AdxClient == null ||
            string.IsNullOrEmpty(ImpressionId)
        )
        {
            return;
        }

        string clickUrl =
            AdxClient.ClickUrl(ImpressionId);

        if (
            clickUrl.StartsWith("https://") ||
            clickUrl.StartsWith("http://")
        )
        {
            Application.OpenURL(clickUrl);
        }
    }
}
```

Use the exact click URL method exposed by the package.

A custom handler should:

* Require intentional user input
* Accept only HTTP and HTTPS URLs
* Avoid automatic navigation
* Avoid invisible click regions
* Avoid duplicate opens
* Preserve the registered impression relationship
* Handle missing impression IDs safely

---

## Ad Response Model

`RequestAd` returns an `Ad` model representing a filled advertisement or no-fill result.

Typical properties include:

| Property            | Description                                    |
| ------------------- | ---------------------------------------------- |
| `Filled`            | Whether an eligible advertisement was returned |
| `Kind`              | Normalized creative kind                       |
| `Source`            | Normalized demand source                       |
| `ImpId`             | Impression identifier                          |
| `IdentityId`        | Identity value returned by the backend         |
| `Creative`          | Creative payload                               |
| `Auction`           | Auction-related metadata                       |
| `Reason`            | No-fill or failure reason                      |
| `RetryAfterSeconds` | Suggested retry delay                          |
| `IsTrackable`       | Whether viewability can be reported            |
| `Raw`               | Original or normalized backend response        |

The exact types and capitalization are defined by the installed package.

### Filled advertisement

```csharp
if (ad.Filled)
{
    Debug.Log("Advertisement available");
}
```

### No-fill response

```csharp
if (!ad.Filled)
{
    Debug.Log($"No fill: {ad.Reason}");
}
```

### Trackable response

```csharp
if (
    ad.IsTrackable &&
    !string.IsNullOrEmpty(ad.ImpId)
)
{
    StartCoroutine(
        adx.ReportViewable(ad.ImpId)
    );
}
```

### Retry guidance

```csharp
if (
    !ad.Filled &&
    ad.RetryAfterSeconds > 0
)
{
    Debug.Log(
        $"Retry after {ad.RetryAfterSeconds} seconds"
    );
}
```

Do not create a tight automatic retry loop.

---

## Demand Sources

The SDK normalizes contract-defined demand outcomes such as:

* Internal
* OpenRTB
* House
* No-fill

### Internal demand

An advertisement supplied through demand managed directly within Theaimart ADX.

### OpenRTB demand

An advertisement returned through an OpenRTB-compatible demand integration or auction.

### House advertisement

A publisher- or platform-managed fallback advertisement.

House advertisements may not contain an impression ID and may not be trackable.

### No-fill

A valid outcome indicating that no eligible advertisement was available.

No-fill should be handled as a normal advertising state rather than a gameplay failure.

---

## Four-Way Union Parsing

The backend can return four logical outcomes:

1. Internal advertisement
2. OpenRTB advertisement
3. House advertisement
4. No-fill response

The Unity SDK normalizes these into one `Ad` model.

Conceptual handling:

```csharp
if (!ad.Filled)
{
    HandleNoFill(ad);
    return;
}

switch (ad.Source)
{
    case AdSource.Internal:
        HandleInternalAd(ad);
        break;

    case AdSource.OpenRtb:
        HandleOpenRtbAd(ad);
        break;

    case AdSource.House:
        HandleHouseAd(ad);
        break;
}
```

Use the exact enum names exported by the package.

Malformed or incomplete payloads fail closed rather than becoming partially initialized filled advertisements.

This protects the game from:

* Null-reference errors
* Invalid creative access
* Missing impression identifiers
* Incorrect tracking
* Unsupported creative rendering
* Unsafe response assumptions

---

## User-Agent and Device Classification

The SDK sends a dedicated Unity User-Agent in this family:

```text
theaimart-adx-unity/<version> (<platform>)
```

Examples:

```text
theaimart-adx-unity/1.0.0 (Android)
theaimart-adx-unity/1.0.0 (iPhone)
```

The platform-aware User-Agent:

* Identifies the official Unity SDK
* Communicates the SDK version
* Includes a recognizable platform token
* Supports Android and iOS classification
* Avoids generic HTTP-client identifiers
* Reduces false bot classification
* Prevents silent no-fill caused by blocked User-Agents
* Improves backend device recognition

The User-Agent behavior follows [CONTRACT.md section 6](../../CONTRACT.md).

---

## Why the Explicit User-Agent Matters

Unity networking behavior can vary by platform and player configuration.

A generic or missing User-Agent may not reliably identify:

* The SDK
* The operating system
* The device family
* The application environment

Generic HTTP-client identifiers can also match backend bot-protection rules.

This can result in:

* Silent no-fill
* Incorrect platform classification
* Incorrect device analytics
* Fraud-risk scoring
* Reduced fill rate
* Misclassified traffic

The SDK therefore sends a purpose-built Theaimart ADX Unity User-Agent.

Avoid overriding it unless the replacement preserves the contract-required SDK and platform identity.

---

## SQL-Filter-Safe Encoding

Real page URLs, deep links, scene names, and free-text metadata can contain strings resembling SQL keywords or security-sensitive values.

Examples include:

```text
end
open
cast
select
@
```

These values can appear legitimately inside:

* URLs
* Deep links
* Query parameters
* Scene identifiers
* User-generated text
* Search terms
* Campaign values
* Content metadata
* Email-like identifiers

A strict Web Application Firewall can reject raw query values containing these patterns.

The SDK byte-percent-encodes contract-defined free-text parameters before transmission.

Example value:

```text
https://example.com/open-world/game?player=user@example.com
```

The SDK applies the wire-contract encoding before constructing the final request.

This behavior:

* Preserves legitimate values
* Avoids WAF false positives
* Prevents normal URLs from causing HTTP 403 responses
* Produces deterministic request data
* Prevents malformed query construction
* Keeps backend filtering compatible with real application traffic

The encoding requirements follow [CONTRACT.md section 7](../../CONTRACT.md).

Do not manually encode values unless the wire contract explicitly requires it.

Manual pre-encoding can cause double encoding.

---

## Error and No-Fill Handling

The Unity SDK follows a fail-closed policy.

Operational failures should result in no-fill instead of an exception escaping into gameplay code.

Possible failure conditions include:

* No internet connection
* DNS failure
* Connection timeout
* HTTP 403
* HTTP 500
* Invalid JSON
* Missing response fields
* Unsupported response variant
* Missing asset URL
* Image-download failure
* Invalid impression ID
* Destroyed Unity object
* Scene unload during a request
* Viewability-beacon failure
* Click-navigation failure

Expected behavior:

```text
Unexpected operational failure → no-fill
```

Unsafe behavior avoided:

```text
Unexpected operational failure → unhandled exception or game crash
```

Recommended handling:

```csharp
StartCoroutine(
    adx.RequestAd(
        new AdRequest
        {
            SlotId = "your-slot-id"
        },
        ad =>
        {
            if (!ad.Filled)
            {
                adContainer.SetActive(false);
                return;
            }

            adContainer.SetActive(true);
        }
    )
);
```

Advertising should not block gameplay, progression, navigation, or essential UI.

---

## No-Fill Handling

No-fill can occur because of:

* No eligible campaign
* Geographic targeting
* Device targeting
* Privacy state
* Frequency limits
* Fraud-risk classification
* Temporary demand shortage
* Auction timeout
* Slot configuration
* Unsupported creative type
* Backend protection rules

Recommended behavior:

* Hide the placement
* Collapse the layout region
* Continue gameplay normally
* Respect retry guidance
* Log the reason in development builds where appropriate

Avoid:

* Infinite retry loops
* Re-requesting every frame
* Leaving a large empty placeholder
* Blocking scene progression
* Showing a fatal error
* Reporting viewability for no-fill
* Opening a click URL without a valid ad

---

## API Reference

### `Adx`

Creates a Theaimart ADX client.

```csharp
var adx = new Adx(
    "pk_your_publisher_key"
);
```

Depending on the released package, configuration may also include:

* API base URL
* Timeout
* User-Agent
* Transport settings
* Strict error behavior
* Test overrides

Use production defaults unless a controlled environment requires an override.

---

### `AdRequest`

Defines the advertisement request.

```csharp
var request = new AdRequest
{
    SlotId =
        "8b1f2c3d-0000-0000-0000-000000000000"
};
```

Contract-supported fields can include:

* `SlotId`
* `SlotName`
* `PageUrl`
* `PageKeywords`
* `UsPrivacy`
* `EuconsentV2`
* `UserAgent`
* `ClientIp`
* `IdentityCookie`

Use the exact public fields or properties exposed by the installed package.

---

### `RequestAd`

Requests an advertisement through a Unity coroutine.

```csharp
StartCoroutine(
    adx.RequestAd(
        request,
        ad =>
        {
            // Handle filled or no-fill response.
        }
    )
);
```

The callback receives a normalized `Ad`.

Normal operational failures are represented as no-fill.

---

### `ReportViewable`

Reports a viewable impression:

```csharp
StartCoroutine(
    adx.ReportViewable(
        impressionId
    )
);
```

Call it only after:

* The ad is trackable
* The impression ID is valid
* The creative has rendered
* The required viewability threshold has been met

---

### `ClickUrl`

Where exposed by the installed package, generates the registered click-tracking URL:

```csharp
string clickUrl =
    adx.ClickUrl(impressionId);
```

Accept only safe HTTP or HTTPS URLs before passing them to `Application.OpenURL`.

---

### `AdxBanner`

A managed Unity component for loading and displaying a banner advertisement.

Typical responsibilities include:

* Request execution
* Response parsing
* Image downloading
* `RawImage` assignment
* Viewability detection
* Impression reporting
* Click handling
* No-fill behavior
* Failure isolation

Use the Inspector fields and public component API provided by the installed package.

---

## Unity Lifecycle

Unity objects can be destroyed while network requests or timers are active.

A production integration should account for:

* `Awake`
* `OnEnable`
* `Start`
* `OnDisable`
* `OnDestroy`
* Scene unload
* Application pause
* Application focus
* Domain reload in the editor
* Component re-enabling
* Duplicate requests

### Recommended lifecycle behavior

* Create the client once per owning service or component.
* Avoid requesting on every `Update`.
* Avoid requesting every time layout changes.
* Stop or ignore late callbacks after destruction.
* Cancel viewability timers on disable.
* Do not report impressions while paused.
* Prevent duplicate loads for the same placement.
* Dispose downloaded textures.
* Reset the placement when the slot changes.

---

## Persistent Ad Service

A project can expose one reusable advertising service.

```csharp
using Theaimart.Adx;
using UnityEngine;

public sealed class AdService : MonoBehaviour
{
    public static AdService Instance { get; private set; }

    public Adx Client { get; private set; }

    [SerializeField]
    private string apiKey = "pk_your_publisher_key";

    private void Awake()
    {
        if (
            Instance != null &&
            Instance != this
        )
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);

        Client = new Adx(apiKey);
    }
}
```

Use a persistent service only when it matches the application's architecture.

Avoid unintentionally preserving scene-specific banners across scene transitions.

---

## Scene Management

When a scene containing an advertisement unloads:

* Stop viewability measurement.
* Prevent late UI mutation.
* Dispose creative textures.
* Remove click handlers.
* Avoid carrying stale impression IDs into the next scene.
* Ensure persistent clients do not retain destroyed UI references.

For scene-specific banners, keep the `AdxBanner` component inside the scene.

For application-wide configuration, keep only the reusable client or configuration service persistent.

---

## Application Pause and Focus

Unity exposes:

```csharp
private void OnApplicationPause(bool paused)
{
}

private void OnApplicationFocus(bool focused)
{
}
```

A custom viewability implementation should pause eligibility while:

* The application is backgrounded
* The player window loses focus
* The operating system covers the application
* A full-screen overlay obscures the banner

Do not count background time toward the one-second visibility requirement.

---

## Android Integration Notes

For Android builds:

* Preserve the SDK-generated Android User-Agent.
* Use HTTPS production endpoints.
* Verify internet permission in the generated player.
* Test on the minimum Android API supported by the game.
* Test on recent Android versions.
* Test physical devices and emulators.
* Test portrait and landscape layouts.
* Test application pause and resume.
* Test slow and unreliable networks.
* Test release builds using IL2CPP where applicable.
* Test different screen densities.
* Verify `Application.OpenURL` behavior.
* Verify the banner remains inside safe visual bounds.
* Verify image memory usage on low-memory devices.

The Unity Android player normally includes internet access when networking is used, but production manifests should still be verified.

---

## Android Build Considerations

Test the SDK with the project's selected:

* Scripting backend
* API compatibility level
* Minimum API level
* Target API level
* Managed code stripping level
* Gradle template customization
* IL2CPP configuration
* ARM architectures
* Release signing configuration

If the SDK uses reflection in its bundled JSON parser or model mapping, verify that managed code stripping does not remove required types.

Use a `link.xml` file only when necessary and supported by the package.

---

## iOS Integration Notes

For iOS builds:

* Use HTTPS production endpoints.
* Verify App Transport Security compatibility.
* Test on physical iPhones.
* Test on iPad where supported.
* Test safe-area layouts.
* Test portrait and landscape orientations.
* Verify application pause and resume.
* Test IL2CPP builds.
* Verify external URL handling.
* Verify banner behavior during scene changes.
* Test memory pressure.
* Review App Store privacy and advertising requirements.
* Validate any HTML renderer separately.

Use only public publisher credentials inside the application.

---

## iOS Build Considerations

Test the exported Xcode project with:

* The supported minimum iOS version
* The current Xcode version used for release
* Device and simulator targets where applicable
* IL2CPP
* ARM64
* Release code stripping
* App Transport Security
* Associated URL behavior
* Privacy manifest requirements applicable to the application

The exact SDK package may not require native post-processing, but the final Xcode project should still be validated.

---

## Editor and Device Testing

The Unity Editor is useful for:

* Request debugging
* Parsing tests
* Encoding tests
* Basic UI integration
* Local mock-server testing
* No-fill behavior
* Inspector configuration

However, editor behavior does not fully represent mobile player behavior.

Always test:

* Android development build
* Android release build
* iOS development build
* iOS release build
* Physical mobile devices
* Slow network conditions
* Offline mode
* Application pause and resume
* Orientation changes
* Scene changes
* Different screen sizes
* Viewability thresholds
* Click navigation

---

## Production Recommendations

For a reliable production integration:

1. Use a public publisher key assigned to the application.
2. Use a separate slot ID for every meaningful placement.
3. Use `AdxBanner` for standard image-banner integrations.
4. Use `Adx` directly only when custom rendering is required.
5. Preserve the SDK-generated User-Agent.
6. Use HTTPS endpoints.
7. Do not report impressions before viewability is met.
8. Prevent duplicate viewability beacons.
9. Hide or collapse no-fill placements.
10. Avoid retrying every frame.
11. Dispose downloaded textures.
12. Ignore callbacks after object destruction.
13. Stop viewability measurement while paused.
14. Test scene transitions.
15. Test editor and device builds.
16. Test Android and iOS independently.
17. Verify IL2CPP compatibility.
18. Verify managed code stripping.
19. Never embed administrative credentials.
20. Follow applicable platform, privacy, and advertising policies.

---

## Recommended Placement Practices

Good advertisement placement should:

* Remain clearly distinct from game controls
* Avoid obstructing gameplay
* Avoid covering critical HUD elements
* Fit inside explicit bounds
* Respect safe areas
* Preserve intentional interaction
* Collapse after no-fill
* Remain visible before impression reporting
* Avoid accidental clicks
* Maintain acceptable performance
* Remain accessible where applicable

Avoid:

* Hidden advertisements
* Invisible click regions
* One-pixel placements
* Ads underneath opaque UI
* Automatic click opening
* Ads next to high-frequency gameplay buttons
* Reporting off-screen impressions
* Re-requesting every frame
* Blocking gameplay after no-fill
* Unrestricted HTML content
* Misleading creatives that imitate game UI

---

## Security Guidance

### Use only public publisher keys

Unity application builds can be inspected.

Only embed a key intended for client-side publisher use:

```text
pk_your_publisher_key
```

Do not embed:

* Administrative API keys
* Cloud-provider credentials
* Database passwords
* Private signing keys
* Infrastructure tokens
* Billing credentials
* Server-side authentication secrets

---

## Safe Click URLs

Before opening a custom click URL, require:

```text
https://
```

or:

```text
http://
```

Reject schemes such as:

```text
javascript:
file:
intent:
data:
vbscript:
```

Conceptual validator:

```csharp
private static bool IsSafeUrl(string value)
{
    if (
        !System.Uri.TryCreate(
            value,
            System.UriKind.Absolute,
            out System.Uri uri
        )
    )
    {
        return false;
    }

    return
        uri.Scheme ==
        System.Uri.UriSchemeHttps ||
        uri.Scheme ==
        System.Uri.UriSchemeHttp;
}
```

Use the SDK's managed click behavior where practical.

---

## Privacy Signals

Where supported by `AdRequest`, forward accurate privacy values:

```csharp
var request = new AdRequest
{
    SlotId = "privacy-aware-slot",
    UsPrivacy = "1YNN",
    EuconsentV2 = consentString
};
```

The game or application remains responsible for:

* Determining applicable privacy requirements
* Collecting consent
* Respecting opt-out choices
* Forwarding accurate signals
* Maintaining a privacy policy
* Configuring identity behavior
* Avoiding ad requests that conflict with user preferences

Do not fabricate consent values.

---

## Identity Values

Where supported, an identity value can be included:

```csharp
var request = new AdRequest
{
    SlotId = "identity-enabled-slot",
    IdentityCookie = identityValue
};
```

Treat identity values as untrusted data.

Applications should:

* Validate size and format
* Avoid unnecessary logging
* Respect consent and opt-out state
* Avoid exposing identity values to unrelated systems
* Avoid treating identity values as authentication
* Follow the wire contract
* Apply appropriate storage and retention controls

---

## Performance and Memory

Advertising should not materially affect gameplay.

Recommended practices:

* Reuse the `Adx` client.
* Avoid loading on every frame.
* Avoid duplicate banner components.
* Use bounded request timeouts.
* Constrain creative dimensions.
* Dispose old textures.
* Avoid repeated WebView creation.
* Stop viewability checks after reporting.
* Clear timers on disable or destroy.
* Avoid retaining large raw response objects.
* Test low-memory Android devices.
* Profile CPU, memory, and network behavior.
* Test scene reloads for leaks.

---

## Texture Disposal

Textures downloaded at runtime consume native memory.

When replacing or destroying an advertisement:

```csharp
if (
    bannerImage != null &&
    bannerImage.texture != null
)
{
    Destroy(bannerImage.texture);
    bannerImage.texture = null;
}
```

Avoid destroying shared project assets.

Only destroy textures created specifically for the runtime advertisement placement.

---

## Retry Behavior

Do not retry immediately after every no-fill response.

No-fill can be a valid outcome caused by:

* No eligible campaign
* Targeting mismatch
* Fraud-risk policy
* Geographic restrictions
* Privacy state
* Frequency limits
* Temporary demand shortage
* Auction timeout
* Unsupported creative type

Respect retry guidance where exposed:

```csharp
if (
    !ad.Filled &&
    ad.RetryAfterSeconds > 0
)
{
    StartCoroutine(
        RetryAfter(
            ad.RetryAfterSeconds
        )
    );
}
```

Conceptual delay:

```csharp
private IEnumerator RetryAfter(
    float seconds
)
{
    yield return new WaitForSecondsRealtime(
        seconds
    );

    yield return LoadAdvertisement();
}
```

Avoid:

* Recursive immediate retries
* Multiple parallel requests
* Retrying every `Update`
* Retrying whenever layout changes
* Ignoring backend retry guidance
* Creating duplicate impressions

---

## Testing

Open Unity Test Runner:

```text
Window → General → Test Runner
```

Select:

```text
EditMode
```

Then choose:

```text
Run All
```

The Edit Mode test suite covers platform-independent SDK behavior such as:

* `AdxEncoding`
* Ad-model parsing
* Internal-ad parsing
* OpenRTB parsing
* House-ad parsing
* No-fill parsing
* Invalid-response behavior
* Trackability logic
* Request-value encoding

Rendering and live networking require Play Mode or a built player.

---

## Recommended Test Matrix

| Scenario                            | Expected behavior           |
| ----------------------------------- | --------------------------- |
| Internal filled response            | Parsed as internal demand   |
| OpenRTB response                    | Parsed correctly            |
| House response                      | Parsed as house demand      |
| No-fill response                    | `Filled` is false           |
| Invalid JSON                        | Safe no-fill                |
| HTTP 403                            | Safe no-fill                |
| HTTP 500                            | Safe no-fill                |
| Network timeout                     | Safe no-fill                |
| Offline device                      | Safe no-fill                |
| Missing asset URL                   | Safe rendering failure      |
| Invalid image                       | Placement hides safely      |
| Valid image                         | Texture renders             |
| Missing impression ID               | Not trackable               |
| Valid impression ID                 | Viewability can report      |
| Less than 50% visible               | No impression               |
| At least 50% visible for one second | Impression reports once     |
| Component disabled                  | Measurement stops           |
| Scene unloaded                      | No stale UI update          |
| Application paused                  | No viewability accumulation |
| Safe HTTPS click URL                | Opens intentionally         |
| Unsafe click scheme                 | Rejected                    |
| SQL-like text in URL                | Encoded correctly           |
| Android User-Agent                  | Includes Android token      |
| iOS User-Agent                      | Includes Apple token        |

---

## Play Mode Testing

Play Mode tests can verify:

* Coroutine behavior
* `UnityWebRequest`
* `RawImage` rendering
* Texture lifecycle
* Banner visibility
* Viewability timers
* Pointer clicks
* Component disable and destroy
* Scene changes
* Application focus behavior where testable

A local mock server can simulate:

* Filled image advertisements
* OpenRTB responses
* House ads
* No-fill
* HTTP 403
* HTTP 500
* Slow responses
* Invalid JSON
* Broken image URLs
* Viewability responses
* WAF-sensitive URLs

---

## Device Testing

Before release, test at minimum:

### Android

* One lower-memory device
* One recent Android device
* Portrait and landscape
* Development build
* Release build
* IL2CPP
* Slow connection
* Offline mode
* Background and resume
* Scene changes
* External click handling

### iOS

* Physical iPhone
* iPad where supported
* Development build
* Release build
* IL2CPP
* Safe-area layouts
* Background and resume
* Orientation changes
* External click handling
* Memory pressure

---

## Development

The package is located at:

```text
packages/unity
```

Open a Unity project that includes the local package or Git package.

Run Edit Mode tests:

```text
Window → General → Test Runner → EditMode → Run All
```

Run Play Mode tests where available:

```text
Window → General → Test Runner → PlayMode → Run All
```

Before publishing a new package version:

1. Run all Edit Mode tests.
2. Run all Play Mode tests.
3. Test Android networking.
4. Test iOS networking.
5. Test image rendering.
6. Test no-fill behavior.
7. Test click handling.
8. Test viewability reporting.
9. Test WAF-safe encoding.
10. Test scene transitions.
11. Test component destruction.
12. Test IL2CPP builds.
13. Verify package metadata.
14. Verify assembly definitions.
15. Verify the minimum Unity version.
16. Verify documentation examples.
17. Confirm the wire contract version.
18. Confirm the SDK User-Agent version.
19. Confirm the Apache-2.0 license.
20. Tag the release before production installation.

---

## Package Structure

A typical Unity Package Manager layout can include:

```text
packages/unity/
├── package.json
├── README.md
├── LICENSE
├── Runtime/
│   ├── Theaimart.Adx.asmdef
│   ├── Adx.cs
│   ├── AdRequest.cs
│   ├── Ad.cs
│   ├── AdxBanner.cs
│   ├── AdxEncoding.cs
│   └── ...
├── Tests/
│   └── EditMode/
│       ├── Theaimart.Adx.Tests.asmdef
│       └── ...
└── Documentation~/
```

The repository's actual package structure remains authoritative.

---

## Frequently Asked Questions

### What is `co.theaimart.adx`?

It is the official Unity Package Manager SDK for integrating Theaimart ADX advertisements into Unity games and applications.

### Which Unity versions are supported?

Unity 2020.3 and later.

### Does the package have third-party runtime dependencies?

No.

It uses `UnityWebRequest` and a small bundled JSON parser.

### How do I install it?

Add this Git dependency:

```text
https://github.com/theaimartco/theaimart-adx-sdks.git?path=packages/unity
```

through `Packages/manifest.json` or Unity Package Manager.

### Does it support Android?

Yes.

### Does it support iOS?

Yes.

### Does it include a banner component?

Yes. Attach `AdxBanner` to a suitable Unity UI `RawImage`.

### Does the banner require a Canvas?

Yes. The drop-in banner is based on Unity UI.

### Does it require an EventSystem?

An active `EventSystem` is required for normal Unity UI click interaction.

### Can I request advertisements through code?

Yes. Create an `Adx` client and run `RequestAd` as a coroutine.

### How are network requests performed?

Using `UnityWebRequest`.

### How are JSON responses parsed?

Using the small JSON parser bundled with the package.

### Does the SDK support OpenRTB?

Yes. The parser handles OpenRTB as one of the contract-defined response variants.

### What is a house advertisement?

A house advertisement is publisher- or platform-managed fallback inventory.

### Are house ads trackable?

Not necessarily. Check `ad.IsTrackable` and `ad.ImpId`.

### What happens when no advertisement is available?

The SDK returns a no-fill `Ad` where `Filled` is false.

### Can a network failure crash the game?

The SDK is designed to fail closed. Operational failures should produce no-fill instead of an uncaught exception.

### Why does the SDK send a custom User-Agent?

The custom User-Agent identifies the Unity SDK and device platform while avoiding generic identifiers that may be classified as bot traffic.

### What User-Agent does it use?

A value in this family:

```text
theaimart-adx-unity/<version> (<platform>)
```

### Why does the SDK encode free-text parameters?

Real URLs can contain SQL-like text that triggers backend WAF rules. The SDK applies contract-compliant encoding to prevent false-positive rejection.

### Should I manually encode page URLs?

Normally, no. Pass the original value and let the SDK apply the required encoding.

### Does the SDK report viewability automatically?

The managed `AdxBanner` component handles viewability automatically according to its implementation.

### When should I report viewability manually?

Only when using a custom renderer and after the advertisement is at least 50% visible for at least one second.

### Can I report immediately after receiving the response?

No. A downloaded advertisement is not necessarily viewable.

### How are image ads rendered?

Typically by loading the creative texture and displaying it through a Unity UI `RawImage`.

### How are clicks opened?

Managed banners handle clicks automatically. Custom integrations can use the SDK-generated click URL with `Application.OpenURL`.

### Should I accept every URL scheme?

No. Only open HTTP and HTTPS destinations.

### Does the SDK render HTML advertisements?

Verify the exact HTML/OpenRTB rendering support against the installed package. Unity requires a compatible WebView implementation for HTML content.

### Should I install a WebView package?

Only when HTML creatives are required and the chosen renderer is supported by your target platforms.

### Can I create one `Adx` client and reuse it?

Yes. Reusing a client is generally preferable when configuration is shared.

### Should I create requests inside `Update`?

No. Never request advertisements every frame.

### What happens when the scene unloads?

Scene-specific banner objects are destroyed. Custom code must prevent late callbacks from mutating destroyed objects and should dispose downloaded textures.

### Does it work with IL2CPP?

The package should be tested with the project's IL2CPP configuration before production release.

### Does it work with managed code stripping?

Verify the package with the project's selected stripping level, particularly if model parsing relies on reflection.

### Can I put a private server key in the game?

No. Use only a public publisher key intended for client-side distribution.

### How should no-fill affect gameplay?

It should not affect gameplay. Hide or collapse the placement and continue normally.

### Should I retry immediately after no-fill?

No. Respect retry guidance and avoid uncontrolled loops.

### How do I run tests?

Open:

```text
Window → General → Test Runner
```

Select Edit Mode and run all tests.

---

## Unity Game Monetization with Theaimart ADX

The Theaimart ADX Unity SDK is intended for developers building:

* Android games
* iOS games
* Mobile Unity applications
* Casual games
* Puzzle games
* Strategy games
* Simulation games
* Educational applications
* AI-powered games
* Utility applications
* Interactive experiences
* Publisher applications
* Cross-platform mobile products
* Unity-based consumer software
* Free-to-play applications
* Independently published games

The package provides a lightweight connection between Unity applications and Theaimart ADX while keeping networking, parsing, viewability, and failure behavior predictable.

Learn more about Theaimart ADX:

https://adx.theaimart.co

---

## Wire Contract

The SDK implements version 1 of the Theaimart ADX wire contract:

```text
../../CONTRACT.md
```

Relevant contract areas include:

* Publisher authentication
* Advertisement request structure
* Slot identifiers
* Page and application context
* User-Agent requirements
* Device classification
* Free-text encoding
* Privacy signals
* Identity values
* Internal demand
* OpenRTB demand
* House advertisements
* No-fill responses
* Creative representation
* Impression identifiers
* Viewability reporting
* Click tracking
* Retry guidance
* Error handling

The Unity SDK and backend should remain compatible with the same contract version.

Breaking changes to request fields, response variants, creative models, encoding behavior, viewability rules, or tracking semantics should be introduced through an explicit wire-contract version update.

---

## License

Apache License 2.0.

Copyright © 2026 Theaimart.

Licensed under the Apache License, Version 2.0. You may not use this SDK except in compliance with the License.

Refer to the repository's `LICENSE` file for the complete license terms.
