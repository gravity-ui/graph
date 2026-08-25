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
release branches. V2 prereleases are started manually with the `Release v2
prerelease` workflow. On the first run from the current v1 version, select
`premajor` to publish `2.0.0-next.0`. Select `prerelease` on later runs to
increment the prerelease version. The workflow runs only from the `v2` branch
and publishes under `next`.

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
6. publish stable `2.x` under `latest`.

After cutover, `main` is the stable v2 branch and `release/v1` is used only for
necessary v1 maintenance. Release workflow configuration can be adjusted as
part of the cutover change; it is not preconfigured in this temporary setup.

## Practical limits

Do not create `release/v1` before cutover. Do not publish a v2 prerelease under
`latest`. Do not merge v2-only development back into the pre-cutover `main`
branch.

For this short transition, normal pull request review and the manual v2 release
workflow are the approval mechanism. The workflow versions and publishes the
`packages/graph` workspace package explicitly. No additional role system, SHA
ledger, ruleset framework, or scheduled synchronization process is required.
