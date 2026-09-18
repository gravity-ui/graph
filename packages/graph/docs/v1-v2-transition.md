# v1 to v2 transition

This guide describes the temporary branch and release setup while Gravity Graph
v2 is developed. It is intentionally small and is expected to be retired after
the transition.

## Before cutover

`main` remains the stable v1 branch. It is the default branch and accepts only
maintenance work needed by current users:

- bug fixes;
- security fixes;
- v1 documentation fixes.

New features, broad refactors, and breaking changes belong on `v2`.

The release channels are:

| Branch | Versions          | npm dist-tag |
| ------ | ----------------- | ------------ |
| `main` | stable `1.x`      | `latest`     |
| `v2`   | `2.x` prereleases | `next`       |

The existing v1 release workflow continues to handle `main` and maintenance
release branches. V2 uses Release Please in manifest mode. Every push to `v2`
asks Release Please to create or update one combined, reviewed release PR from
`release-please-config.json` and `.release-please-manifest.json`. That action
only prepares versions, changelogs, and the manifest; it cannot publish npm or
create release tags.

Release Please keeps the combined PR labeled `autorelease: pending` so later
pushes update both its files and its description. A merged PR keeps that label
until publication and all component tags/releases succeed. The final workflow
step replaces it with `autorelease: tagged`, allowing the next release PR.
Recovery repeats this step safely if publication succeeded but label cleanup
failed.

The first Graph prerelease is bootstrapped by the temporary scoped
`"release-as": "2.0.0-next.0"` option under `packages/graph`. After the release
PR containing `2.0.0-next.0` has merged, remove that option in a normal reviewed
PR before landing more releasable changes. Later Graph prereleases are derived
from the manifest and increment exactly as `2.x.y-next.N`.

The private scheduler is also a manifest component so Release Please can assign
ownership correctly and the `node-workspace` plugin can propagate a scheduler
change into dependent Graph release metadata. Its version and changelog are
internal bookkeeping. The release workflow creates its component Git tag
because Release Please needs tags to locate previous component releases, but it
never publishes the scheduler to npm and never creates a public GitHub Release
for it.

## Releasing a prerelease

1. Let the automatic manifest release PR collect the intended conventional
   commits. Review the exact package versions, changelog entries, dependency
   updates, and `.release-please-manifest.json` together. Merging this PR is the
   release approval.
2. The push workflow accepts only the exact merge commit of the combined
   `release-please--branches--v2` PR authored by the trusted repository App. It
   derives changed components from the current and first-parent manifests and
   rejects any extra file in that release PR.
3. Private components are removed from the npm plan. Public components are
   ordered dependency-first. Before any external write, the workflow validates
   the branch, versions, channels, package boundaries, changelogs, npm state,
   unit and static checks, Storybook, repository E2E, and each package's
   isolated package contract. Every public tarball is built and verified first.
4. The workflow publishes only those exact tarballs under `next`, in dependency
   order. Because every publish command uses the explicit `next` tag, Graph
   `latest` remains on stable `1.x` throughout the transition.
5. After all public packages have been published, the GitHub App creates the
   component tags on the exact release commit. Public components also receive
   non-draft GitHub prereleases with the reviewed component changelog entry as
   release notes. The App installation must grant `Contents: write`,
   `Pull requests: write`, and `Workflows: write`; the workflow requests that token before npm publication,
   so missing permission fails before a partial release.
6. Mark the merged release PR as `autorelease: tagged` and remove
   `autorelease: pending`. Failures before this step leave it pending so Release
   Please cannot silently move on from an incomplete release.

An ordinary push, a handwritten version change, and a release PR with unrelated
files are not release candidates. A scheduler-only manifest release still gets
its internal component tag after repository validation, but produces no npm or
GitHub Release operation.

If the workflow stops after a partial external write, run
`recover-npm-release` from `v2` with only the full merge commit SHA from the same
merged manifest release PR. Recovery requires that SHA to remain an ancestor of
`v2`, reconstructs the exact public and tag plans from the manifest delta,
rebuilds the same deterministic artifacts, skips exact npm versions and tags
that already exist, and completes only missing steps. It cannot be used for an
arbitrary commit. An existing npm artifact is treated as complete when its exact
`name@version` exists and `next` still points to it; recovery deliberately does
not download or compare the published bytes. Existing public versions must form
a prefix of the dependency-first release plan, so recovery rejects a published
consumer whose earlier planned dependency is still missing.

A fresh prerelease cannot skip recovery. For each component, the current `next`
version must already have the expected ancestor tag and, for a public package,
a completed non-draft GitHub prerelease before another numeric suffix may be
published.

`stable-dry-run` exercises the future `main`/stable `2.x`/`latest` Graph policy
from the current `v2` source. It runs the same local validation and a
no-credentials `pnpm publish --dry-run`; it does not create a release PR, tag,
GitHub Release, npm version, or dist-tag change.

## Adding another public package

Before cutover, every public workspace package must be present in both manifest
files and configured for numbered `next` prereleases. Give it a distinct
component tag, a changelog, and a `test:package-contract` script that supports
an exact tarball output. Use a temporary package-scoped `release-as` for its
first exact `next.0`, then remove that option after the bootstrap release PR
merges. The `node-workspace` plugin keeps `updatePeerDependencies` enabled so a
peer-only workspace consumer, such as a future React package, participates when
its changed workspace dependency is released. Release-managed packages must use
the dependency package's canonical name as every `workspace:` dependency key;
pnpm workspace aliases are rejected because Release Please cannot infer that
dependency edge.

During the pre-publication run, `PACKAGE_CONTRACT_WORKSPACE_TARBALLS` contains a
JSON map from already built public workspace package names to their exact local
tarball paths. If the package depends on another package changed in the same
release, its clean consumer fixture must install that local tarball instead of
requesting the not-yet-published version from npm. The dependency-first release
plan guarantees that every changed dependency is available before its consumer.

The manifest delta is the publication allowlist: unchanged public packages are
not packed, published, tagged, or given GitHub Releases. Changed packages are
published dependency-first. A new private package may be a manifest component
for dependency propagation, but it must remain `private: true`; it receives only
the internal tag needed by Release Please.

CI and E2E run for pull requests and for pushes to both `main` and `v2`.
Storybook previews are separate:

- `main`: `/graph/main/`;
- `v2`: `/graph/v2/`.

## Choosing a pull request target

Target `main` only when a change is required for the supported v1 line. Target
`v2` for v2 development and for changes that do not need to ship in v1.

If a fix is needed in both versions, land the v1 fix in `main` first. The two
maintainers then decide whether it applies to v2. Most changes should not need a
special process: make the decision in the issue or pull request discussion.

When the v1 change applies to v2, open a reviewed pull request that merges
`main` into `v2`. Resolve conflicts in favor of the intended v2 behavior. Do
not automate this synchronization or run it on a schedule; it should happen
only for the occasional relevant v1 change.

When a v1 change does not apply, no port or registry entry is required. A short
note in the issue or pull request is enough when the reason is not obvious.

## Cutover

Cutover happens only when v2 is ready to replace v1. The maintainers should:

1. publish the final v1 release from `main`;
2. create `release/v1` from that final v1 state;
3. perform one final reviewed synchronization from `main` to `v2`;
4. verify the final v2 prerelease under `next`;
5. make the v2 line the new `main`;
6. change the manifest package policies and workflow target from `v2`/`next`
   prereleases to `main`/`latest` stable versions, and make public GitHub
   Releases stable;
7. narrow the old v1 `.github/workflows/release.yml` trigger to exactly
   `release/v1`, removing both `main` and the broad `release/v*` pattern, so that
   it cannot publish the new v2 line;
8. prepare, review, validate, and publish stable `2.x` under `latest`.

After cutover, `main` is the stable v2 branch and `release/v1` is used only for
necessary v1 maintenance. The stable dry-run proves the Graph artifact path in
advance, but the branch, version, dist-tag, GitHub Release, manifest policy, and
old-workflow changes above still belong to one reviewed cutover change.

## Practical limits

Do not create `release/v1` before cutover. Do not publish a v2 prerelease under
`latest`. Do not merge v2-only development back into the pre-cutover `main`
branch.

Normal pull request review and the combined manifest release PR are the approval
mechanism. Do not run recovery with a different SHA, move `next` manually,
publish another locally packed artifact, or leave a bootstrap `release-as`
option in place after its release PR merges. No additional role system, SHA
ledger, ruleset framework, or scheduled synchronization process is required.
## React package boundary

React components and hooks now live in `packages/graph-react` and are exported by `@gravity-ui/graph-react`.
The old `@gravity-ui/graph/react` subpath is removed. Core does not depend on React, React DOM, their types, or ELK.
The React package has a workspace peer dependency on core, plus required React 18 and React DOM 18 peers.

Replace React imports and load the two independently owned stylesheets:

```ts
import { Graph } from "@gravity-ui/graph";
import { GraphCanvas, useGraph, useLayeredLayout } from "@gravity-ui/graph-react";
import "@gravity-ui/graph/styles.css";
import "@gravity-ui/graph-react/styles.css";
```

The layered layout algorithm and converters remain framework-independent core APIs; the React package owns the hook.
Storybook and E2E consume the same public package entrypoints. `pnpm run build` builds core before React, and the shared
`tests/package-contract` suite builds and installs one tarball per public package, verifies native imports and strict
declarations, and checks that the React adapter uses the application's core classes.

## Minimap package boundary

`MiniMapLayer`, `MiniMapLayerProps`, `MiniMapLayerContext`, and `TMiniMapLocation` now belong to
`@gravity-ui/graph-minimap`. Replace imports of these symbols from `@gravity-ui/graph` with the new package:

```ts
import { Graph } from "@gravity-ui/graph";
import { MiniMapLayer } from "@gravity-ui/graph-minimap";
import "@gravity-ui/graph/styles.css";

const graph = new Graph({ blocks: [] }, document.getElementById("graph")!);
graph.addLayer(MiniMapLayer, { location: "bottomRight" });
graph.start();
```

Minimap requires core as a peer dependency and does not require React. It uses the public core `Layer` and shares the
consumer's graph, camera, and block components. Navigation, geometry updates, and injected layer styles are unchanged;
there is no separate minimap stylesheet to import. Core no longer includes or re-exports the minimap implementation.
