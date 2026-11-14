# Publish These Notes

Deploy a MkDocs site like this one to GitHub Pages with a workflow that
builds on every push to `main`, fails on broken links, and publishes only
from the default branch, plus a pull-request check that builds without
deploying.

## Why this project helps

- Builds a complete, small delivery pipeline you can finish in an afternoon:
  build, validate, and deploy a static site.
- Improves **release safety**: strict builds stop broken links and missing
  pages before readers see them.
- Improves **separation of checks and releases**: pull requests prove the
  site builds, and only `main` can publish.
- A live site with a clean pipeline is a useful portfolio item to show in
  interviews.

## What you need

- A GitHub repository with Markdown pages and an `mkdocs.yml`.
- Python with MkDocs and the Material theme (`pip install mkdocs-material`).
- GitHub Pages enabled with GitHub Actions as the source (free for public
  repositories).
- Helpful but not required: [Ship It Pipeline](ship-it-pipeline.md).

## How to do it

1. Build locally with `mkdocs serve`, then run `mkdocs build --strict` and
   fix every warning, because strict mode turns warnings such as broken
   links into errors.
2. In the repository settings, set GitHub Pages to deploy from GitHub
   Actions.
3. Add a workflow on pushes to `main` with `actions/checkout@v7`,
   `actions/setup-python@v7`, and a pip install of the site's requirements.
4. Build with `mkdocs build --strict`, then upload the `site/` folder with
   `actions/upload-pages-artifact@v5`.
5. Deploy in a separate job with `actions/deploy-pages@v5`, with
   `permissions` of `pages: write` and `id-token: write` and the
   `github-pages` environment; see
   [deploying frontends and static sites](../deployment-strategies/deploying-frontends-and-static-sites.md).
6. Restrict the deploy job to the default branch (an `if:` on `github.ref`,
   or environment branch rules), so other branches can never publish.
7. Add a pull-request workflow that runs the same strict build and uploads
   nothing; see [pipeline design](../ci-cd/pipeline-design.md).
8. Make the pull-request build a required check on `main`.

## Done when

- A push to `main` publishes the site within minutes.
- A broken internal link fails the build and nothing is published.
- Pull requests show a passing or failing build check and never deploy.
- Only the default branch can deploy, even if someone edits a workflow on
  another branch.
- The site is reachable at its GitHub Pages address, or a custom domain.

## Stretch goals

- Add a custom domain with HTTPS; see
  [Your Own Domain, Properly](your-own-domain-properly.md).
- Check external links on a weekly schedule instead of on every build.
- Deploy a preview of each pull request to a separate host.

## Lessons to use

- [CI/CD](../ci-cd.md)
- [GitHub Actions in depth](../ci-cd/github-actions-in-depth.md)
- [Deployment Strategies](../deployment-strategies.md)

Back to [all projects](../projects.md).
