# Update Mechanisms and Updaters

Server software is updated by deploying it. Everything else updates
itself: a web app when the browser loads new files, a service worker when
the browser notices a changed script, a desktop app through its updater,
and a mobile app through its store or, for some code, over the air. Each
mechanism has its own rules for when the new version is found, verified,
installed, and started, and each one needs a way to stop a bad version
from spreading.

This lesson explains how software updates itself on each platform (web,
desktop, and mobile) and then the architecture of an updater: a static
manifest on a CDN or a dynamic update server, signature verification and
key rotation, full and delta updates, channels, percentage and cohort
rollouts with stable bucketing, halting and rolling forward, forced and
optional updates, keeping the update service available, and adoption
telemetry. Code signing, notarization, store review, and a basic update
server are covered in
[releasing desktop and mobile apps](../deployment-strategies/releasing-desktop-and-mobile-apps.md).

## Why it matters

- **An updater is a deployment system for machines you do not control.**
  It needs the same safety as a server pipeline (stages, health gates, a
  stop button), but it cannot roll back what it already installed.
- **It is a remote code execution channel by design.** Whoever controls
  the update feed controls every install. Signatures are what make that
  acceptable.
- **A broken updater strands users.** If a release breaks the update path
  itself, those installs never receive the fix. They stay on the broken
  version until users reinstall by hand.
- **Adoption speed sets your support window.** The faster installs move
  to new versions, the sooner the API can drop old behaviour (see
  [keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md)).
- **Bandwidth is real money.** A 150 MB desktop app updated on 1,000,000
  installs moves `150 MB x 1,000,000 = 150 TB` per release; if deltas
  average 15 MB, the same release moves 15 TB.

## Real-world usage

- **Electron's built-in updater.** Electron's
  [autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)
  is built on Squirrel.Mac on macOS and uses Squirrel.Windows (or the
  MSIX updater for MSIX packages) on Windows; it has no Linux support,
  and on macOS the app must be signed. Electron's
  [updates tutorial](https://www.electronjs.org/docs/latest/tutorial/updates)
  describes update.electronjs.org, a free service for apps with a public
  GitHub repository that publish builds to GitHub Releases.
- **Sparkle.** Sparkle's
  [publishing guide](https://sparkle-project.org/documentation/publishing/)
  documents appcast feeds with EdDSA signatures, delta updates, channels,
  critical updates that users cannot skip, and phased rollouts in seven
  groups released one interval apart; phased rollout does not apply to
  critical updates or to manual checks.
- **Mozilla Balrog.** Firefox's update server,
  [Balrog](https://mozilla-balrog.readthedocs.io/en/latest/database.html),
  matches each update request against rules on fields from the update URL
  (channel, version, build ID, OS version, and others), picks the
  highest-priority match, and uses a `backgroundRate` that sets the
  percentage of requests served the new release.
- **Google Omaha.** [Omaha](https://github.com/google/omaha) is the
  open-source version of Google Update, the Windows updater that keeps
  Chrome and other Google products up to date.
- **Android in-app updates.** Google Play's
  [in-app updates](https://developer.android.com/guide/playcore/in-app-updates/kotlin-java)
  offer a flexible flow (background download) and an immediate flow
  (full-screen, blocking), with an update priority from 0 to 5 set per
  release through the Play Developer API and a staleness count in days.
- **Over-the-air JavaScript.** Expo's
  [EAS Update](https://docs.expo.dev/eas-update/introduction/) updates the
  JavaScript, styling, and images of a React Native app without a store
  build, and only for builds with a matching runtime version. Microsoft's
  [App Center retirement notice](https://learn.microsoft.com/en-us/appcenter/retirement)
  confirms App Center, including CodePush, was retired on March 31, 2025;
  the standalone CodePush server Microsoft published instead was
  archived as read-only, without support, on May 20, 2025.

**Popular tools and providers:** Squirrel.Mac and Squirrel.Windows,
electron-updater (electron-builder), the Tauri updater plugin, Sparkle,
MSIX with App Installer, the Microsoft Store's gradual package rollout,
Google Play in-app updates and staged rollouts, App Store phased release,
Expo EAS Update, Workbox for service workers, Balrog, and Omaha.

## How it works

### Web apps: a reload is the update

A plain single-page app updates when the browser loads a new
`index.html`. Everything that makes that safe (hashed assets kept for
days, `no-cache` HTML, reload prompts for long-open tabs, chunk-error
recovery) is covered in
[keeping frontend and backend in sync](keeping-frontend-and-backend-in-sync.md).
A service worker adds a real install step with its own lifecycle.

### Service worker updates

A service worker sits between the page and the network, often serving
the app shell from a cache. Updating it follows fixed rules:

![Diagram: a deploy changes sw.js; the browser checks it on navigation (and on push or sync events if it has not checked in 24 hours), ignoring the HTTP cache by default, and installs it if it is byte-different. The new worker moves from installing (precache v2 files) to waiting (v1 still controls the open tabs) to activating (delete old caches) to activated (v2 controls new page loads). Three ways lead out of waiting: wait for every tab to close (default and safest, but one open tab delays it for days), prompt then reload (the page shows Update available, on click it posts a message so the worker calls skipWaiting, and on controllerchange the page reloads once), or call skipWaiting during install (fastest, but with clients.claim the new worker controls pages loaded by v1, mixing versions). A note recommends calling registration.update() hourly for long-open tabs, serving sw.js with no-cache, and keeping old hashed assets on the server.](service-worker-lifecycle.svg)

- **Finding the update.** The browser checks the worker script on
  navigation, and on functional events such as push and sync unless it
  checked within the previous 24 hours. By default it ignores HTTP caching
  headers for that check (the `updateViaCache` registration option
  changes this), and the worker counts as updated only if the script is
  byte-different. Embedding the build ID in `sw.js` guarantees that.
- **Why it waits.** The browser runs only one version of a worker for a
  set of pages at a time. While any tab is controlled by v1, v2 waits.
- **`skipWaiting()` trade-off.** Calling it makes the waiting worker
  active immediately. As Jake Archibald's
  [service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
  article puts it, the new worker is then likely controlling pages
  loaded with an older version; if that can break things, don't use it.
  A page built from v1 HTML and code, served by a v2 worker that deleted
  v1's caches, is exactly the mixed state that produces missing chunks.
- **The usual compromise.** Detect the waiting worker, show "Update
  available", and on click tell the worker to `skipWaiting()`, then reload
  once when `controllerchange` fires. The user chooses the moment, and the
  page and the worker change together.
- **Long-open tabs.** A tab that never navigates never checks. Call
  `registration.update()` on an interval (the article suggests hourly for
  sites kept open a long time).

### Desktop update frameworks

| Framework | Platforms | Update metadata | Worth knowing |
|---|---|---|---|
| Electron `autoUpdater` | macOS (Squirrel.Mac), Windows (Squirrel.Windows, or the MSIX updater for MSIX packages) | A feed URL from an update server or static storage | No Linux support; the macOS app must be signed |
| electron-updater (electron-builder) | Windows (NSIS), macOS (DMG plus ZIP), Linux (AppImage, DEB, RPM, Pacman) | `latest.yml`, `latest-mac.yml`, `latest-linux.yml` | `stagingPercentage` for staged rollouts, blockmap-based differential downloads, Windows code-signature checks; Squirrel.Windows is not supported |
| Tauri updater plugin | Windows, macOS, Linux | A static JSON file, or a dynamic server answering 200 with JSON or 204 | Signatures are mandatory and cannot be disabled; Windows install mode `passive` (default), `basicUi`, or `quiet` |
| Sparkle 2 | macOS | An RSS appcast | EdDSA signatures, delta updates, channels, critical updates, phased rollout in seven groups |
| MSIX with App Installer | Windows | An `.appinstaller` XML file | Checks on launch (`HoursBetweenUpdateChecks`, 0 to 255, default 24) or in the background every 8 hours; `UpdateBlocksActivation` forces the update; only changed 64 KB blocks are downloaded |

They all follow the same shape: ask whether a newer version exists,
download it, verify it, install it at a convenient moment, and restart.
The differences that matter for release engineering are where the
rollout decision is made, how signatures work, whether partial downloads
exist, and whether a downgrade is possible.

### Mobile: stores, in-app updates, and over-the-air code

- **Store updates.** Most users update through automatic store updates.
  You control the pace with Apple's phased release and Google Play's
  staged rollouts (details in the desktop and mobile lesson), and in
  Google Play halting stops further users from getting the version.
- **Android in-app updates.** The Play Core library tells the app that an
  update exists, how many days ago it appeared (`clientVersionStalenessDays`),
  and its priority (0 to 5, set with `inAppUpdatePriority` when the
  release is rolled out, and not changeable later). A common policy:
  prompt with the *flexible* flow (download in the background, restart
  when the user agrees) after a few days of staleness, and use the
  *immediate* flow (full screen until updated) only for priority 4 and
  above.
- **iOS.** There is no equivalent API. Apps compare their version with a
  minimum and a recommended version from your server and open their App
  Store page.
- **Over-the-air JavaScript updates.** In React Native apps, the
  JavaScript bundle and assets can be replaced without a store build.
  With EAS Update, a build belongs to a channel, the channel points to a
  branch of updates, and an update is delivered only to builds whose
  platform and *runtime version* match exactly; native code changes need
  a new runtime version and a new store build. By default the app checks
  for an update when it opens; if the download finishes within the
  configured timeout it runs immediately, otherwise on the next launch.

Store policies limit what over-the-air code may do. Apple's Developer
Program License Agreement (section 3.3.1(B)) allows downloaded
interpreted code only if it does not change the app's primary purpose,
does not bypass signing, sandbox, or other OS security features, and,
for App Store apps, does not create a storefront for other apps; App
Review guideline 2.5.2 forbids downloading code that introduces or
changes features. Google Play's
[Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/9888379)
forbids an app updating itself outside Google Play and downloading
executable code such as dex or `.so` files, with an exception for code
running in a virtual machine or interpreter with indirect access to
Android APIs, such as JavaScript in a WebView. In practice: use
over-the-air updates for fixes and small adjustments, and ship new
features through review.

### Static manifest or dynamic update server

![Diagram: on the left, a static manifest on a CDN: TaskFlow Desktop 1.9.0 fetches stable/latest.json, which is the same for every install; the app decides whether the version is newer and whether this install is inside a staging percentage computed on the device, then downloads the installer and signature from the CDN; strengths are cheap, cacheable, very highly available, nothing to operate; weaknesses are that a halt waits for the CDN cache to expire, rollout logic lives in every installed client, and there is no targeting by tenant. On the right, a dynamic update server: the app sends a check to an update service that evaluates rules on channel, version range, tenant pin, install bucket below the rollout percentage, halted releases, and blocked versions, and answers 200 with a manifest or 204 No Content, while installers still come from the CDN at immutable URLs; strengths are instant halts, cohorts, tenant pinning, forced updates, and a log of every check; weaknesses are a service on every client's critical path that needs high availability and a static fallback.](static-vs-dynamic-updater.svg)

**A static manifest** is a file per channel and platform (`latest.yml`,
an appcast, a Tauri JSON document) uploaded next to the installers. It is
cheap, cacheable, and as available as your CDN. Its limits: everyone gets
the same answer, so any rollout logic must run inside the installed app
(electron-updater's `stagingPercentage`, Sparkle's phased groups), and a
halt takes effect only when caches expire, so serve the manifest with a
short cache lifetime or purge it on every change.

**A dynamic update server** receives the installed version, platform,
architecture, channel, an install ID, and often a tenant ID, and decides
per request. That is how you get instant halts, cohort targeting, tenant
pinning ("this customer stays on 1.8 until their admin approves 1.9"),
blocklists of known-bad versions, and a log of every check. Mozilla's
Balrog and Google's Omaha are public examples. The cost: the server is on
every client's update path, so it needs high availability, caching, and a
fallback.

A common hybrid keeps the decision dynamic and everything heavy static:
the service returns a small manifest that points to immutable, versioned
artifact URLs on a CDN, and if the service is down the client simply
tries again later.

### The update sequence as a state machine

![Diagram: the updater moves from idle to checking on launch or a timer; a 204 means no update and back to idle; an offered update moves to downloading, where an interruption is resumed or retried with backoff; a complete download moves to verifying, where a failed signature deletes the file, reports the failure, and keeps version 1.9.0; a valid signature makes the update ready and staged; on quit or restart it installs, and a failed install leaves the old version and reports the error; after installation the app relaunches, and a crash on first run is reported so the server halts the rollout; after a healthy start the app reports its version and the result and returns to idle.](updater-state-machine.svg)

Two properties make an updater safe. Every failure before the install
leaves the old version untouched (download to a temporary location,
verify, and only then replace anything). Every failure after the install
is reported quickly enough to stop the rollout for everyone else. A
healthy first launch of the new version, reported back, is the most
important signal an updater sends.

### Signatures, key rotation, and attacks on updaters

There are two separate layers of trust:

1. **Operating system code signing** (Authenticode, Apple Developer ID,
   notarization) tells the OS who published the binary.
2. **Update signatures** let the installed app check that a download came
   from you, using a public key built into the app. Tauri requires them,
   Sparkle uses EdDSA (ed25519) keys created with its `generate_keys`
   tool, and electron-updater checks Windows code signatures before
   installing.

HTTPS alone is not enough: it protects the connection, not the content
of a compromised bucket, CDN, or update server. The
[TUF security model](https://theupdateframework.io/docs/security/)
lists the attacks an update system must resist, including arbitrary
software installation, rollback attacks (serving files older than the
client has already seen), indefinite freeze attacks (serving the same
stale files forever), and mix-and-match attacks (combining files that
never existed together). Verifying a signature over the artifact
handles the first; refusing versions lower than the installed one and
signing the metadata, including its expiry, address the others.

Keys need a lifecycle plan before the first release:

- Keep private keys in a hardware security module or a managed signing
  service, never on a laptop or in the repository.
- Ship the app with the current public key *and* a backup key from day
  one, so losing or retiring the primary does not strand installs.
- Rotate by publishing an update, signed with the old key, that adds the
  new public key; switch signing to the new key only after that update
  has reached every supported install.
- Test the update path from the oldest supported version on every
  release, because that is the path a key or format mistake breaks.

### Full and delta updates

| Approach | How it works | Trade-off |
|---|---|---|
| Full package | Download the whole new installer or archive | Simple and robust; largest downloads |
| Binary delta | A patch from one specific old version to the new one (Sparkle's `.delta` files) | Very small, but you generate one per supported source version, and a delta whose checksum does not match the installed copy is ignored in favour of the full download |
| Block-based differential | Compare block hashes and download only changed blocks (electron-updater's blockmap with HTTP range requests; MSIX's 64 KB blocks) | Works from any older version that shares blocks; needs range-request support and good layout of files |

With 1,000,000 installs and a 150 MB app, cutting the average download to
15 MB saves 135 TB of transfer per release and makes updates finish on
slow connections, which directly raises the adoption rate.

### Channels

Channels let different audiences run different streams of versions:
`stable`, `beta`, and often `nightly` or `canary`. Browsers are the best
known examples: Chrome ships Canary, Dev, Beta, Stable, and Extended
Stable; Firefox ships Nightly, Beta, Release, and ESR (the cadences are
in [release trains and release management](release-trains-and-release-management.md)).
Design points:

- **Staff and volunteers run beta.** They are the first ring of every
  rollout.
- **Moving from beta back to stable** usually means waiting until stable
  catches up, because the beta version is higher and updaters do not
  downgrade by default.
- **Enterprise channels** let administrators pin a version or delay
  updates, which a dynamic server implements as tenant rules.

### Percentage and cohort rollouts with stable bucketing

Each install gets a bucket from a hash of its install ID and the release
version, for example `hash("1.9.2:" + installId) mod 10000`. The release
is offered when the bucket is below `percent x 100`. Raising the
percentage only adds installs, and because the release version is part
of the hash, each release starts with a different set of early users.
The same technique is used for
[feature flags](../deployment-strategies/feature-flags-and-progressive-delivery.md).

Percentage *of installs* and percentage *of requests* are different
things. Balrog's documented `backgroundRate` is the percentage of
requests that receive the new release: a dice roll per check. A client
that checks six times a day at a 10% rate is offered the release within
a day with probability `1 - 0.9^6 = 47%`, and within three days
`1 - 0.9^18 = 85%`. Per-request throttling is therefore a way to slow a
rollout down, not a stable cohort; if you need a fixed share of installs
(to compare crash rates against a control group), bucket by install ID.

Cohorts are ordered rings: internal users, the beta channel, then 1%,
5%, 20%, 50%, and 100% of stable, each step gated on crash-free sessions
and error rates for the new version compared with the old.

### Pausing, rolling back, and rolling forward

You cannot uninstall software from users. Halting a rollout stops new
installs only; electron-updater's documentation is explicit that pulling
a bad staged release means publishing a version higher than the broken
one. The Microsoft Store works the same way: going back to an older
package stops new acquisitions, but customers who received the bad
package keep it until a higher-versioned package arrives.

![Diagram: four bars of all stable installs; on day 2, 1.9.1 has reached 20% (after 1% and 5%) and is halted because crash-free sessions fell, leaving 20% on 1.9.1 and 80% on 1.9.0; on day 3 the fix 1.9.2 starts, offered at once to every install on 1.9.1 and to 5% of the rest; on day 4 rule 2 reaches 25% of the installs still on 1.9.0; on day 6, 1.9.2 is on every install. The update server's rules: rule 1, evaluated first, offers 1.9.2 to 100% of installs currently on 1.9.1 because they already have the bug; rule 2 offers it to older versions by bucket, hash of install ID plus 1.9.2 modulo 10000, below the percentage.](staged-rollout-roll-forward.svg)

The roll-forward has an important asymmetry: installs that already have
the bad version should get the fix first and all at once (they are
already affected), while everyone else gets it through the normal staged
ramp. Downgrades are possible in some frameworks (electron-updater's
`allowDowngrade`, App Installer's `ForceUpdateFromAnyVersion`, a custom
version comparator in Tauri), but they are risky: the newer version may
already have migrated local data that the older one cannot read. Roll
forward, and use remote kill switches to disable a broken feature in the
meantime.

### Forced and optional updates, and when to install

| Mode | Example mechanisms | Use for |
|---|---|---|
| Optional | Background download, install on quit (electron-updater's default install moment is on quit) | Almost every release |
| Recommended | A dismissible banner; Android's flexible flow | Releases with important fixes |
| Required | MSIX `UpdateBlocksActivation`, Sparkle critical updates, Android's immediate flow, a server-side minimum version | Security fixes and versions the API can no longer serve |

Installing on quit or restart is the least disruptive moment, but apps
that are never closed (a desktop client left running for weeks) need a
nudge: a prompt after a few days, or a silent install while the app is
idle. Never install over a running process holding unsaved work.

### Keeping the update service available

- **Fail open.** The app must start and work normally when the update
  check fails; time it out after a few seconds and try later.
- **Spread the load.** Two million installs checking every four hours is
  `2,000,000 / 14,400 s = 139` requests per second on average, but if
  1.2 million of them start between 08:55 and 09:05 and check at launch,
  the peak is `1,200,000 / 600 s = 2,000` requests per second. Add random
  jitter to timers and delay the first check after launch.
- **Make "no update" cheap.** A `204` with no body, cached decisions per
  version and channel, and rules held in memory.
- **Keep artifacts immutable.** Versioned URLs on a CDN, never
  overwritten, so a cached manifest can never point at different bytes.
- **Have a static fallback.** If the decision service is down for long,
  serving the last known-good static manifest is better than serving
  nothing.

### Telemetry for update adoption

Track each step of the funnel per target version: offered, download
started and completed, verified, installed, first launch healthy. For
example:

```text
offered 100,000 -> downloaded 92,000 -> verified 91,900 -> installed 88,000 -> healthy 87,600
install failures: (91,900 - 88,000) / 91,900 = 4.2%   <- investigate before raising the rollout
```

Watch three more numbers: the version distribution of active installs,
the time for a release to reach 50% and 90% of active installs, and
spikes in verification failures, which usually mean a key, file, or CDN
problem rather than a code bug.

## When to use and when not to use

| Decision | Choose | When |
|---|---|---|
| Manifest | Static file on a CDN | Small user base, one channel, no per-customer targeting |
| Manifest | Dynamic update server | Staged rollouts with instant halt, tenants who pin versions, forced updates, adoption telemetry |
| Download | Full packages | Small apps, or until bandwidth or slow connections become a problem |
| Download | Deltas or block maps | Large apps, many installs, users on slow or metered networks |
| Install | On quit or restart | The default |
| Install | Forced | Security fixes and versions below the supported floor, never as routine |
| Mobile change | Over-the-air JavaScript update | Bug fixes and small changes within store policy, same runtime version |
| Mobile change | Store build | Native code changes, new features that need review, new permissions |
| Web | Prompted service worker activation | PWAs and apps whose old pages would break with a new worker |
| Web | Immediate `skipWaiting()` | Only when the worker change is compatible with pages already open |

## Practical examples

### A service worker update prompt for TaskFlow Web

```js
// src/sw-register.js: detect a waiting worker, prompt, activate, reload once
export function registerServiceWorker(onUpdateReady) {
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register("/sw.js").then((registration) => {
    // A new worker may already be waiting from an earlier visit
    if (registration.waiting && hadController) {
      onUpdateReady(() => registration.waiting.postMessage({ type: "SKIP_WAITING" }));
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        // "installed" while another worker controls the page means "waiting"
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateReady(() => worker.postMessage({ type: "SKIP_WAITING" }));
        }
      });
    });

    // Tabs that stay open for days never navigate, so check every hour
    setInterval(() => registration.update(), 60 * 60 * 1000);
  });

  // Reload once when the new worker takes over (not on the very first install)
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// src/main.jsx (excerpt)
// registerServiceWorker((activate) => showBanner("A new version is ready.", "Reload", activate));
```

```js
// public/sw.js (excerpt): activate only when the page asks
const BUILD = "873";                 // replaced at build time, so every build changes the bytes
const CACHE = `taskflow-${BUILD}`;
const PRECACHE = ["/", "/index.html"]; // plus the hashed assets listed by the build

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  // No skipWaiting() here: the page decides when to switch
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("taskflow-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});
```

Deleting the old caches in `activate` is safe here because activation only
happens right before every controlled page reloads. Tools such as Workbox
generate the precache list and the same message handling for you.

### Publishing a static manifest for TaskFlow Desktop

```js
// scripts/make-manifest.mjs: build the Tauri static update manifest from CI outputs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const base = `https://downloads.taskflow.example.com/desktop/${version}`;
const signature = (file) => readFileSync(`artifacts/${file}.sig`, "utf8").trim();

// File names as collected (and renamed per architecture) by the build jobs
const files = {
  "windows-x86_64": `TaskFlow_${version}_x64-setup.exe`,
  "darwin-aarch64": "TaskFlow_aarch64.app.tar.gz",
  "darwin-x86_64": "TaskFlow_x64.app.tar.gz",
};

const manifest = {
  version,
  notes: process.env.RELEASE_NOTES ?? "",
  pub_date: new Date().toISOString(),
  platforms: Object.fromEntries(
    Object.entries(files).map(([target, file]) => [
      target,
      { url: `${base}/${encodeURIComponent(file)}`, signature: signature(file) },
    ]),
  ),
};

mkdirSync("dist-updates/stable", { recursive: true });
writeFileSync("dist-updates/stable/latest.json", JSON.stringify(manifest, null, 2));
```

```yaml
# .github/workflows/desktop-release.yml (publish job; the build matrix is not shown)
name: desktop-release
on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  # build: a matrix job that builds, signs, and uploads desktop-* artifacts

  publish:
    needs: build
    runs-on: ubuntu-latest
    environment: desktop-stable            # required reviewers before users get it
    permissions:
      contents: read
      id-token: write                      # OIDC to AWS: no stored access keys
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - uses: actions/download-artifact@v8
        with:
          pattern: desktop-*
          path: artifacts
          merge-multiple: true
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/taskflow-desktop-publish
          aws-region: eu-west-1
      - name: Upload installers first (versioned, immutable paths)
        run: |
          VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
          aws s3 cp artifacts/ "s3://taskflow-downloads/desktop/$VERSION/" --recursive \
            --exclude "*.sig" --cache-control "public, max-age=31536000, immutable"
      - name: Then the manifest that points at them
        env:
          RELEASE_NOTES: ${{ github.event.release.body }}
        run: |
          node scripts/make-manifest.mjs
          aws s3 cp dist-updates/stable/latest.json \
            s3://taskflow-downloads/desktop/stable/latest.json \
            --cache-control "no-cache" --content-type application/json
```

The order is the same as for a web deploy: artifacts first, the pointer
last, so no client is ever told about a file that does not exist yet.
To halt, re-upload the previous `latest.json`: installs still on the old
version see no update, and installs that already took the new version are
not downgraded because the default comparison only moves forward.

### A rules-based update decision service

```js
// src/update-service.js: rules decide per check; artifacts stay on the CDN
import express from "express";
import semver from "semver";
import { createHash } from "node:crypto";
import { loadReleases } from "./releases.js"; // version -> { notes, pub_date, platforms }

// Loaded from reviewed configuration; the first matching rule wins
const rules = [
  { name: "replace-bad-1.9.1", match: { channel: "stable", versions: "1.9.1" }, release: "1.9.2", percent: 100 },
  { name: "tenant-pinned", match: { tenant: "tenant-042" }, release: "1.8.4", percent: 100 },
  { name: "beta", match: { channel: "beta" }, release: "1.10.0-beta.3", percent: 100 },
  { name: "stable", match: { channel: "stable", versions: "<1.9.2" }, release: "1.9.2", percent: 25 },
];
const halted = new Set(["1.9.1"]);          // never offered, whatever a rule says
const releases = await loadReleases();

function bucket(installId, release) {
  const digest = createHash("sha256").update(`${release}:${installId}`).digest();
  return digest.readUInt32BE(0) % 10_000;   // 0..9999, stable per install and release
}

function matches({ match }, ctx) {
  if (match.channel && match.channel !== ctx.channel) return false;
  if (match.tenant && match.tenant !== ctx.tenant) return false;
  if (match.versions && !semver.satisfies(ctx.version, match.versions, { includePrerelease: true })) {
    return false;
  }
  return true;
}

const app = express();

// Tauri endpoint template: /desktop/{{target}}/{{arch}}/{{current_version}}
app.get("/desktop/:target/:arch/:version", (req, res) => {
  const ctx = {
    version: semver.valid(req.params.version),
    platform: `${req.params.target}-${req.params.arch}`,
    channel: req.get("X-Channel") ?? "stable",
    tenant: req.get("X-Tenant-Id"),
    installId: req.get("X-Install-Id"),
  };
  if (!ctx.version) return res.status(204).end();

  const rule = rules.find((r) => matches(r, ctx));
  if (!rule || halted.has(rule.release)) return res.status(204).end();

  const release = releases.get(rule.release);
  const asset = release?.platforms[ctx.platform];
  const inRollout =
    rule.percent >= 100 || (ctx.installId && bucket(ctx.installId, rule.release) < rule.percent * 100);

  if (!asset || !inRollout || !semver.gt(rule.release, ctx.version)) {
    return res.status(204).end();           // nothing for this install right now
  }
  res.json({ version: rule.release, notes: release.notes, pub_date: release.pub_date, ...asset });
});

app.listen(Number(process.env.PORT ?? 3001));
```

The rule order encodes the roll-forward from the diagram: installs on the
halted 1.9.1 match the first rule and get 1.9.2 immediately; a pinned
tenant stays on 1.8.4 regardless of the stable ramp; everyone else follows
the 25% bucket. Installs without an ID are only offered releases at 100%,
so they never skew a staged rollout's comparison group. Every decision
should also be logged (version, rule, offered or not) to feed the adoption
funnel.

### Over-the-air updates with EAS Update

```json
{
  "expo": {
    "runtimeVersion": { "policy": "fingerprint" }
  }
}
```

The `fingerprint` policy (in `app.json`) changes the runtime version
whenever anything that affects native code changes, so an over-the-air
update can never reach a build whose native code it does not match.

```bash
# Publish a JavaScript fix to 10% of the production branch
eas update --branch production --message "Fix crash when opening a board" --rollout-percentage=10

# Watch crash-free sessions, then raise the percentage (100 finishes the rollout)
eas update:edit

# Or undo: send everyone in the rollout back to the previous update
eas update:revert-update-rollout
```

### Measuring adoption

```sql
-- adoption.sql: version share among desktop installs active in the last 7 days
WITH latest AS (
  SELECT DISTINCT ON (install_id) install_id, version
  FROM client_events
  WHERE platform = 'desktop'
    AND occurred_at > now() - interval '7 days'
  ORDER BY install_id, occurred_at DESC
)
SELECT version,
       count(*) AS installs,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM latest
GROUP BY version
ORDER BY installs DESC;
```

```sql
-- update-funnel.sql: where updates to 1.9.2 stop
SELECT event, count(DISTINCT install_id) AS installs
FROM client_events
WHERE platform = 'desktop'
  AND attributes ->> 'target_version' = '1.9.2'
  AND event IN ('update_offered', 'download_complete', 'verify_ok', 'install_ok', 'first_run_ok')
GROUP BY event
ORDER BY installs DESC;
```

Both queries assume a PostgreSQL table of anonymous client events keyed
by install ID; any analytics store with the same fields works.

## Best practices

- Treat the updater as a deployment pipeline: stages, health gates, a
  halt switch, and telemetry for every step.
- Verify an update signature with a public key built into the app before
  installing anything; keep private keys in an HSM or signing service and
  ship a backup public key from the first release.
- Download to a temporary location, verify, and only then replace files,
  so every failure before the install leaves a working version.
- Upload artifacts first and the manifest last, at immutable versioned
  URLs; keep manifest caching short.
- Bucket installs by a hash of install ID and release for staged
  rollouts; when rolling forward, replace the bad version first.
- Prefer roll-forward to downgrades, and build remote kill switches into
  the app.
- Install on quit or restart by default; force updates only for security
  and for versions below the supported floor.
- Make the update check fail open, jitter its timing, and keep a static
  fallback for the decision service.
- Test the update path from the oldest supported version on every
  release.
- For service workers, prompt before `skipWaiting()` and reload once on
  `controllerchange`.

## In production

- **The new version is installed nowhere after a release.**
  *Detect:* offers rise but `verify_ok` stays at zero; clients log
  signature errors. *Cause:* the release was signed with a different key
  than the one built into the app, or the manifest carries a signature
  path instead of the signature content. *Fix:* halt, re-sign with the
  correct key, add a CI step that verifies each artifact against the
  shipped public key, and keep the signing key in one managed place.
- **A halt does not stop new installs for an hour.**
  *Detect:* installs of the halted version keep growing after the
  manifest was replaced. *Cause:* the CDN cached `latest.json` with a long
  lifetime. *Fix:* serve manifests with `no-cache` or a short `max-age`,
  and purge the manifest path on every change.
- **The update server falls over every Monday morning.**
  *Detect:* request rate spikes at the start of the working day; app
  launches slow down. *Cause:* every install checks at launch with no
  jitter, and the app waits for the check. *Fix:* delay and jitter the
  first check, make the check asynchronous with a short timeout, cache
  "no update" answers, and scale for the launch peak.
- **Users with a tab open all week report a broken app after a deploy.**
  *Detect:* errors only from sessions older than the last service worker
  update; requests for chunks that no longer exist. *Cause:* `skipWaiting()`
  and `clients.claim()` let the new worker control pages built from the
  old code, and the old caches were deleted. *Fix:* activate only after a
  user prompt and reload, and keep old hashed assets on the server.
- **A 10% rollout reached most users within days.**
  *Detect:* the share on the new version far exceeds the configured
  percentage. *Cause:* the server rolled dice per request, so frequently
  checking clients eventually won. *Fix:* bucket by install ID and
  release, so the percentage means a share of installs.
- **An over-the-air update crashes on launch for some users.**
  *Detect:* crash reports rise right after an update, only on older store
  builds. *Cause:* the update needed native code those builds lack, with a
  runtime version that did not change. *Fix:* revert the rollout, switch
  to the `fingerprint` runtime version policy, and test updates against
  every store build still in use.
- **Installs stop updating after a release.**
  *Detect:* the version distribution freezes at the new version; update
  checks from it fail or never happen. *Cause:* the release broke the
  updater itself (endpoint, key, or install code). *Fix:* reach those
  users through the in-app minimum-version screen or a download page,
  and add an "update from N to N+1" test to the release pipeline.

## Important terminology

- **Update manifest:** the document that tells installs which version is
  available and where to download it.
- **Static manifest:** a manifest file served unchanged to every client.
- **Dynamic update server:** a service that decides per request which
  update, if any, to offer.
- **Update signature:** a signature over the artifact, verified by the
  installed app with an embedded public key.
- **Delta update:** a patch from one specific old version to the new one.
- **Block map:** a list of block hashes that lets a client download only
  changed blocks.
- **Channel:** a stream of versions for an audience, such as stable or
  beta.
- **Stable bucketing:** assigning each install a fixed bucket from a hash,
  so rollout percentages mean a fixed share of installs.
- **Halt:** stopping a rollout so no further installs receive a version.
- **Roll forward:** replacing a bad version with a newer, fixed one.
- **Runtime version:** in over-the-air systems, the identifier of the
  native code an update is compatible with.
- **Waiting worker:** a newly installed service worker that cannot
  activate while the old one controls open pages.

## Common mistakes and misconceptions

- Believing HTTPS makes update signatures unnecessary.
- Thinking a halt removes a bad version from devices.
- Downgrading installs whose local data was already migrated.
- Rolling dice per request and calling it a percentage rollout.
- Caching the manifest for hours, so halts are slow.
- Blocking app startup on the update check.
- Calling `skipWaiting()` by default in every service worker.
- Using over-the-air updates to ship features that need store review.
- Keeping the only copy of the update signing key on one machine.
- Never testing the update path from old versions.

## Revision questions

1. Why is an updater a deployment system, and which property of server
   deployments does it lack?
2. Describe the service worker lifecycle and explain why a new worker
   waits. When is calling `skipWaiting()` safe?
3. Compare a static manifest with a dynamic update server for halting,
   targeting, and availability.
4. Which attacks on update systems does a signature over the artifact
   stop, and which need signed metadata and version checks?
5. A rollout throttles 10% of requests, and clients check eight times a
   day. What share of active clients is offered the update within one
   day? (`1 - 0.9^8 = 57%`.)
6. A bad 1.9.1 reached 20% of installs before the halt. How should the
   rules for 1.9.2 treat those installs compared with everyone else?
7. When would you choose an over-the-air JavaScript update, and when a
   store build?
8. Two million installs check every four hours. What is the average
   request rate, and why is the real peak higher?

## Further learning

- [web.dev: The service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)
- [Electron: Updating applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [electron-builder: Auto update](https://www.electron.build/docs/features/auto-update)
- [Tauri: Updater plugin](https://v2.tauri.app/plugin/updater/)
- [Sparkle: Publishing an update](https://sparkle-project.org/documentation/publishing/)
- [Microsoft: App Installer update settings](https://learn.microsoft.com/en-us/windows/msix/app-installer/update-settings)
- [Android: In-app updates](https://developer.android.com/guide/playcore/in-app-updates)
- [Expo: EAS Update rollouts](https://docs.expo.dev/eas-update/rollouts/)
- [The Update Framework: security](https://theupdateframework.io/docs/security/)
- Next: [release trains and release management](release-trains-and-release-management.md). Back to the [release engineering overview](../release-engineering.md).
