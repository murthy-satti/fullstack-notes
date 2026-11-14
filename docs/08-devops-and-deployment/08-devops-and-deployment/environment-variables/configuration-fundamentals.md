# Configuration Fundamentals

Configuration is everything that can differ between deployments of the
same code: the port to listen on, the database to use, the log level, the
URL of a partner API, a connection pool size, a credential. This lesson
explains how configuration differs from code and from secrets, what the
Twelve-Factor App recommends and where that advice stops, how to give
each environment its own values, how to load configuration into a typed,
validated module that fails fast, why defaults can be dangerous, how
feature configuration differs from operational configuration, and how
configuration drift happens and is detected.

## Why it matters

Configuration bugs are production bugs that tests rarely catch. The code
was reviewed and tested; the value it was given in production was not. A
missing variable that falls back to `localhost`, a log level string with a
typo, a timeout of `"30"` compared as a string, a boolean `"false"` that
JavaScript treats as true: each passes every unit test and fails in
production, often long after startup.

Large public incidents show the same pattern at scale. Google's report on
its June 2025 outage describes policy data with unintended blank fields
replicated globally within seconds and hitting a code path that had no
error handling; Cloudflare's November 2025 report describes a generated
configuration file that doubled in size and exceeded a limit in its proxy.
Treating configuration as code, with structure, validation, review, and
staged rollout, is how teams stop these.

## Real-world usage

- **The Twelve-Factor App.** Factor III,
  [Config](https://12factor.net/config), requires strict separation of
  config from code, gives the litmus test "whether the codebase could be
  made open source at any moment, without compromising any credentials",
  and recommends storing config in environment variables, because they
  are easy to change between deploys, unlikely to be committed, and
  language-agnostic. It also warns against grouping config into named
  environments inside the code, because that does not scale.
- **Kubernetes ConfigMaps.** The
  [ConfigMap documentation](https://kubernetes.io/docs/concepts/configuration/configmap/)
  describes ConfigMaps as a way to decouple environment-specific
  configuration from container images, exposed to pods as environment
  variables, command-line arguments, or files in a volume, and notes that
  ConfigMaps are not for confidential data.
- **Facebook.** The SOSP 2015 paper
  [Holistic Configuration Management at Facebook](https://research.facebook.com/publications/holistic-configuration-management-at-facebook/)
  describes managing configuration like code: stored in version control,
  changed through code review, checked by automated validators, and
  rolled out with canaries, because configuration changes are frequent
  and can break production as easily as code.
- **Google Cloud, June 2025.** The
  [incident report](https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW)
  traces a global outage to policy data with blank fields that a binary
  did not validate or handle, and lists propagating globally replicated
  data incrementally, with validation, as a remediation.

**Popular tools and providers:** zod, envalid, convict, Joi, dotenv,
Kubernetes ConfigMaps, AWS AppConfig and Systems Manager Parameter Store,
Azure App Configuration, HashiCorp Consul KV, and etcd.

## How it works

### Code, configuration, and secrets

![Diagram: a comparison of code, configuration, and secrets; code is behavior that is the same everywhere such as routes, business rules, and retry logic, lives in Git and the build artifact, changes through a pull request and a deploy, and is readable by anyone with repository access; configuration is values that differ per environment such as PORT, LOG_LEVEL, API URLs, and pool sizes, lives in environment variables, ConfigMaps, or a config repository, changes through a reviewed config change and a restart or reload, and is fine for operators to see and to log at startup; secrets are configuration that grants access such as database passwords, API keys, and JWT signing keys, live in a secret store and are injected at deploy or start, change by rotation with an overlap window, and must never appear in logs or errors.](config-what-goes-where.svg)

- **Code** is the same in every environment. If a value would be the same
  in development and production forever (a business rule, a retry
  algorithm), it belongs in code, under review and tests.
- **Configuration** is what legitimately differs per deploy. Keep the
  *set of keys* the same in every environment and let only the *values*
  differ.
- **Secrets** are configuration that grants access. They need everything
  configuration needs plus restricted access, audit, rotation, and
  protection from leaks (see [secrets management](secrets-management.md)).

### Twelve-factor config and where it stops

Environment variables are a good default carrier, and the Twelve-Factor
rule (config in the environment, not in code) holds up well. In practice
teams add three refinements:

- **Structured or large configuration** (routing tables, lists of
  tenants, certificate bundles) is awkward as flat strings. Mount it as a
  file (a Kubernetes ConfigMap volume, a JSON or YAML file) and still
  validate it at startup.
- **Secrets** are better fetched from or injected by a secret store than
  passed around as plain environment variables, for reasons covered in
  the secrets lesson.
- **Values that change at runtime** (feature flags, rate limits) belong in
  a flag or dynamic configuration service, not in variables that need a
  restart.

What Twelve-Factor warns against is still common: code such as
`if (env === "production") { dbHost = "db.internal" }`. Each new
environment then needs a code change, and staging tests different code
paths from production. Put the value in configuration instead.

### Per-environment values

The same keys, different values:

| Key | Development | Staging | Production |
|---|---|---|---|
| `APP_ENV` | `development` | `staging` | `production` |
| `PORT` | `3000` | `3000` | `3000` |
| `LOG_LEVEL` | `debug` | `info` | `info` |
| `MONGODB_URI` | `mongodb://localhost:27017/taskflow` | staging cluster (secret) | production cluster (secret) |
| `CORS_ORIGINS` | `http://localhost:5173` | `https://staging.taskflow.example.com` | `https://app.taskflow.example.com` |
| `EMAIL_ENABLED` | `false` | `true` (allowlist only) | `true` |
| `MONGO_POOL_SIZE` | `5` | `10` | `50` |

Document every key once, in an `.env.example` file (names, meaning,
example values, no real secrets), and keep it in the repository. Code
review then sees every new variable.

### A typed config module that fails fast

![Diagram: when the process starts it reads process.env, where every value is a string, coerces types such as the string 3000 into a number, true into a boolean, and a comma-separated list into an array, then validates required keys, ranges, URLs, and cross-field rules; if valid it freezes the config, logs a summary without secrets, and starts; if not, it reports every problem by variable name and never by value, exits with code 1, and in a rolling deploy the new instances never become ready so the deploy halts and the old version keeps serving.](config-validation-flow.svg)

The rules:

1. **Read `process.env` in exactly one module.** Everything else imports
   the result. This makes the full list of configuration discoverable
   and testable.
2. **Coerce types explicitly.** Every environment variable is a string:
   `"3000"`, `"true"`, `"a,b,c"`. Convert to numbers, booleans, and lists
   on purpose. In JavaScript `Boolean("false")` is `true` and
   `"30" > "100"` is `true` (string comparison), which are classic bugs.
3. **Validate everything at startup:** required keys, allowed values,
   ranges, formats (URLs, connection strings), and cross-field rules
   (`trace` logging is not allowed in production).
4. **Fail fast.** On any problem, print every issue by name and exit
   with a non-zero code. A process that never becomes ready cannot take
   traffic; in a rolling deploy the rollout stops and the old version
   keeps serving. That is much better than a process that starts and
   fails on the first request that needs the bad value.
5. **Never print secret values,** not even in validation errors.
6. **Freeze the result** so no code changes configuration at runtime by
   accident.

### Defaults and their dangers

Defaults make local development pleasant and production dangerous:

| Default | Why it hurts in production | Better |
|---|---|---|
| `MONGODB_URI` defaults to `mongodb://localhost:27017` | A missing variable starts the app against nothing, or against a local database on the host, instead of failing | Required, no default |
| `JWT_SECRET` defaults to `"secret"` | Anyone can forge tokens | Required, minimum length, no default |
| `EMAIL_ENABLED` defaults to `true` | Development and test environments send real email | Default `false`; production sets `true` explicitly |
| `CORS_ORIGINS` defaults to `*` | Any site can call the API from a browser | Required in production |
| `LOG_LEVEL` defaults to `info` | Harmless; this is a fine default | Keep |
| `PORT` defaults to `3000` | Usually harmless | Keep, or let the platform set it |

A useful rule: defaults are allowed for values where any wrong guess is
safe and obvious, and forbidden for addresses of dependencies, anything
security-related, and anything with side effects. Some teams also allow
defaults only when `APP_ENV` is `development`.

### Feature configuration and operational configuration

| | Operational configuration | Feature configuration (flags) | Dynamic operational settings |
|---|---|---|---|
| Examples | Database URL, pool size, timeouts, log level | `new-task-board` on for 10% of users | Rate limits, kill switches |
| Varies by | Environment | User, account, percentage | Time, incident |
| Changes | With a deploy or restart | Often, by product or release owners | During incidents, by operators |
| Delivered by | Environment variables, ConfigMaps, files | A flag service and SDK | A config service with live reload |
| Reload | Restart (rolling) | Live, per request | Live, with validation |

Mixing them causes trouble: a feature toggle in an environment variable
needs a restart to change and cannot target users; a database URL in a
flag service can be changed by the wrong person without review. See
[feature flags and progressive delivery](../deployment-strategies/feature-flags-and-progressive-delivery.md).

### Configuration drift

Configuration drift is the difference between what configuration should
be and what it actually is, or between environments that should match.
Common causes:

- Someone edits a value directly on a server, in a cloud console, or with
  `kubectl edit`, and the change is not recorded anywhere.
- A new release needs a new variable; it was added to production but not
  to staging (or the other way round).
- Each environment has a hand-maintained file that slowly diverges.
- A value was set temporarily during an incident and never reverted.

Prevention and detection:

- Keep configuration as code (in the application repository, a config
  repository, or infrastructure code) and change it only through review
  and automation.
- Validate configuration at startup, so a missing variable fails loudly.
- Log a fingerprint (a hash) of the non-secret configuration at startup
  and expose it, so you can see which instances run with which config.
- Compare the *names* of variables across environments in CI.
- Use infrastructure drift detection (`terraform plan`, GitOps
  reconciliation) for platform-level settings; see
  [IaC fundamentals](../infrastructure-as-code/iac-fundamentals.md).

### Reloading configuration

Most services read configuration once at startup and restart (through a
rolling deploy) to change it, which keeps behavior predictable: every
instance runs with the configuration it validated. Live reload (for
example on `SIGHUP` or by watching a mounted file) is worth its complexity
only for values that must change without a restart, and it needs the
same validation, plus a rule for what happens to in-flight work.
Kubernetes updates files from a mounted ConfigMap eventually, but never
updates environment variables of a running container; those need a
restart.

## When to use and when not to use

| Value | Where it belongs |
|---|---|
| Same in every environment, part of behavior | Code |
| Differs per environment, small, not sensitive | Environment variable (or ConfigMap exposed as one) |
| Large or structured (lists, maps, files) | Mounted config file, validated at startup |
| Grants access (passwords, keys, tokens) | Secret store, injected at deploy or start |
| Changes per user or gradually | Feature flag service |
| Must change live during incidents | Dynamic config service or kill switch |
| Public frontend settings | Build-time variable or runtime `config.json` (never secrets) |

## Practical examples

### A complete config module for TaskFlow API

```js
// src/config/schema.js: one place that knows every configuration key
import { z } from "zod";

export const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "test", "preview", "staging", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  MONGODB_URI: z.string().startsWith("mongodb", "must be a MongoDB connection string"),
  MONGO_POOL_SIZE: z.coerce.number().int().min(1).max(500).default(10),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  CORS_ORIGINS: z
    .string()
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.url())),
  EMAIL_ENABLED: z.stringbool().default(false), // "true"/"false", "1"/"0", "yes"/"no"...
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.problems = problems;
  }
}

// Pure function: easy to test with any env object
export function parseConfig(env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    // zod messages describe the problem without echoing the value
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const c = result.data;

  const crossField = [];
  if (c.APP_ENV === "production" && c.LOG_LEVEL === "trace") {
    crossField.push("LOG_LEVEL: trace is not allowed in production");
  }
  if (c.APP_ENV === "production" && c.NODE_ENV !== "production") {
    crossField.push("NODE_ENV: must be production when APP_ENV is production");
  }
  if (crossField.length > 0) throw new ConfigError(crossField);

  return Object.freeze({
    env: c.APP_ENV,
    isProduction: c.APP_ENV === "production",
    port: c.PORT,
    logLevel: c.LOG_LEVEL,
    mongo: Object.freeze({ uri: c.MONGODB_URI, poolSize: c.MONGO_POOL_SIZE }),
    jwtSecret: c.JWT_SECRET,
    corsOrigins: Object.freeze(c.CORS_ORIGINS),
    emailEnabled: c.EMAIL_ENABLED,
    requestTimeoutMs: c.REQUEST_TIMEOUT_MS,
  });
}
```

```js
// src/config/index.js: load once; exit with a clear message if invalid
import { parseConfig, ConfigError } from "./schema.js";

function load() {
  try {
    return parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const config = load();
```

Started with bad values, the process prints and exits with code 1:

```text
Invalid configuration:
  - APP_ENV: Invalid option: expected one of "development"|"test"|"preview"|"staging"|"production"
  - PORT: Invalid input: expected number, received NaN
  - MONGODB_URI: must be a MongoDB connection string
  - JWT_SECRET: must be at least 32 characters
  - CORS_ORIGINS.0: Invalid URL
```

`z.stringbool()` (zod 4) accepts the usual spellings of booleans in
environment variables and rejects anything else, instead of treating
every non-empty string as true. `z.coerce.number()` turns `"abc"` into
`NaN`, which the schema then rejects.

### Documenting every key in `.env.example`

```bash
# .env.example: every configuration key, with safe example values.
# Copy to .env for local development. Never put real secrets here.

# Which deployment this is: development | test | preview | staging | production
APP_ENV=development
# development | test | production (library behavior; staging uses production)
NODE_ENV=development
PORT=3000
# fatal | error | warn | info | debug | trace
LOG_LEVEL=debug

MONGODB_URI=mongodb://localhost:27017/taskflow
MONGO_POOL_SIZE=5

# At least 32 random characters. Generate: openssl rand -base64 48
JWT_SECRET=<generate-a-local-value>

# Comma-separated list of allowed browser origins
CORS_ORIGINS=http://localhost:5173
EMAIL_ENABLED=false
REQUEST_TIMEOUT_MS=10000
```

### Logging a safe configuration summary

```js
// src/config/summary.js: what the process is running with, minus secrets
import { createHash } from "node:crypto";

const SECRET_KEYS = new Set(["jwtSecret"]);

export function configSummary(config) {
  const visible = {
    ...config,
    mongo: { ...config.mongo, uri: redactUri(config.mongo.uri) },
  };
  for (const key of SECRET_KEYS) visible[key] = "[set]";

  // A fingerprint lets you compare instances without exposing values
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, 12);
  return { ...visible, fingerprint };
}

function redactUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "[unparseable]";
  }
}

// At startup: logger.info({ config: configSummary(config) }, "configuration loaded");
```

The fingerprint changes whenever any value changes (including secrets)
without revealing them. Two instances with different fingerprints are
running with different configuration, which is the first thing to check
when "only some requests fail".

### Testing the config module

```js
// test/config.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, ConfigError } from "../src/config/schema.js";

const valid = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  MONGODB_URI: "mongodb://db.internal:27017/taskflow",
  JWT_SECRET: "x".repeat(32),
  CORS_ORIGINS: "https://staging.taskflow.example.com",
};

test("parses and converts types", () => {
  const c = parseConfig({ ...valid, PORT: "8080", EMAIL_ENABLED: "false" });
  assert.equal(c.port, 8080);
  assert.equal(c.emailEnabled, false); // not the truthy string "false"
});

test("reports every missing required key", () => {
  assert.throws(() => parseConfig({}), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.ok(err.problems.some((p) => p.startsWith("MONGODB_URI")));
    assert.ok(err.problems.some((p) => p.startsWith("JWT_SECRET")));
    return true;
  });
});

test("rejects trace logging in production", () => {
  assert.throws(
    () => parseConfig({ ...valid, APP_ENV: "production", LOG_LEVEL: "trace" }),
    ConfigError,
  );
});
```

### Catching drift: compare variable names across environments

```bash
#!/usr/bin/env bash
# scripts/compare-env-keys.sh: list env var NAMES (not values) per deployment
# usage: compare-env-keys.sh <namespace-a> <namespace-b>
set -euo pipefail
keys() {
  kubectl -n "$1" get deployment taskflow-api \
    -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{"\n"}{end}' | sort
}
diff <(keys "$1") <(keys "$2") && echo "same variable names in $1 and $2"
```

Run it in CI after every infrastructure change. It catches the most
common drift, a variable that exists in one environment and not the
other, without ever reading a value.

## Best practices

- Separate code, configuration, and secrets; keep the same keys in every
  environment.
- Read `process.env` in one module; export a typed, frozen object.
- Coerce and validate every value at startup; fail fast with clear,
  value-free messages.
- Allow defaults only where a wrong guess is safe; require explicit
  values for dependencies, security settings, and side effects.
- Document every key in `.env.example` and review new keys in pull
  requests.
- Use files for structured configuration, a secret store for secrets, and
  a flag service for per-user or live changes.
- Change configuration through version control and automation; log a
  configuration fingerprint at startup.
- Restart (with a rolling deploy) to apply configuration unless live
  reload is truly needed.

## In production

- **The app started fine but every request to one feature fails.**
  *Detect:* errors only in code paths that use one setting; logs show
  `undefined` or `NaN` in URLs or timeouts. *Cause:* a missing or
  malformed variable that nothing validated at startup. *Fix:* validate
  all configuration at startup and fail fast.
- **Staging sent real emails.**
  *Detect:* complaints from customers; provider logs show sends from
  staging. *Cause:* `EMAIL_ENABLED` defaulted to true, or staging used
  production credentials. *Fix:* safe defaults (off), allowlists in
  non-production environments, separate credentials.
- **A feature that was "turned off" is still on.**
  *Detect:* behavior does not match the variable you changed. *Cause:*
  `Boolean("false")` is true, or the process was not restarted after the
  change. *Fix:* explicit boolean parsing (`z.stringbool()`), and roll the
  deployment after configuration changes.
- **Only some instances misbehave.**
  *Detect:* errors correlate with specific pods or hosts; config
  fingerprints differ. *Cause:* drift from manual edits or a partial
  rollout of a config change. *Fix:* manage configuration as code and
  redeploy every instance from it.
- **A deploy failed because of a variable that exists only in
  production.**
  *Detect:* the new version fails validation in staging (good) or worse,
  only in production. *Cause:* environments maintained by hand. *Fix:*
  compare variable names across environments in CI and add new keys to
  all environments in the same change.
- **Secrets appeared in the logs.**
  *Detect:* log search finds connection strings with passwords. *Cause:*
  the whole config or `process.env` was logged, or a validation error
  printed values. *Fix:* log a redacted summary only, rotate the exposed
  secrets.

## Important terminology

- **Configuration:** values that differ between deployments of the same
  code.
- **Environment variable:** a named string passed by the operating
  system to a process at start.
- **Config module:** the single place that reads, converts, and validates
  configuration.
- **Coercion:** converting a string value into the intended type.
- **Fail fast:** stopping at startup on invalid configuration instead of
  failing later.
- **Default value:** a value used when a key is not set.
- **Operational configuration:** settings that control how the service
  runs in an environment.
- **Feature configuration:** settings that control what users see,
  usually through flags.
- **Configuration drift:** unplanned differences between intended and
  actual configuration, or between environments.
- **Configuration fingerprint:** a hash of the effective configuration
  used to compare instances.

## Common mistakes and misconceptions

- Reading `process.env` all over the code base.
- Treating `"false"` and `"0"` as false without parsing them.
- Giving dependencies and secrets defaults "for convenience".
- Branching on `APP_ENV === "production"` for values that should be
  configuration.
- Logging all of `process.env` to debug a problem.
- Editing configuration on live servers and forgetting it.
- Expecting a running container to see changed environment variables
  without a restart.
- Using environment variables for per-user feature toggles.

## Revision questions

1. What is the difference between code, configuration, and secrets? Give
   two examples of each for TaskFlow API.
2. What is the Twelve-Factor litmus test for configuration?
3. Why should `process.env` be read in only one module?
4. What does `Boolean("false")` return, and how should boolean variables
   be parsed?
5. Which settings should never have a default value, and why?
6. During a rolling deploy, a new version fails configuration validation.
   What do users experience, and why is that better than starting with
   the bad value?
7. How do feature flags differ from operational configuration in who
   changes them and how they reload?
8. How can you detect configuration drift between staging and production
   without reading any secret values?

## Further learning

- [The Twelve-Factor App: Config](https://12factor.net/config)
- [Kubernetes: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Zod documentation](https://zod.dev/)
- [Configuration, environments, and secrets in backend services](../../../03-backend-development/backend-concepts/configuration-and-secrets.md)
- [Kubernetes configuration and secrets](../kubernetes/configuration-and-secrets.md)
- Next: [.env files and precedence](env-files-and-precedence.md). Back to the
  [environment variables overview](../environment-variables.md).
