# Build-Time vs Runtime Configuration

Some configuration is read when a program **runs**: a Node server reads
`process.env.MONGODB_URI` at startup, in whatever environment it was
started. Other configuration is consumed when a program is **built**: a
Vite or Next.js frontend replaces `import.meta.env.VITE_API_URL` or
`process.env.NEXT_PUBLIC_API_URL` with a literal string while bundling, so
the value is frozen into the files you ship. Mixing the two up causes
wrong API URLs in production, secrets published in JavaScript bundles,
and builds that cannot be promoted from staging to production.

This lesson covers build-time inlining in frontends, why inlined values
are public, why changing them needs a rebuild, runtime configuration
patterns for single-page apps, `ARG` versus `ENV` and build secrets in
container images, the one-image-for-all-environments rule, and what
"configuration" means for desktop and mobile apps that ship to every
device.

## Why it matters

The rule "build once, promote the same artifact" from
[environments and promotion](../deployment-strategies/environments-and-promotion.md)
only works if environment-specific values are read at runtime. A frontend
built with the staging API URL inlined will call the staging API wherever
it is deployed. Teams then either rebuild per environment (and ship to
production an artifact that never ran in staging) or invent fragile
search-and-replace scripts.

The security side is sharper. Anything inlined into a browser bundle,
mobile app, or desktop binary is delivered to every user and can be read
by anyone. A secret API key in a `VITE_*` variable is a published secret.

## Real-world usage

- **Next.js.** The [environment variables guide](https://nextjs.org/docs/app/guides/environment-variables)
  explains that `NEXT_PUBLIC_*` values are inlined into the browser bundle
  at `next build`, that "after being built, your app will no longer
  respond to changes to these environment variables", including when one
  Docker image is deployed to several environments, and that server code
  can read environment variables at runtime during dynamic rendering so a
  single image can be promoted.
- **Vite.** The [env variables and modes guide](https://vite.dev/guide/env-and-mode)
  says `VITE_*` variables are exposed in client-side source code after
  bundling and should not contain sensitive information such as API
  keys.
- **Docker.** The [build variables documentation](https://docs.docker.com/build/building/variables/)
  warns that build arguments and environment variables "are inappropriate
  for passing secrets to your build, because they're exposed in the final
  image", notes that build arguments may persist in image metadata and
  history, and recommends secret mounts instead.
- **The Twelve-Factor App.** Factor V,
  [Build, release, run](https://12factor.net/build-release-run), separates
  the build (code into an executable bundle), the release (bundle plus
  one environment's config), and the run stage, which is exactly the
  boundary build-time inlining blurs.

**Popular tools and providers:** Vite, Next.js, webpack `DefinePlugin`,
esbuild and Bun `--define`, Docker `ARG`, `ENV`, and BuildKit secret
mounts, the official nginx image's entrypoint scripts, Kubernetes
ConfigMaps, and remote configuration services such as Firebase Remote
Config for mobile apps.

## How it works

### Two moments: build and run

![Diagram: top, build time: vite build runs in CI with VITE_API_URL set to the staging URL, so dist/assets/index.js contains the staging API address literally; deployed to staging it calls the staging API, but promoted to production it still calls the staging API, and fixing it needs a new build; bottom, runtime: vite build runs once with no environment values, the same bundle fetches /config.json first, and staging and production each serve their own config.json, so the same build calls the right API in each.](build-vs-runtime-timeline.svg)

| | Build-time value | Runtime value |
|---|---|---|
| Read by | The bundler or compiler | The running program |
| Where it ends up | Inside the artifact (bundle, image layer, binary) | In process memory, from the environment or a fetched file |
| To change it | Rebuild and redeploy | Restart, reload, or refetch |
| Same artifact in every environment? | No | Yes |
| Visibility | Anyone who can download the artifact | Whoever can read the process environment or config endpoint |

### Build-time inlining in frontends

Bundlers replace specific expressions with literal values while building:

```js
// src/api.js (source)
export const API_URL = import.meta.env.VITE_API_URL;
if (import.meta.env.DEV) console.debug("API", API_URL);
```

```js
// dist/assets/index-D4kPz8wa.js (production build, simplified)
const API_URL = "https://api.staging.taskflow.example.com";
```

- `import.meta.env.VITE_API_URL` became a string literal.
- `import.meta.env.DEV` became `false`, and the bundler removed the whole
  `if` block as dead code. That is the legitimate use of build-time
  values: removing development-only code.
- Next.js does the same for `process.env.NEXT_PUBLIC_*`, but only for
  direct references; `process.env[name]` or destructuring is not
  inlined, which is a common source of `undefined` in the browser.

### Why inlined values are public, always

The browser downloads the bundle. Anyone can open DevTools, the Network
panel, or the source map, and read every inlined string. So:

| Fine as a public build-time value | Never as a build-time value |
|---|---|
| Public API base URL | API keys that grant write access or cost money |
| Analytics site ID | Database URLs or credentials |
| Error tracker DSN (designed to be public, restrict by origin) | JWT signing keys, session secrets |
| Payment provider *publishable* key | Payment provider *secret* key |
| Feature defaults, build version | Admin tokens, internal hostnames you consider confidential |

When a frontend needs a secret-backed capability (calling a paid API,
reading private data), the frontend calls **your backend**, which holds
the secret and enforces authorization. A prefix such as `VITE_` or
`NEXT_PUBLIC_` is a deliberate "this is public" marker; treat adding one
like publishing the value.

### Changing a build-time value needs a rebuild

Because the value lives inside the files, changing the environment of a
running deployment does nothing. Teams handle this in one of three ways:

1. **Build per environment.** Simple and common for static sites. The
   price: the production artifact is not the one that was tested, and
   every environment needs its own build.
2. **Runtime configuration.** Keep environment-specific values out of the
   bundle and load them when the app starts (next section). One build is
   promoted everywhere.
3. **Avoid configuration.** Call the API at a relative path (`/api`) on
   the same origin, and let each environment's reverse proxy route it. No
   URL to configure at all, and no CORS.

### Runtime configuration patterns for single-page apps

| Pattern | How | Pros | Cons |
|---|---|---|---|
| `config.json` fetched at startup | The app fetches `/config.json` (served per environment, `no-cache`) before rendering | Simple, one build, works on any static host | One extra request before first render |
| Server-injected config | The server or edge inserts `window.__APP_CONFIG__ = {...}` into `index.html` | No extra request | Needs a server or edge function; must escape values to avoid script injection |
| Container entrypoint writes config | A script in the web container writes `config.json` from environment variables when the container starts | Fits "one image, many environments" | Only works when you serve the SPA from your own container |
| Same-origin relative API | Frontend calls `/api`; proxy routes per environment | No config for the API URL at all | Requires a proxy in front of both |

Whatever the pattern, the runtime values are still **public**: they are
sent to the browser. Runtime configuration fixes promotion, not secrecy.

### Container images: `ARG`, `ENV`, and build secrets

| | `ARG` | `ENV` | Secret mount (`RUN --mount=type=secret`) |
|---|---|---|---|
| Available during build | Yes, from its declaration | Yes, after its declaration | Only in the `RUN` step that mounts it |
| Present in running containers | No, unless copied into `ENV` or a file | Yes | No |
| Visible in image metadata or history | It can be (history, provenance) | Yes, in the image config | No |
| Use for | Build options (versions, flags) | Safe runtime defaults (`NODE_ENV=production`, `PORT`) | Tokens needed only to build (private registry credentials) |
| Never use for | Secrets | Secrets or per-environment values | Runtime configuration |

### One image for all environments

![Diagram: the TaskFlow API image, built once and identified by digest sha256:4f2c, contains a node:24-alpine base, npm dependencies, application code, and ENV NODE_ENV=production, and no secrets or per-environment values; the same image runs in development with Docker Compose supplying APP_ENV=development, LOG_LEVEL=debug, and a local database, in staging with a Kubernetes ConfigMap for APP_ENV and LOG_LEVEL and a Secret for MONGODB_URI synced from the secret store, and in production the same way with production values.](one-image-per-env-config.svg)

The image should contain the runtime, dependencies, code, and safe
defaults, and nothing that differs per environment. The platform supplies
the rest when the container starts. That gives you a single digest to
test, scan, sign, and promote.

### Desktop and mobile apps: every value ships to every device

A desktop or mobile app is a build artifact installed on devices you do
not control. Any value compiled into it, including "hidden" ones in
native code or obfuscated JavaScript, can be extracted.

- **Never embed secrets.** Not API secret keys, not database passwords,
  not signing keys. Use your backend as the intermediary, with per-user
  authentication.
- **Expect old builds to live for months.** A URL compiled into version
  1.2 is called by 1.2 for as long as it is installed. Prefer stable
  public endpoints that you can route on the server side.
- **Use remote configuration** for values that must change after
  release (feature switches, endpoints, minimum versions), fetched at
  startup, cached, with safe defaults when offline.
- **Restrict keys that must be public.** Some providers issue client keys
  that are meant to be embedded but can be restricted to your app's
  bundle ID, package name, or website origin.

## When to use and when not to use

| Value | Build time | Runtime |
|---|---|---|
| Removing development-only code (`import.meta.env.DEV`) | Yes | |
| App version and build commit | Yes (it describes the build) | |
| API base URL that differs per environment | Only if you build per environment | Preferred (or use a relative `/api` path) |
| Analytics or error tracker public IDs per environment | Acceptable | Preferred if you promote builds |
| Server database URLs, secret keys | Never | Yes, on the server only |
| Values that must change without a release (mobile) | Never | Remote config |
| Credentials needed only to install dependencies during a Docker build | Secret mount, never `ARG` | |

## Practical examples

### Fail the frontend build if a required public value is missing

```js
// vite.config.js
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const REQUIRED = ["VITE_SENTRY_DSN"];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd()); // only VITE_* keys by default
  const missing = REQUIRED.filter((key) => !env[key]);
  if (mode === "production" && missing.length > 0) {
    throw new Error(`Missing build-time variables: ${missing.join(", ")}`);
  }
  return { plugins: [react()] };
});
```

```ts
// src/vite-env.d.ts: type the variables you read
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

A missing value now fails CI instead of shipping `undefined` to users.

### Runtime configuration for TaskFlow Web with `config.json`

```js
// src/runtime-config.js: load and validate per-environment values at startup
import { z } from "zod";

const schema = z.object({
  apiBaseUrl: z.url(),
  environment: z.enum(["development", "staging", "production"]),
  sentryDsn: z.string().optional(),
});

let current;

export async function loadRuntimeConfig() {
  const res = await fetch("/config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`config.json: HTTP ${res.status}`);
  current = Object.freeze(schema.parse(await res.json()));
  return current;
}

export function runtimeConfig() {
  if (!current) throw new Error("runtime config not loaded yet");
  return current;
}
```

```js
// src/main.jsx: render only after configuration is loaded
import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./runtime-config.js";
import { App } from "./App.jsx";

const root = createRoot(document.getElementById("root"));

loadRuntimeConfig()
  .then(() => root.render(<App />))
  .catch((err) => {
    console.error(err);
    root.render(<p>TaskFlow could not start. Please try again later.</p>);
  });
```

Each environment serves its own `/config.json` with
`Cache-Control: no-cache`; the JavaScript bundle is identical everywhere.

### One web image, configured when the container starts

```bash
#!/bin/sh
# deploy/40-runtime-config.sh: runs from /docker-entrypoint.d/ before nginx starts
set -eu
: "${API_BASE_URL:?API_BASE_URL is required}"
: "${APP_ENV:?APP_ENV is required}"

# Values are public and validated again by the app; keep them to simple URLs and names
cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiBaseUrl": "${API_BASE_URL}",
  "environment": "${APP_ENV}",
  "sentryDsn": "${SENTRY_DSN:-}"
}
EOF
echo "runtime config written for ${APP_ENV}"
```

```dockerfile
# Dockerfile (TaskFlow Web): build once, configure at container start
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 deploy/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
```

The official nginx image runs executable `*.sh` files from
`/docker-entrypoint.d/` before starting nginx, so the same image writes a
different `config.json` in each environment. `:?` makes the container
exit at startup if a required value is missing, just like a backend
config check. Serve `config.json` with `no-cache` in `nginx.conf`.

### `ARG`, `ENV`, and a build secret in one Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
# Dockerfile (TaskFlow API)
FROM node:24-alpine
WORKDIR /app

# Build option: which version label to bake in (not a secret)
ARG APP_VERSION=dev
# Deliberately persisted: the app reports it at /version
ENV APP_VERSION=$APP_VERSION \
    NODE_ENV=production \
    PORT=3000

COPY package*.json ./
# The private registry token exists only during this RUN step, in no layer
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci --omit=dev

COPY src ./src
USER node
CMD ["node", "src/server.js"]
```

```bash
docker build \
  --build-arg APP_VERSION=1.8.0 \
  --secret id=npmrc,src="$HOME/.npmrc" \
  -t ghcr.io/example/taskflow-api:1.8.0 .

# Same image, different environments
docker run --rm -e APP_ENV=staging --env-file ./staging.env ghcr.io/example/taskflow-api:1.8.0
```

Never write `ARG NPM_TOKEN` and `RUN echo "//registry...:_authToken=$NPM_TOKEN" > .npmrc`:
the token ends up in the image history or a layer, and anyone who can pull
the image can read it.

### Reading runtime values on the server in Next.js

```ts
// app/status/page.tsx: rendered per request, reads the environment at runtime
import { connection } from "next/server";

export default async function StatusPage() {
  await connection(); // opt into dynamic rendering, so this runs per request
  const region = process.env.DEPLOY_REGION ?? "unknown"; // server-only, not inlined
  return <p>Served from {region}</p>;
}
```

Server-only variables (no `NEXT_PUBLIC_` prefix) read during dynamic
rendering come from the running environment, so one Next.js image can be
promoted; `NEXT_PUBLIC_*` values in client components remain frozen at
build time.

## Best practices

- Decide for every value whether it is build-time or runtime, and
  document it.
- Treat every `VITE_*`, `NEXT_PUBLIC_*`, and mobile or desktop compiled
  value as public.
- Use build-time values for build facts (version, commit, dev-only code
  removal), runtime values for environment facts.
- Prefer a same-origin `/api` path or runtime `config.json` so one
  frontend build can be promoted.
- Validate runtime configuration in the browser too; fail visibly if it
  is missing.
- Keep container images free of secrets and environment-specific
  values; use `ENV` only for safe defaults.
- Use BuildKit secret mounts for build-time credentials.
- Use remote configuration with safe offline defaults for installed
  apps.

## In production

- **The production frontend calls the staging API.**
  *Detect:* browser network requests go to the staging host; errors or
  data from staging appear. *Cause:* the build was made with staging
  `VITE_*` values and then promoted. *Fix:* runtime configuration or a
  relative API path, or build per environment with checks in CI that the
  inlined URL matches the target.
- **An API secret key was found in the JavaScript bundle.**
  *Detect:* secret scanning alert, or a researcher's report. *Cause:* a
  secret placed in a public build-time variable. *Fix:* revoke and rotate
  the key immediately, move the call behind your backend, and add a CI
  check that greps built assets for known secret patterns.
- **A private registry token was exposed in an image.**
  *Detect:* `docker history` or an image scanner shows the token in a
  layer or build argument. *Cause:* `ARG` or `ENV` used for a build
  credential. *Fix:* rotate the token, rebuild with a secret mount, and
  delete the exposed images from the registry.
- **A config change did nothing in the browser.**
  *Detect:* the environment variable changed but users see the old
  behavior. *Cause:* the value is inlined at build time, or `config.json`
  is cached by the CDN or browser. *Fix:* rebuild (for build-time values)
  or serve `config.json` with `no-cache`.
- **`process.env.NEXT_PUBLIC_X` is undefined in the browser.**
  *Detect:* client code logs `undefined` although the variable is set.
  *Cause:* dynamic access (`process.env[key]`) that the bundler cannot
  inline, or the variable was not set during `next build`. *Fix:* use
  direct property access and set the value at build time, or move to
  runtime configuration.
- **Old mobile app versions call a retired endpoint.**
  *Detect:* 404s on an old path from specific app versions. *Cause:* the
  URL was compiled into the app. *Fix:* keep or redirect the old path
  server-side, and use remote configuration for endpoints in future
  versions.

## Important terminology

- **Build time:** when source is compiled or bundled into an artifact.
- **Runtime:** when the artifact runs in an environment.
- **Inlining (static replacement):** substituting an expression with a
  literal value during the build.
- **Dead-code elimination:** removing code that a build-time constant
  makes unreachable.
- **Public prefix:** a variable name prefix (`VITE_`, `NEXT_PUBLIC_`)
  marking values that will be shipped to browsers.
- **Runtime configuration:** values an app loads after it starts, from the
  environment, a file, or an endpoint.
- **`ARG`:** a Dockerfile build-time variable.
- **`ENV`:** a Dockerfile variable that persists into the image and its
  containers.
- **Build secret mount:** a BuildKit feature exposing a secret to a single
  `RUN` step without storing it in the image.
- **Remote configuration:** values an installed app fetches from a server
  after release.

## Common mistakes and misconceptions

- Believing a `VITE_` or `NEXT_PUBLIC_` value is hidden because it came
  from an environment variable.
- Expecting environment changes on the server to change an already-built
  frontend.
- Promoting a frontend build whose environment-specific values were
  inlined.
- Using `ARG` or `ENV` for tokens during Docker builds.
- Baking environment-specific settings into container images.
- Embedding secrets in desktop or mobile apps and relying on
  obfuscation.
- Thinking runtime configuration makes values secret; it only makes them
  changeable.

## Revision questions

1. What happens to `import.meta.env.VITE_API_URL` during `vite build`?
2. Why is every `NEXT_PUBLIC_*` value public, and what should you do when
   a frontend needs a secret-backed capability?
3. Give three ways to let one frontend build run in staging and
   production.
4. Compare `ARG`, `ENV`, and secret mounts in a Dockerfile: which ones
   appear in running containers, and which can leak in image metadata?
5. Why should a container image contain no environment-specific values?
6. Why is `process.env[name]` not inlined by Next.js, and what symptom
   does that cause?
7. What must never be compiled into a mobile app, and what replaces it?
8. A runtime `config.json` change does not reach users for an hour. What
   is the likely cause?

## Further learning

- [Vite: Env variables and modes](https://vite.dev/guide/env-and-mode)
- [Next.js: Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Docker: Build variables](https://docs.docker.com/build/building/variables/)
- [Docker: Build secrets](https://docs.docker.com/build/building/secrets/)
- [The Twelve-Factor App: Build, release, run](https://12factor.net/build-release-run)
- [Deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md)
- Next: [secrets management](secrets-management.md). Back to the
  [environment variables overview](../environment-variables.md).
