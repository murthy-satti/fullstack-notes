# JavaScript Navigator and Device APIs

`navigator` exposes information and capabilities provided by the current
browser environment. It is not a reliable way to identify a person or
device. Feature availability and permission behavior vary, so feature-detect
APIs and handle denial or failure.

## Common `navigator` properties

| Property | Meaning and caution |
|---|---|
| `navigator.userAgent` | User-agent string; can be reduced, changed, or spoofed, so avoid browser detection when feature detection works |
| `navigator.language` | Preferred language reported by the browser |
| `navigator.onLine` | Best-effort online state; `true` does not prove a server is reachable |

Some values may be reduced for privacy. Do not use these properties as
authentication, authorization, or security signals.

## Capability APIs

| API | Typical use | Important considerations |
|---|---|---|
| `navigator.geolocation` | Request device location | Requires permission; can fail or be unavailable |
| `navigator.clipboard` | Read or write clipboard data | Usually requires a secure context and user permission/activation |
| `navigator.mediaDevices` | Discover/request camera or microphone access | Requires permission; handle device absence and denial |
| `navigator.serviceWorker` | Register or inspect service workers | Requires secure context except local development exceptions |
| `navigator.sendBeacon()` | Send small analytics/diagnostic data during page lifecycle changes | Not a general replacement for `fetch`; delivery is best effort |
| `navigator.share()` | Open the operating system's native share UI | Requires support and usually transient user activation |

Check for an API before using it, request permissions only when needed,
explain why the capability is useful, and provide a fallback.

## Practical examples

### Online/offline hints

```js
window.addEventListener("online", () => updateConnectionHint(true));
window.addEventListener("offline", () => updateConnectionHint(false));
```

The offline event is a hint that the browser's network state changed. A
real request can still fail while `navigator.onLine` is true.

### Feature detection

```js
if ("geolocation" in navigator) {
  // Offer location access only when the user requests the feature.
}
```

Check for an API before using it. Permission-sensitive APIs should be
invoked in response to an appropriate user action and failures should be
handled explicitly.

## Developer perspective and security

Device and browser information can contribute to fingerprinting. Collect
only what the feature requires and disclose sensitive capability requests.
Never trust client-reported platform, user-agent, online, or hardware
information for security decisions.

## Further learning

- [MDN: Navigator](https://developer.mozilla.org/en-US/docs/Web/API/Navigator)
- [MDN: Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [MDN: Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [MDN: MediaDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices)
- [MDN: Navigator online and offline events](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
