# Configuration, Environments, and Secrets

The same backend code runs on a developer's laptop, in automated tests, on a
staging server, and in production — but it talks to different databases,
uses different API keys, and logs at different levels in each place.
**Configuration** is everything that changes between those environments.
**Secrets** are the sensitive part of configuration: passwords, keys, and
tokens. Handling both well keeps deployments predictable and credentials
safe.

## Why it matters

Configuration mistakes are a common cause of outages and breaches:

- A database password committed to a public repository can be found quickly
  by automated scanners — and it stays in the Git history after the file is
  deleted.
- Staging accidentally points at the production database and test data
  corrupts real records.
- A missing environment variable is only discovered when the first payment
  is attempted — hours after the deploy.
- A shared "admin" key used by every environment cannot be rotated without
  downtime.

A clear approach — config separate from code, validated at startup, secrets
in a proper store — prevents these and makes it safe to promote the same
build from staging to production.

## Real-world usage

- **The Twelve-Factor App** stores config in environment variables and gives
  a litmus test: could the codebase be made open source at any moment
  without compromising any credentials?
  ([The Twelve-Factor App: Config](https://12factor.net/config)).
- **GitHub secret scanning** scans the entire Git history on all branches of
  a repository for hardcoded credentials such as API keys, passwords, and
  tokens
  ([GitHub Docs: about secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning)).
- **AWS Secrets Manager rotation** periodically updates a secret in both the
  secret store and the database or service that uses it, and can do so
  automatically
  ([AWS Secrets Manager: rotation](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)).
- **Dynamic secrets in HashiCorp Vault.** Vault's database secrets engine
  generates database credentials on demand, so services no longer need
  hard-coded credentials and keys are easier to roll
  ([Vault: database secrets engine](https://developer.hashicorp.com/vault/docs/secrets/databases)).
- **Kubernetes Secrets** are, by default, stored unencrypted in the API
  server's data store (etcd), so clusters must enable encryption at rest and
  restrict access
  ([Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)).

**Popular tools and providers:** AWS Secrets Manager and Systems Manager
Parameter Store, Google Secret Manager, Azure Key Vault, HashiCorp Vault,
Doppler, and 1Password Secrets Automation; secret scanners such as GitHub
secret scanning, Gitleaks, and TruffleHog.

## How it works

### Configuration versus code

| Belongs in configuration | Belongs in code |
|---|---|
| Database URLs, hostnames, ports | Business rules and algorithms |
| API keys and credentials | Route definitions |
| Log level, feature toggles | Validation schemas |
| Third-party endpoints that differ by environment | Fixed product constants (e.g. maximum name length) |
| Timeouts and pool sizes you tune per environment | Defaults that are the same everywhere |

A useful test from the twelve-factor methodology: **could you make the
codebase open source right now without exposing any credentials?** If not,
some configuration is in the code.

### Twelve-factor configuration

The **Twelve-Factor App** methodology recommends storing config in the
**environment**:

- Config varies between deploys; code does not. The **same build artifact**
  (container image) is deployed to every environment with different config.
- Environment variables are language- and OS-agnostic and are not checked
  into the repository by accident as easily as config files.
- Config is **granular**: independent variables per setting rather than named
  bundles like `config.production.js` that multiply with every new
  environment.

In practice, many teams combine environment variables with a secret manager
and small non-secret config files; the principle — config outside the build,
supplied per deploy — is what matters.

### Environments

| Environment | Purpose | Data |
|---|---|---|
| Development | Local work on a developer machine | Fake or seed data; local or dev services |
| Test / CI | Automated tests | Disposable databases created per run |
| Staging | Production-like rehearsal for releases | Realistic but non-production (or anonymized) data |
| Production | Real users | Real data; strictest access |

**Environment parity** (dev/prod parity) means keeping environments as similar
as possible — same database engine and major versions, same deployment
process, same kind of infrastructure — so problems appear before production.
Using SQLite locally but PostgreSQL in production, for example, hides bugs.

Never let lower environments use production credentials or data stores.

### Configuration sources and precedence

Common sources, typically overriding each other in this order (later wins):

1. **Defaults in code** — safe values that apply everywhere (`PORT=3000`
   for local development, a request timeout).
2. **Config files** — non-secret settings checked into the repository, if
   you use them.
3. **Environment variables** — set by the platform, container, or process
   manager for each deploy.
4. **Secret manager** — sensitive values fetched at startup or injected by
   the platform.
5. **Command-line flags** — occasional overrides for scripts and tools.

Document the order your app uses, and log (non-secret) effective
configuration at startup to make debugging easier.

Locally, a `.env` file loaded by Node's `--env-file` flag or the `dotenv`
package is convenient. It must be listed in `.gitignore`; commit a
`.env.example` with variable **names** and placeholder values instead. See
[process, environment variables, and configuration](../nodejs/process-env-and-configuration.md)
for the Node.js mechanics.

### Validate configuration at startup and fail fast

Environment variables are always strings (or missing). Parse and validate
them **once, at startup**, into a typed configuration object, and refuse to
start if anything is wrong:

- Required values are present.
- Types are correct (`PORT` is a number, URLs are valid URLs).
- Values are allowed (`LOG_LEVEL` is one of the known levels).
- Combinations make sense (if `EMAIL_PROVIDER=ses`, AWS settings exist).

The rest of the code imports the validated config object and never reads
`process.env` directly. A misconfigured deploy then fails in seconds with a
clear message, instead of serving errors for hours.

![Configuration from defaults, a config file, environment variables, a secret manager, and command-line flags, each overriding the one before, is merged and validated against a schema; if valid the app starts with a typed config object, otherwise it logs which value is wrong and exits with code 1.](config-startup-flow.svg)

### NODE_ENV and environment names

`NODE_ENV=production` is a widely used convention that many libraries read
to enable optimizations and disable development features (for example,
Express caching view templates and hiding detailed errors). Use it for that
purpose only. For "which deployment is this?" use a separate variable such as
`APP_ENV=staging`, so staging can run with `NODE_ENV=production` behavior
while still being identifiable.

### Feature flags

**Feature flags** are configuration that turns behavior on or off without a
deploy:

- Release a feature to internal users, then a percentage of users, then
  everyone.
- Kill switches to disable a misbehaving feature instantly.
- Separating deploy (code is shipped) from release (feature is enabled).

Simple flags can be environment variables; dynamic, per-user flags need a
flag service or a database-backed system. Remove old flags once a feature is
fully released — stale flags become confusing technical debt.

### What counts as a secret

- Database usernames and passwords, connection strings with credentials.
- API keys and tokens for third-party services (payments, email, SMS, AI).
- Signing keys: JWT secrets or private keys, cookie/session secrets, webhook
  signing secrets.
- Encryption keys.
- OAuth client secrets.
- TLS private keys and certificates' private parts.
- Cloud access keys.

Public identifiers (a public Stripe key, an OAuth client ID, a public URL)
are configuration, not secrets. Anything bundled into frontend code or a
mobile app is **public**, no matter what the variable is called.

### Secret managers

A **secret manager** stores secrets encrypted, controls who and what can
read each one, records access in audit logs, and supports rotation:

| Service | Notes |
|---|---|
| AWS Secrets Manager | Encrypted secrets, IAM access control, built-in rotation for some databases |
| AWS Systems Manager Parameter Store | Hierarchical parameters, `SecureString` encrypted values; simpler and cheaper for basic needs |
| HashiCorp Vault | Self-hosted or managed; dynamic secrets (short-lived credentials generated on demand), leasing, many backends |
| Google Secret Manager, Azure Key Vault | Cloud equivalents |
| Kubernetes Secrets | Platform-level injection into pods; enable encryption at rest and tight RBAC |

The app fetches secrets at startup (or the platform injects them as
environment variables or files), using an identity granted by the platform —
such as an IAM role — rather than another hard-coded credential.

### Rotation

**Rotation** means replacing a secret with a new one periodically and
immediately after any suspected leak. Design for it:

- Support two valid values during a transition (old and new signing keys;
  JWKS with multiple keys identified by `kid`).
- Avoid secrets that are copied into many places manually.
- Prefer short-lived, automatically issued credentials (dynamic database
  credentials, cloud roles) over long-lived static keys.
- Restarting or reloading should pick up new values without code changes.

### Keeping secrets out of git and logs

- Add `.env` and other local secret files to `.gitignore` before the first
  commit.
- Enable **secret scanning** (pre-commit hooks, repository scanning in your
  Git host) to catch committed keys.
- If a secret is committed, **rotate it immediately**. Deleting the file or
  rewriting history does not help — the secret may already be copied, cached,
  or cloned.
- Never log secrets. Redact known fields (`authorization`, `password`,
  `apiKey`), and never log the whole `process.env` or full configuration
  objects. See [logging, monitoring, and tracing](logging-and-monitoring.md).
- Do not put secrets in URLs (they end up in logs and browser history) or in
  error messages.
- Do not bake secrets into container images; supply them at runtime.

### Least privilege per environment

- Each environment has **its own** credentials; a staging key must not work
  in production.
- Each service gets credentials scoped to what it needs (read-only database
  user for a reporting service; an API key limited to sending email).
- Developers do not need production secrets on their machines; production
  access is limited, audited, and ideally temporary.

![Each environment has its own secret store; the production app fetches its secrets at startup with its IAM role; rotation creates v2, reloads the app to accept v1 and v2, then revokes v1; and secrets must never flow into the git repository, logs and error messages, or container images.](secret-lifecycle.svg)

## When to use and when not to use

**Use environment variables when:**

- Values differ per deploy (URLs, ports, log level, feature flags) and the
  platform can set them (containers, PaaS, process managers).

**Use a secret manager when:**

- Values grant access (database passwords, API keys, signing keys) in staging
  or production.
- You need rotation, audit logs of who read a secret, or per-service access.

**Use a config file when:**

- Settings are non-secret, structured, and the same in every environment —
  for example, a list of supported currencies. Keep it in the repository.

**Do not:**

- Commit `.env` files, or bake secrets into container images.
- Put secrets in frontend environment variables — they ship to every user.

| Value | Where it belongs |
|---|---|
| `PORT`, `LOG_LEVEL`, `APP_ENV` | Environment variable |
| `DATABASE_URL` without a password, timeouts | Environment variable |
| Database password, Stripe secret key, JWT signing key | Secret manager, injected at runtime |
| Local development secrets | `.env` file, git-ignored |
| Feature flag toggled without a deploy | Flag service or database |
| Fixed product constants | Code |

## Practical examples

### Validated configuration module with Zod

```js
// config.js — the only place that reads process.env
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  FEATURE_NEW_CHECKOUT: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"), // "false" must not be truthy
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Print variable names and problems only — never the values
  console.error("Invalid configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1); // fail fast: do not start with bad config
}

export const config = Object.freeze(parsed.data);
```

```js
// server.js
import { config } from "./config.js";

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, appEnv: config.APP_ENV }, "server started");
});
```

### `.env.example` committed to the repository

```text
# Copy to .env and fill in real values. Never commit .env.
NODE_ENV=development
APP_ENV=local
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-at-least-32-random-characters
LOG_LEVEL=debug
FEATURE_NEW_CHECKOUT=false
```

```text
# Run locally with Node's built-in .env loader
node --env-file=.env server.js
```

### Loading a secret from AWS Secrets Manager at startup

```js
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

export async function loadDatabaseCredentials() {
  // The service's IAM role grants read access to this one secret
  const result = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ID })
  );
  return JSON.parse(result.SecretString); // { username, password, host, ... }
}
```

## Best practices

- Keep configuration out of code; deploy the same build to every
  environment.
- Read `process.env` in one module; validate, coerce, and freeze it at
  startup; fail fast on errors.
- Commit `.env.example` with names only; never commit `.env` files.
- Store production secrets in a secret manager; grant access by platform
  identity.
- Use separate credentials per environment and per service, with least
  privilege.
- Design for rotation; rotate immediately after any leak.
- Enable secret scanning and redact secrets in logs.
- Treat anything in frontend bundles as public.
- Use `NODE_ENV` for runtime mode and a separate variable for the deployment
  name.
- Clean up feature flags after release.

## In production

- **A deploy starts but fails on the first real request.** *Symptom:* the
  health check passes, then payments fail with "invalid API key." *Detect:*
  errors begin exactly at the deploy time; the new variable is missing in the
  production environment. *Cause:* configuration is read lazily, deep in the
  code. *Fix:* validate all configuration at startup and exit non-zero, so the
  deploy fails before taking traffic.
- **A feature turns on everywhere by accident.** *Symptom:* a flag set to
  `"false"` behaves as enabled. *Detect:* the code checks
  `if (process.env.FEATURE_X)`. *Cause:* environment variables are strings,
  and `"false"` is truthy. *Fix:* parse flags into booleans in one config
  module.
- **A secret is pushed to the repository.** *Symptom:* a secret scanning
  alert, or unexpected usage on the key's account. *Detect:* the alert names
  the commit and file. *Cause:* a `.env` file or hard-coded key was
  committed. *Fix:* revoke and rotate the secret immediately — deleting the
  file does not remove it from Git history — then review the key's usage
  logs.
- **Staging changes production data.** *Symptom:* test orders appear in the
  production database. *Detect:* writes to production from staging hosts in
  database audit logs. *Cause:* staging was configured with a production
  connection string. *Fix:* separate credentials per environment, and network
  rules that stop staging from reaching production.
- **Rotation causes an outage.** *Symptom:* every instance fails to reach the
  database right after a scheduled rotation. *Detect:* authentication errors
  begin at the rotation time. *Cause:* apps cached the old password and never
  reloaded it, or the old credential was revoked immediately. *Fix:* support
  two valid credentials during rotation, and reload secrets on failure or on
  a schedule.

## Important terminology

- **Configuration:** values that vary between deployments of the same code.
- **Secret:** configuration that grants access and must be kept confidential.
- **Environment variable:** a named value in a process's environment.
- **Twelve-factor app:** a methodology for building deployable services,
  including storing config in the environment.
- **Environment parity:** keeping development, staging, and production
  similar.
- **Fail fast:** stopping immediately when configuration is invalid.
- **Feature flag:** a configuration switch that enables or disables behavior
  without a deploy.
- **Secret manager:** a service that stores, controls, and audits access to
  secrets.
- **Rotation:** replacing a secret with a new value.
- **Dynamic secret:** a short-lived credential generated on demand.
- **Secret scanning:** automated detection of credentials in code.
- **Least privilege:** granting only the access required.

## Common mistakes and misconceptions

- **Hard-coding credentials or URLs** "just for now."
- **Committing `.env` files** or pasting secrets into issues and chats.
- **Thinking deleting a committed secret fixes the leak.** Rotate it.
- **Reading `process.env` all over the codebase** without validation, so
  typos and missing values fail late.
- **Treating `"false"` as false** — environment variables are strings.
- **Sharing one set of credentials across all environments.**
- **Putting secrets in frontend environment variables**, which ship to every
  user.
- **Logging the whole configuration** or `process.env` for debugging.
- **Using `NODE_ENV` values like `staging`**, which libraries do not
  recognize.

## Revision questions

1. What is the difference between configuration and secrets? Give three
   examples of each.
2. Why does the twelve-factor methodology store config in the environment,
   and what does "same build for every environment" mean?
3. Why validate configuration at startup, and what should happen if it is
   invalid?
4. What should you do immediately if a secret is committed to a repository?
5. How do secret managers improve on plain environment variables?
6. Why should staging and production never share credentials?

## Further learning

- [The Twelve-Factor App: Config](https://12factor.net/config)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Node.js: How to read environment variables](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs)
- [AWS Secrets Manager documentation](https://docs.aws.amazon.com/secretsmanager/)
- [HashiCorp Vault documentation](https://developer.hashicorp.com/vault/docs)
- Related notes: [Environment variables](../../07-devops-and-deployment/environment-variables.md),
  [Process, environment variables, and configuration](../nodejs/process-env-and-configuration.md)
