# Release Process (release-please + GitHub Actions)

## Preconditions
- Conventional Commits for all changes
- Secrets: `NPM_TOKEN` configured in repo
- Packages released independently with tags: `graph-vX.Y.Z`, `graph-react-vX.Y.Z`

## Steps
1. Development
   - Changes in `packages/*`
   - Commit messages follow Conventional Commits
   - PR -> merge to `main`

2. Release PR preparation
   - Workflow `release-please` runs on push to `main`
   - release-please analyzes commits and updates/opens a single release PR:
     - bumps versions in `.release-please-manifest.json`
     - updates `packages/*/CHANGELOG.md`
     - bumps `packages/*/package.json` versions

3. Review & merge release PR
   - Verify versions and changelogs
   - Merge release PR when green

4. Create GitHub Releases & tags
   - release-please creates releases and tags per affected package
   - Examples: `graph-v1.2.2`, `graph-react-v1.3.0`

5. Publish to npm
   - Workflow `npm-publish` triggers on `release.published`
   - Detects package by tag, builds the package, publishes with `NPM_TOKEN`

6. Post-release checks
   - Verify npm versions (`npm view`), GitHub Releases, and local `CHANGELOG.md`
   - For hotfixes, push a `fix:` commit and repeat the flow

## Manual triggers
- Run release-please manually from Actions (workflow_dispatch)
- Local: `npm run release:please` to open/update release PR
