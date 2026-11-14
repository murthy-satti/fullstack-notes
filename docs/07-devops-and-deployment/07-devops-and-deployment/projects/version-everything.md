# Version Everything

Give every TaskFlow artifact a version a person can trace from a running
system back to a commit, deprecate an API field properly, make open browser
tabs pick up new frontend releases safely, and make the API refuse clients
older than a minimum supported version with a clear upgrade message.

## Why this project helps

- Builds release engineering skills: version schemes, build metadata,
  deprecation policies, and client compatibility.
- Improves **debuggability**: "which version is running?" has an exact
  answer for the API, the web app, and every image.
- Improves **compatibility during deploys**: old clients and new servers
  keep working together while versions are mixed.
- Version skew and forced upgrades are common interview and on-call topics.

## What you need

- The repository and pipeline from [Ship It Pipeline](ship-it-pipeline.md)
  and the image from [Production Image](production-image.md).
- TaskFlow Web (React and Vite), and a desktop or mobile client (a simple
  script that sends a version header is enough).
- release-please, semantic-release, or Changesets for tags and changelogs.

## How to do it

1. Choose what gets which version (API SemVer, web build ID, image digest)
   using [versioning patterns](../release-engineering/versioning-patterns.md).
2. Automate tags and changelogs with release-please or semantic-release; see
   [versioning, tags, and releases](../git-and-github/versioning-tags-and-releases.md).
3. Bake a build ID into TaskFlow Web with a Vite `define` constant such as
   `__APP_VERSION__`, and expose the API's version on `/version`.
4. Record the image digest, version, and commit in each deployment record.
5. Deprecate one API field: send the `Deprecation` (RFC 9745) and `Sunset`
   (RFC 8594) headers, document the dates, and keep the field working until
   the sunset passes.
6. Make the web app check `/version` (or a manifest) and offer a reload, and
   recover from `ChunkLoadError` after deploys; see
   [keeping frontend and backend in sync](../release-engineering/keeping-frontend-and-backend-in-sync.md).
7. Have the client send its version (for example `X-App-Version`), and make
   the API answer clients below the minimum with `426` and an error code the
   client turns into an upgrade message.
8. Test it with an old client build and confirm the message appears.

## Done when

- From a request in production you can name the API version, image digest,
  and commit.
- Every release has a tag and a generated changelog.
- Responses using the deprecated field carry `Deprecation` and `Sunset`
  headers, and the field still works.
- An open browser tab notices a new release and reloads without errors.
- An outdated client gets a `426` with a clear upgrade message.

## Stretch goals

- Add a release train calendar for the mobile client; see
  [release trains and release management](../release-engineering/release-trains-and-release-management.md).
- Roll out a desktop update to 10% of users first; see
  [update mechanisms and updaters](../release-engineering/update-mechanisms-and-updaters.md).

## Lessons to use

- [Release Engineering](../release-engineering.md)
- [Releasing desktop and mobile apps](../deployment-strategies/releasing-desktop-and-mobile-apps.md)
- [Images, registries, and tagging](../docker/images-registries-and-tagging.md)

Back to [all projects](../projects.md).
