# V1/v2 contribution, synchronization, and release routing

This runbook applies while Gravity Graph maintains independent v1 and v2 lines.
The governing policy is
[ADR 0001](../architecture-decisions/0001-v1-v2-branch-release-policy.md).
V1 remains stable and supported under a maintenance-only policy; it is not
deprecated.

## Choose the target branch

Use the project phase and change type to select the pull-request target:

| Project phase     | Target       | Accepted changes                                               |
| ----------------- | ------------ | -------------------------------------------------------------- |
| Before v2 cutover | `main`       | Necessary v1 bug fixes, security fixes, and v1 documentation   |
| Before v2 cutover | `v2`         | V2 features, migrations, breaking changes, and broad refactors |
| After v2 cutover  | `release/v1` | Necessary v1 bug fixes, security fixes, and v1 documentation   |
| After v2 cutover  | `main`       | V2 development, fixes, and documentation                       |

Do not target the v1 branch with new features, broad refactors, or v2 migration
work. Before cutover, `release/v1` does not exist and must not be created.

If a change affects both maintained lines, first submit the v1 maintenance
change to the current v1 branch. After it lands, use the manual synchronization
process below; do not combine unrelated v2 work into the v1 pull request.

## Record work type

Issue and pull-request authors must identify one work type in the template:

- `v1-maintenance` for an allowed v1 bug, security, or documentation change;
- `v2` for v2-only development;
- `sync` for a v1-to-v2 synchronization decision or pull request;
- `release-v1` or `release-v2` for work on the corresponding release route;
- `cutover` for an explicitly approved cutover task.

These names are routing guidance. If repository labels with the same names are
available, maintainers apply them; otherwise the completed template remains the
authoritative routing record. Do not create or infer labels merely to satisfy
this document.

## Manually synchronize an accepted v1 change

Synchronization is event-driven. Every accepted change to the current v1 branch
creates one dedicated synchronization decision after it lands. There is no
scheduled or automatic synchronization.

Before cutover, synchronize from `main` to `v2`. After cutover, synchronize from
`release/v1` to `main`.

The assigned synchronization owner records:

| Field         | Required evidence                                                        |
| ------------- | ------------------------------------------------------------------------ |
| Owner         | Current synchronization decision owner                                   |
| Source        | Exact v1 branch and full source commit SHA                               |
| Applicability | `port` or `no-port`, with rationale                                      |
| Sync record   | Reviewed synchronization pull request, or explicit no-port issue/comment |
| Result        | Resulting merge commit SHA when ported                                   |
| Resolution    | V2-specific conflict resolution or neutralization, plus verification     |

For `port`, open a dedicated pull request that merges the complete current v1
branch into the current v2 branch. Use a merge commit. Squash, rebase, and
cherry-pick are not the canonical synchronization mechanism because later full
merges must retain ancestry. Record both the source v1 SHA and the resulting
merge SHA.

For `no-port`, record why the v1 behavior does not apply to v2. This rejects the
behavior, not the commit ancestry: a later full merge can still introduce the
content. The later synchronization pull request must identify that content and
neutralize it or explicitly resolve it in favor of v2 behavior, with tests or
other verification recorded.

## Check drift

The release owner performs a drift check before every v2 release candidate and
again before cutover:

1. enumerate v1 commits since the last recorded synchronization boundary;
2. confirm that each has a `port` or `no-port` decision;
3. verify each recorded source SHA and merge SHA against repository ancestry;
4. inspect whether later full merges introduced content covered by `no-port`;
5. resolve and verify remaining behavioral drift before approval.

## Release and preview routing

Before cutover:

| Line | Branch | Versions          | npm dist-tag | Workflow         |
| ---- | ------ | ----------------- | ------------ | ---------------- |
| v1   | `main` | stable `1.x`      | `latest`     | `release-v1.yml` |
| v2   | `v2`   | `2.x` prereleases | `next`       | `release-v2.yml` |

After cutover:

| Line | Branch       | Versions     | npm dist-tag | Workflow         |
| ---- | ------------ | ------------ | ------------ | ---------------- |
| v1   | `release/v1` | stable `1.x` | `v1`         | `release-v1.yml` |
| v2   | `main`       | stable `2.x` | `latest`     | `release-v2.yml` |

Publication requires a reviewed release pull request or an equivalent explicit
approval step. Route release changes through the workflow for their line; never
use the v2 prerelease route to update `latest`.

Before cutover, pushes to `main` and `v2` publish previews to separately
configured destinations so that one line cannot overwrite the other. The
release or pull-request record must link the workflow run and its reported
preview destination as evidence. Do not assume a destination from a branch name
or hard-code an undocumented URL. After cutover, `main` owns the v2 preview; any
continued v1 preview from `release/v1` must use its own configured destination
and must not overwrite the v2 preview.

## Cutover is not v1 deprecation

V1 deprecation and retirement of `release-v1.yml` are separate future decisions.
Cutover alone does not authorize retiring the v1 workflow, deleting
`release/v1`, removing its protection, or changing the `v1` dist-tag. Until a
formal deprecation record defines support dates, communication, and retirement
criteria, both release workflows remain operational.
