# Environment Variables and Secrets Cheat Sheet

Quick revision of the environment variables and secrets lessons, for the
day before an interview or a configuration task.

## Key commands

| Command | What it does |
|---|---|
| `node --env-file=.env app.js` | Loads the file before your code runs; a missing file is an error |
| `node --env-file-if-exists=.env app.js` | Same, but a missing file is fine |
| `process.loadEnvFile(".env")` | Loads a file from inside your code; keeps variables already set |
| `node -r dotenv/config app.js` | Loads `.env` with the `dotenv` package |
| `bun --env-file=extra.env app.js` | Loads only the named files instead of Bun's automatic list |
| `docker compose config --no-interpolate` | The Compose file before interpolation (without the flag, secrets can show) |
| `docker compose exec api printenv LOG_LEVEL` | What the container actually received (non-secret keys only) |
| `docker history --no-trunc IMAGE` | Build arguments and commands that may contain leaked tokens |

```bash
# "It is in the file, but the app does not see it" (never print values)
env | cut -d= -f1 | sort     # names already exported in your shell
cat -A .env                  # tab = ^I, CRLF = ^M$, trailing spaces
head -c 4 .env | od -c       # a byte order mark shows as 357 273 277
file .env                    # reports UTF-16
```

## Key configuration

Precedence, highest first:

| Tool | Order |
|---|---|
| Node `--env-file` | Existing environment, later `--env-file`, earlier `--env-file` |
| `dotenv` | Existing environment (unless `override: true`), first file in `path`, later files |
| Vite | Real environment (`VITE_*` keys), `.env.[mode].local`, `.env.[mode]`, `.env.local`, `.env` |
| Next.js | `process.env`, `.env.$(NODE_ENV).local`, `.env.local` (not in test), `.env.$(NODE_ENV)`, `.env` |
| Bun | Shell, `.env.[NODE_ENV].local`, `.env.local` (not in test), `.env.[NODE_ENV]`, `.env` |
| Compose container | `run -e`, interpolated `environment`/`env_file` values, plain `environment`, `env_file`, image `ENV` |

Read `process.env` in one config module: coerce types, validate every key,
print problems by name only, exit 1 on failure, and export a frozen object.

## Decision guide

| If you need | Choose | Why |
|---|---|---|
| `.env` loading in a Node service | `node --env-file-if-exists=.env` or `dotenv` | Built in since v20.6.0; `dotenv` adds options such as `override` |
| Shared defaults plus personal overrides | Committed `.env` with safe values, Git-ignored `.env.local` | Vite ranks `.env.[mode]` above `.env.local`; Next.js and Bun do the opposite |
| A value inside a Compose container | `env_file:` or `environment: KEY: ${KEY}` | The project `.env` only fills `${VAR}` in `compose.yaml` |
| Per-user, gradual, or live changes | A feature flag or dynamic config service | No restart, and changes can target users |
| One frontend build for every environment | Runtime `config.json` or a same-origin `/api` path | Build-time values are frozen into the bundle |
| A credential during `docker build` | `RUN --mount=type=secret` | Never stored in a layer; `ARG` can persist in history |
| Secrets on one systemd server | `LoadCredential=` or a `0600` `EnvironmentFile=` | Root-only files, read before the service starts |
| Secrets for pods, VMs, and CI | A secret store, workload identity, OIDC (`id-token: write`) | Audited reads, short-lived credentials, no stored keys |
| Encrypted secrets in Git | SOPS or Sealed Secrets | Readable diffs; no dynamic secrets or per-read audit |

## Numbers and defaults to remember

- Every value is a string: `Boolean("false")` is `true`, and
  `"30" > "100"` is `true`.
- Node `--env-file`: added in v20.6.0, no longer experimental since
  v24.10.0 and v22.21.0; `--env-file-if-exists` since v22.9.0.
- `dotenv` 18 prints `injected env (N) from .env` by default;
  `quiet: true` silences it.
- Vite mode: `development` for `vite`, `production` for `vite build`.
  Next.js inlines `NEXT_PUBLIC_*` at `next build`, but not
  `process.env[name]`.
- Bun expands `${VAR}`; Node's loader and `dotenv` keep it literally.
  Compiled Bun executables autoload `.env` unless built with
  `--no-compile-autoload-dotenv`.
- Kubernetes never updates a running container's environment variables;
  mounted ConfigMap files update eventually. Secrets are base64, not
  encrypted, unless etcd encryption at rest is configured.
- Invalid configuration means exit code 1 at startup: the rolling deploy
  halts and the old version keeps serving.
- `JWT_SECRET`: at least 32 characters (`openssl rand -base64 48`). After
  a key change, accept the old key for at least the token lifetime.

## Top mistakes

- **Editing `.env` while the variable is exported in the shell.** Unset
  it; the existing environment wins in Node, dotenv, Vite, Next.js, and
  Bun.
- **A secret in a `VITE_*` or `NEXT_PUBLIC_*` variable.** Rotate it, and
  move the call behind your backend.
- **Parsing booleans with `Boolean()`.** Use `z.stringbool()` or an
  explicit list of allowed spellings.
- **Defaults for database URLs and secrets.** Make them required and fail
  fast at startup.
- **Expecting the Compose project `.env` inside the container.** Pass the
  key with `environment:` or `env_file:`.
- **Env files with a BOM, UTF-16, or whitespace-only lines.** Use plain
  UTF-8 with LF endings, enforced by `.editorconfig`.
- **A build token passed with `ARG`.** Use a BuildKit secret mount.
- **Only purging a leaked secret from Git history.** Rotate it first;
  clones and forks keep the old value.

## Where to go deeper

- [Configuration fundamentals](configuration-fundamentals.md)
- [.env files and precedence](env-files-and-precedence.md)
- [Build-time vs runtime configuration](build-time-vs-runtime-configuration.md)
- [Secrets management](secrets-management.md)
- [Environment variables and secrets interview questions and answers](interview-questions-and-answers.md)

Back to the [environment variables overview](../environment-variables.md).
