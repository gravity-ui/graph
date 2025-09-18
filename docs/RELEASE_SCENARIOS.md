# Release Scenarios

## 1) Fix release of @gravity-ui/graph
- Developer merges commits with `fix:` affecting `packages/graph`
- release-please updates release PR with:
  - `packages/graph` version bump: patch (e.g., 1.2.1 -> 1.2.2)
  - `packages/graph/CHANGELOG.md` with Fixes section
- Merge release PR
- Tag created: `graph-v1.2.2`
- `npm-publish` runs only for `packages/graph` and publishes patch version

## 2) Release of both libraries
- Commits affect both `packages/graph` and `packages/graph-react`
  - e.g., `fix:` in `graph` and `feat:` in `graph-react`
- release-please updates release PR with two version bumps:
  - `graph` -> patch (1.2.1 -> 1.2.2), changelog updated
  - `graph-react` -> minor (1.2.1 -> 1.3.0), changelog updated
- Merge release PR
- Tags created: `graph-v1.2.2` and `graph-react-v1.3.0`
- `npm-publish` runs twice (per release tag), publishing both packages

## 3) Feat release of @gravity-ui/graph
- Developer merges commits with `feat:` affecting `packages/graph`
- release-please updates release PR with:
  - `packages/graph` version bump: minor (e.g., 1.2.1 -> 1.3.0)
  - `packages/graph/CHANGELOG.md` with Features section
- Merge release PR
- Tag created: `graph-v1.3.0`
- `npm-publish` publishes `@gravity-ui/graph@1.3.0`

## 4) Major release of @gravity-ui/graph
- Developer merges commit with `BREAKING CHANGE:` in body or `feat!:`/`fix!:` in header
- release-please updates release PR with:
  - `packages/graph` version bump: major (e.g., 1.2.1 -> 2.0.0)
  - `packages/graph/CHANGELOG.md` includes Breaking Changes section
- Merge release PR
- Tag created: `graph-v2.0.0`
- `npm-publish` publishes `@gravity-ui/graph@2.0.0`

## Notes
- If only one package has relevant commits, only that package is versioned/published
- Tag prefix corresponds to component name because `monorepo-tags: true`
- Commit style must follow Conventional Commits for accurate semver
