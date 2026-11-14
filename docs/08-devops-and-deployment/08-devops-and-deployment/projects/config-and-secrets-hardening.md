# Config and Secrets Hardening

Make TaskFlow API refuse to start with bad configuration, fetch its
database password from a secret store instead of a file, and rotate that
password with no downtime. You also rehearse the full response to a leaked
secret on a throwaway repository.

## Why this project helps

- Builds the habits behind twelve-factor configuration: everything in the
  environment, validated once, with clear errors.
- Improves **security**: no credentials in code, images, or Git, and a
  practiced answer to "a key just leaked".
- Improves **reliability**: a missing variable fails fast at startup
  instead of breaking one request at 3 a.m.
- Interviewers often ask how you rotate a secret without an outage; you
  will have done it.

## What you need

- A secret store: AWS Secrets Manager on a free-tier account, or HashiCorp
  Vault in dev mode on your laptop (`vault server -dev`).
- A validation library such as zod or envalid.
- `git filter-repo` and a separate test repository.
- Builds on [Ship It Pipeline](ship-it-pipeline.md); works with the image
  from [Production Image](production-image.md).

## How to do it

1. List every setting the API reads and move each hard-coded value into an
   environment variable; see
   [configuration fundamentals](../environment-variables/configuration-fundamentals.md).
2. Validate all variables once at startup with a zod or envalid schema and
   exit with a clear message when one is missing or malformed.
3. Keep local values in an untracked `.env` file and know which source wins;
   see [env files and precedence](../environment-variables/env-files-and-precedence.md).
4. Store the MongoDB password in the secret store and let the app fetch it
   at startup with its own identity, caching it and retrying on failure; see
   [secrets management](../environment-variables/secrets-management.md).
5. Rotate with an overlap window: create a second database user (or second
   password), point new instances at it, wait, then remove the old one.
6. Run a load test during the rotation and confirm no request fails.
7. In a test repository, commit a throwaway credential you can revoke, then
   practice the order: revoke and rotate first, check its usage, and only
   then purge it with `git filter-repo`; see
   [undoing mistakes and recovery](../git-and-github/undoing-mistakes-and-recovery.md).
8. Turn on secret scanning and push protection, and add a gitleaks
   pre-commit hook so the next leak is stopped before it is pushed.

## Done when

- Starting the API with a variable removed prints a clear error and exits.
- No credential exists in the code, the image, or the repository history.
- The app reads the database password from the secret store at startup.
- A password rotation completes while traffic flows, with zero failed
  requests.
- The leak drill is written down with the time each step took.

## Stretch goals

- Use dynamic database credentials from Vault with a one-hour lease.
- Encrypt a config file for GitOps with SOPS.
- Separate build-time and runtime settings for TaskFlow Web; see
  [build-time vs runtime configuration](../environment-variables/build-time-vs-runtime-configuration.md).

## Lessons to use

- [Environment Variables and Secrets](../environment-variables.md)
- [Configuration and secrets in Kubernetes](../kubernetes/configuration-and-secrets.md)
- [Pipeline and supply chain security](../ci-cd/pipeline-and-supply-chain-security.md)

Back to [all projects](../projects.md).
