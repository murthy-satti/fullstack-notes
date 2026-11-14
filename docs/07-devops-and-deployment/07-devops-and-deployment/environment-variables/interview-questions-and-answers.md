# Environment Variables and Secrets Interview Questions and Answers

These questions review configuration fundamentals, `.env` files and
precedence rules, build-time versus runtime configuration, and secrets
management. Try answering each one before reading the answer.

## Configuration fundamentals

### 1. What is the difference between code, configuration, and secrets?

Code is behavior that is the same in every environment. Configuration is
what differs between deployments of the same code (ports, URLs, log
levels, pool sizes). Secrets are configuration that grants access
(passwords, API keys, signing keys) and additionally need restricted
access, audit, rotation, and leak protection.

### 2. What does the Twelve-Factor App say about configuration?

Store config in the environment, strictly separated from code. Its
litmus test is whether the codebase could be made open source at any
moment without compromising credentials. It warns against named
environment groups inside code, because each new environment then needs a
code change.

### 3. Why should `process.env` be read in only one module?

It makes the full set of configuration discoverable, lets one place
convert and validate every value, makes testing easy (pass any object to
a parse function), and prevents scattered string handling bugs. The rest
of the code imports a typed, frozen config object.

### 4. Why must configuration be validated at startup?

Because invalid values otherwise surface later, in the first request that
needs them, often far from the cause. Failing at startup with a message
naming each bad variable stops a rolling deploy before the new version
takes traffic, while the old version keeps serving.

### 5. What is wrong with `Boolean(process.env.EMAIL_ENABLED)`?

Every non-empty string is truthy, so `"false"` and `"0"` become `true`.
Parse booleans explicitly from an allowed set of spellings (zod 4's
`z.stringbool()` does this) and reject anything else.

### 6. Which configuration values should never have defaults?

Addresses of dependencies (database URLs), anything security-related
(signing secrets, CORS origins), and anything with side effects (sending
email, charging cards). A missing value should stop the process, not
silently point at `localhost` or use `"secret"`.

### 7. How do feature flags differ from operational configuration?

Operational configuration (database URL, pool size, timeouts) differs by
environment and changes with deploys or restarts. Feature flags differ by
user or percentage, change often, are owned by product or release owners,
and reload live through a flag service.

### 8. What is configuration drift, and how do you detect it?

Unplanned differences between intended and actual configuration, or
between environments that should match, usually from manual edits or
partial changes. Detect it by managing config as code, validating at
startup, logging a config fingerprint, comparing variable names across
environments in CI, and using infrastructure drift detection.

### 9. When should configuration be a file instead of environment variables?

When it is large or structured (routing tables, lists, certificate
bundles). Mount it as a file (for example a ConfigMap volume) and
validate it at startup like any other configuration.

### 10. Does changing a Kubernetes ConfigMap update a running container's environment variables?

No. Environment variables are set when the container starts. Files from
a mounted ConfigMap are updated eventually, but the app must re-read
them. To apply new variables, restart the pods (a rolling restart).

### 11. How do you log configuration safely?

Log a redacted summary: non-secret values in clear, secret keys as
`[set]`, credentials inside URLs masked, plus a short hash fingerprint of
the effective configuration so instances can be compared without
revealing values.

### 12. Why is `NODE_ENV` a poor way to name environments?

Libraries use `NODE_ENV` to switch behavior (production optimizations,
error detail), so staging should use `NODE_ENV=production`. A separate
variable such as `APP_ENV` names the deployment environment.

## .env files and precedence

### 13. If a variable is exported in the shell and also set in `.env`, which wins with `node --env-file=.env`?

The shell. Node's documentation says that if a variable is defined in the
environment and in the file, the environment value takes precedence. The
same is true by default for dotenv, Vite (for prefixed keys), Next.js,
and Bun.

### 14. With two env files, which value wins in Node and in dotenv?

With `node --env-file=a.env --env-file=b.env`, later files override
earlier ones, so `b.env` wins. With `dotenv.config({ path: ["a.env",
"b.env"] })`, the first value set wins, so `a.env` wins, unless
`override: true` is set.

### 15. What is the precedence of Vite's env files?

Highest first: variables already in the environment (for `VITE_`-prefixed
keys), then `.env.[mode].local`, `.env.[mode]`, `.env.local`, and `.env`.
Only `VITE_*` keys reach client code, inlined at build time.

### 16. How does Next.js order its env files, and how does that differ from Vite?

`process.env`, then `.env.$(NODE_ENV).local`, `.env.local` (skipped when
`NODE_ENV=test`), `.env.$(NODE_ENV)`, and `.env`. Next.js ranks
`.env.local` above `.env.production`; Vite ranks `.env.production` above
`.env.local`.

### 17. Which `.env` files does Bun load automatically?

In increasing precedence: `.env`, `.env.[NODE_ENV]`, `.env.local`
(skipped in test), and `.env.[NODE_ENV].local`. `--env-file` replaces the
automatic choice, and `--no-env-file` or `env = false` in `bunfig.toml`
disables it. Bun also expands `${VAR}` references.

### 18. What are the two uses of `.env` files in Docker Compose?

A project `.env` (or `--env-file`) supplies values for `${VAR}`
interpolation in `compose.yaml`. The container's environment comes from
`environment:` and `env_file:` entries. A key in the project `.env` does
not reach the container unless the Compose file passes it on.

### 19. What is Docker Compose's precedence for a container's variables?

Highest first: `docker compose run -e`; `environment` or `env_file` values
interpolated from the shell or an environment file; plain `environment`
values; `env_file` values; and `ENV` from the image.

### 20. Which parser edge cases can silently drop variables?

Whitespace-only or tab-only lines (Node 22.12's loader merged the
following key into a broken name in testing), a byte order mark
corrupting the first key, an unclosed quote swallowing lines until the
next quote (Node and Bun), and UTF-16 encoding (nothing loads). Keep files
plain UTF-8, LF, without stray whitespace, and validate at startup.

### 21. Do Node's loader and dotenv expand `${VAR}` references?

No; both keep the text literally (tested). Bun, Vite (through
dotenv-expand), and Next.js expand references to earlier variables;
escape `$` there when you need a literal dollar sign.

### 22. How do you debug "the variable is in the file but the app doesn't see it"?

Ask the process: print each expected key with whether it is set and its
shape, never its value. Check shell exports, which files load in the
current mode, and the file's bytes (`cat -A` for whitespace and CRLF, a
hex dump for a BOM, `file` for UTF-16), and compare loaders. In
containers, check inside the container.

### 23. Should production use `.env` files?

Generally no. Production configuration should come from the platform
(Kubernetes, systemd, a PaaS) and secrets from a secret store, managed as
code with access control and audit. `.env` files are a development
convenience; implicit autoloading in production binaries makes behavior
depend on the working directory.

## Build-time vs runtime configuration

### 24. What happens to `import.meta.env.VITE_API_URL` during a build?

Vite replaces the expression with the literal string value from the build
environment. The value is now part of the JavaScript files and cannot
change without a rebuild.

### 25. Why are `VITE_*` and `NEXT_PUBLIC_*` values public?

They are inlined into JavaScript that every visitor downloads, so anyone
can read them in DevTools or source maps. Use them only for values meant
to be public; route secret-backed operations through your backend.

### 26. How can one frontend build be promoted from staging to production?

Keep environment-specific values out of the bundle: fetch a runtime
`config.json` at startup, inject configuration into `index.html` from a
server or edge function, write config from the container entrypoint, or
call the API at a same-origin relative path so no URL is needed.

### 27. Does runtime configuration make frontend values secret?

No. Runtime values are still sent to the browser. Runtime configuration
solves promotion, not secrecy.

### 28. What is the difference between `ARG` and `ENV` in a Dockerfile?

`ARG` exists during the build (and can persist in image metadata and
history); `ENV` persists into the image and every container started from
it. Neither is suitable for secrets; use `ENV` only for safe runtime
defaults such as `NODE_ENV=production`.

### 29. How do you use a credential during a Docker build without leaking it?

Use a BuildKit secret mount: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`
with `docker build --secret id=npmrc,src=...`. The secret is available
only in that step and is not stored in any layer.

### 30. Why should a container image contain no environment-specific values?

So one image, identified by digest, can be tested, scanned, signed, and
promoted to every environment, with the platform supplying configuration
at start. Baked values force per-environment builds and can leak.

### 31. Why does `process.env[name]` return undefined in a Next.js client component?

Only direct references such as `process.env.NEXT_PUBLIC_X` are inlined at
build time. Dynamic lookups and destructuring are not, so the browser has
no value.

### 32. What configuration can safely be compiled into a mobile app?

Only public values: public endpoints, publishable keys restricted to the
app, feature defaults. Anything compiled in can be extracted from every
device. Secrets stay on the backend, and values that must change after
release come from remote configuration.

### 33. Which values are legitimately build-time?

Facts about the build: version, commit, and constants that remove
development-only code (`import.meta.env.DEV`). Environment facts (API
URLs, database addresses) belong at runtime.

## Secrets management

### 34. Why are environment variables an imperfect carrier for secrets?

They are inherited by child processes, readable through process
inspection by the same user or root, visible in container and pod
metadata, easy to print in logs or CI output, readable by compromised
dependencies, and static until restart.

### 35. What does a secret store add over environment variables?

Encryption at rest, fine-grained access policies, versioning, audit logs
of every read, rotation support, and in some stores dynamic, short-lived
credentials.

### 36. Compare injecting secrets at deploy time with fetching them at startup.

Deploy-time injection (CI or a sync controller writes a Kubernetes Secret
or PaaS config) keeps app code simple but copies secrets to another place
and needs a restart to rotate. Fetching at startup with the workload's
identity avoids copies and audits each read, but the app depends on the
store and needs caching and retries.

### 37. What is workload identity?

An identity the platform gives a workload (a service account token, an
instance role) that it can exchange for short-lived cloud credentials,
so no long-lived key needs to be stored anywhere.

### 38. How does GitHub Actions OIDC federation with AWS work?

The job requests an OIDC token (`permissions: id-token: write`), and
`aws-actions/configure-aws-credentials` exchanges it with STS for a role
whose trust policy checks the token's audience and subject (repository,
branch, or environment). The job gets temporary credentials; no AWS key
is stored in GitHub.

### 39. What are dynamic secrets?

Credentials generated on demand with a lease, such as a database user
created by Vault for one application instance and dropped when the lease
ends. Leaked values expire automatically and are traceable to their
holder.

### 40. Describe safe secret rotation.

Create the new secret; make every verifier or server accept both old and
new; switch every user of the secret to the new one; wait for anything
issued with the old one to expire or drain; revoke the old one. Two valid
secrets overlap, so nothing breaks.

### 41. How do you rotate a JWT signing key without logging users out?

Put a key ID (`kid`) in each token, sign with the current key, and verify
against a set of current and previous keys. Add the new key as accepted,
then make it current, wait at least the token lifetime, then remove the
old key.

### 42. What is the "alternating users" rotation strategy?

Two database users exist; rotation changes the password of the user not
currently in use and then switches the application to it. A valid
credential exists at every moment. AWS Secrets Manager offers it as a
managed rotation strategy.

### 43. Are Kubernetes Secrets encrypted?

Not by default: values are base64-encoded and stored in etcd, which
should be configured with encryption at rest. Access is controlled by
RBAC, and anyone who can create pods in a namespace can usually read its
Secrets through a pod. Many teams sync them from an external store.

### 44. What do SOPS and Sealed Secrets do?

SOPS encrypts values in YAML, JSON, `.env`, or INI files with keys
protected by KMS, `age`, or PGP, so encrypted secrets can live in Git with
readable diffs. Sealed Secrets encrypts a Kubernetes Secret with a
cluster controller's public key so only that controller can decrypt it.
Neither provides dynamic secrets or per-read audit.

### 45. Where should secret scanning run?

Before commit (pre-commit hook), on push (push protection), in CI over
history and new commits, on artifacts (container images, frontend
bundles), and continuously through provider partner programs.

### 46. What is the first thing to do when a secret leaks?

Revoke or rotate it, assuming it is already in an attacker's hands. Then
check audit logs for misuse, contain any incident, remove the secret from
where it leaked (including Git history), and prevent recurrence.

### 47. Why is purging a secret from Git history not enough?

Forks, clones, CI caches, pull request references, and anyone who already
fetched the repository still have it. History cleanup reduces future
exposure; only rotation makes the leaked value useless.

## Scenario-based questions

### 48. A new release crashes in production with "Cannot read properties of undefined" an hour after deploy. Staging was fine. What do you check?

**What to check first:** the configuration the production process
received, especially variables added in this release.

**How to confirm:** the key is missing in production, or present with a
different shape; there was no startup validation.

**Likely causes and fixes:** a variable added to staging but not
production. Add it, validate all configuration at startup, and compare
variable names across environments in CI. See
[configuration fundamentals](configuration-fundamentals.md).

### 49. Staging started sending real emails to customers. What happened?

**What to check first:** `EMAIL_ENABLED` and the email credentials used
by staging, and whether staging holds real customer data.

**How to confirm:** the flag defaulted to true or was parsed from
`"false"` as truthy, and staging used a live provider key.

**Likely causes and fixes:** unsafe defaults, boolean parsing bugs, and
shared credentials. Default side effects off, parse booleans strictly,
use sandbox keys and allowlists outside production. See
[configuration fundamentals](configuration-fundamentals.md).

### 50. A developer edits `.env`, restarts, and the app still uses the old database. Why?

**What to check first:** whether the same variable is exported in the
developer's shell or set by the IDE or a tool.

**How to confirm:** `env | grep -c MONGODB_URI` (count only) shows it is
set before the app starts.

**Likely causes and fixes:** the existing environment wins over `.env` in
Node, dotenv, Vite, Next.js, and Bun. Unset the stale export or use a
fresh shell. See [.env files and precedence](env-files-and-precedence.md).

### 51. `MONGODB_URI` works with dotenv but is missing with `node --env-file`. Why?

**What to check first:** the bytes of the file around that line.

**How to confirm:** `cat -A .env` shows a whitespace-only line just
before it (this breaks Node 22.12's parser; Node 24 skips such lines), or
the key checker shows a strange key name containing a newline; or the
file starts with a BOM.

**Likely causes and fixes:** parser differences. Remove whitespace-only
lines and the BOM, enforce `.editorconfig`, and validate at startup. See
[.env files and precedence](env-files-and-precedence.md).

### 52. A Docker Compose service does not see `API_KEY`, which is in the project `.env`. Why?

**What to check first:** whether `compose.yaml` passes the variable to
the service.

**How to confirm:** `docker compose exec api printenv API_KEY` is empty;
the Compose file never references it.

**Likely causes and fixes:** the project `.env` is only for interpolating
the Compose file. Add `environment: API_KEY: ${API_KEY}` or put it in an
`env_file:`. See [.env files and precedence](env-files-and-precedence.md).

### 53. The production frontend calls the staging API. How did this happen and how do you fix it?

**What to check first:** the API URL inside the deployed JavaScript
bundle.

**How to confirm:** searching the built assets finds the staging host;
the build was made once with staging values and promoted.

**Likely causes and fixes:** build-time inlining. Switch to runtime
configuration or a relative `/api` path, or build per environment with a
CI check of the inlined URL. See
[build-time vs runtime configuration](build-time-vs-runtime-configuration.md).

### 54. A security researcher reports a payment API secret key in your JavaScript bundle. What do you do?

**What to check first:** which key it is and its permissions.

**How to confirm:** the key is in a `VITE_*` or `NEXT_PUBLIC_*` variable
and appears in the built assets.

**Likely causes and fixes:** a secret placed in a public build-time
variable. Revoke and rotate the key immediately, review its usage, move
the operation to the backend, and add a bundle secret scan to CI. See
[build-time vs runtime configuration](build-time-vs-runtime-configuration.md).

### 55. An image scanner flags a token in a Docker image layer. How did it get there?

**What to check first:** the Dockerfile's `ARG`, `ENV`, `COPY`, and `RUN`
steps that touch credentials.

**How to confirm:** `docker history --no-trunc` shows the token in a
build argument, or a layer contains a `.npmrc` or `.env` file.

**Likely causes and fixes:** `ARG` or `ENV` used for a build credential,
or credential files copied in. Rotate the token, use a secret mount, add
`.dockerignore` entries, and delete exposed images. See
[build-time vs runtime configuration](build-time-vs-runtime-configuration.md).

### 56. After rotating the database password, every instance failed to connect for five minutes. How do you avoid that next time?

**What to check first:** the order of the rotation steps and how
instances obtain credentials.

**How to confirm:** the old password was invalidated before instances
picked up the new one.

**Likely causes and fixes:** rotation without overlap. Use alternating
users or a dual-password window, and make instances refetch credentials
on authentication errors. See [secrets management](secrets-management.md).

### 57. A JWT signing key was replaced and all users were logged out. What should have happened?

**What to check first:** whether tokens carry a key ID and verifiers
accept more than one key.

**How to confirm:** verification failures spiked at the deploy; old
tokens were rejected.

**Likely causes and fixes:** single-key verification. Use `kid`, accept
current and previous keys, switch signing, wait the token lifetime, then
remove the old key. See [secrets management](secrets-management.md).

### 58. GitHub reports a cloud access key committed to a public repository three days ago. What is your runbook?

**What to check first:** the key's permissions and the cloud audit logs
since the commit time.

**How to confirm:** audit logs show whether anyone else used the key.

**Likely causes and fixes:** revoke the key immediately and issue a new
one through a secret store; investigate any misuse as an incident; then
purge the file from history; finally replace static keys with workload
identity or OIDC and add pre-commit scanning. See
[secrets management](secrets-management.md).

### 59. A third-party CI provider announces a breach of customer environment variables. What do you do?

**What to check first:** which secrets your pipelines stored with that
provider.

**How to confirm:** list the project and organization secrets and the
period of exposure the provider reports.

**Likely causes and fixes:** treat every stored secret as compromised:
rotate all of them, review their usage, and reduce what CI stores in
future by using OIDC federation and short-lived credentials. See
[secrets management](secrets-management.md).

### 60. Only some API instances behave differently after a configuration change. How do you investigate?

**What to check first:** the configuration fingerprint each instance
logged at startup.

**How to confirm:** fingerprints differ between pods or hosts; some were
not restarted or were edited by hand.

**Likely causes and fixes:** drift or a partial rollout of configuration.
Redeploy all instances from configuration as code and stop manual edits.
See [configuration fundamentals](configuration-fundamentals.md).

## Further learning

- [Environment variables and secrets overview](../environment-variables.md)
- [Configuration fundamentals](configuration-fundamentals.md) ·
  [.env files and precedence](env-files-and-precedence.md) ·
  [Build-time vs runtime configuration](build-time-vs-runtime-configuration.md) ·
  [Secrets management](secrets-management.md)
- [The Twelve-Factor App: Config](https://12factor.net/config)
- [OWASP: Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
