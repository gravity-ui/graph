# ADR 0001: v1 maintenance, v2 development, synchronization, and cutover

- Status: Proposed for Stage 0
- Decision issue: [#315](https://github.com/gravity-ui/graph/issues/315)
- Parent initiative: [#310](https://github.com/gravity-ui/graph/issues/310)
- Audited Stage 0 base: `058990e019c1a79458a50584cb21666689ab9c3c`
- Approved `v2` creation commit: not selected yet; see [Selecting the `v2` creation commit](#selecting-the-v2-creation-commit)

## Context

Gravity Graph v1 must remain a stable, supported line while v2 is developed and
released independently. The two lines need explicit branch, release, and
synchronization rules so that v2 work cannot accidentally change the v1 package
contract or publish to the stable npm channel.

Cutover to v2 and formal deprecation of v1 are separate decisions. Until a
formal deprecation decision is recorded, v1 remains supported under the
maintenance policy below.

## Decision

### Branch and release ownership

Before cutover:

| Line | Branch | Branch role | Allowed versions | npm dist-tag | Workflow |
| --- | --- | --- | --- | --- | --- |
| v1 | `main` | Default, stable, maintenance-only | stable `1.x` | `latest` | `release-v1.yml` |
| v2 | `v2` | v2-only development | `2.x` prereleases | `next` | `release-v2.yml` |

`release/v1` does not exist before cutover. It must not be created as part of
Stage 0 branch preparation.

After cutover:

| Line | Branch | Branch role | Allowed versions | npm dist-tag | Workflow |
| --- | --- | --- | --- | --- | --- |
| v1 | `release/v1` | Stable, maintenance-only | stable `1.x` | `v1` | `release-v1.yml` |
| v2 | `main` | Default v2 development and stable releases | stable `2.x` | `latest` | `release-v2.yml` |

The release workflows are independent. Both remain present and operational
after cutover. Retiring `release-v1.yml`, the `release/v1` branch, or the `v1`
dist-tag requires a later, explicit v1 deprecation decision; cutover alone does
not authorize any of those actions.

Release configuration must enforce the branch, major version, prerelease state,
and dist-tag before publication. Before cutover, `release-v2.yml` must be unable
to update `latest`. Publication requires a reviewed release pull request or an
equivalent explicit approval step. Preview destinations for `main` and `v2`
must be distinct before cutover.

### v1 maintenance scope

Before and after cutover, v1 accepts only:

- necessary bug fixes;
- security fixes;
- documentation changes relevant to v1.

Features, broad refactors, and v2 migration work do not target the v1 branch.
Before cutover they target `v2`; after cutover they target `main`.

A v1 change that alters a supported public entry point must update the v1
package-contract baseline and receive an explicit v2 synchronization decision.
The contract baseline and checks are defined by [#314](https://github.com/gravity-ui/graph/issues/314).

### Manual synchronization from v1 to v2

Synchronization is event-driven, not scheduled or automatic. Each accepted v1
change creates one synchronization decision after it lands on the v1 branch.
Before cutover the source and target are `main` and `v2`; after cutover they are
`release/v1` and `main`.

The decision/release owner records the following in a dedicated tracking issue,
pull request, or release checklist:

| Field | Required value |
| --- | --- |
| Source | Exact v1 branch name and source commit SHA |
| Applicability | `port` or `no-port`, with rationale |
| Synchronization | Link to the sync pull request, or the explicit no-port record |
| Result | Merge commit SHA when synchronized |
| Resolution | Any v2-specific conflict or neutralization and its verification |

When the change applies, synchronization uses a reviewed pull request that
merges the v1 branch into the v2 branch. The pull request must be merged with a
merge commit. Squash, rebase, and cherry-pick are not the canonical branch
synchronization mechanism because they do not preserve the ancestry needed for
later full merges.

A no-port decision rejects the v1 behavior, not its commit ancestry. A later
full merge can therefore bring that content into the v2 tree. If it does, the
sync pull request must explicitly neutralize it or resolve the conflict in favor
of the intended v2 behavior, and record that resolution.

Before every v2 release candidate and again before cutover, the release owner
performs a drift check:

1. enumerate v1 commits since the last recorded synchronization boundary;
2. verify that every commit has a `port` or `no-port` decision;
3. verify source and result SHAs against the repository ancestry;
4. inspect no-port content that may have arrived through a later full merge;
5. resolve and test any remaining v1/v2 behavioral drift before approving the
   release candidate or cutover.

### Selecting the `v2` creation commit

The audited Stage 0 base is
`058990e019c1a79458a50584cb21666689ab9c3c` (`v1.11.3`). It identifies the
known starting point for Stage 0 work; it is **not** the approved `v2` creation
commit because it does not yet contain the complete Stage 0 delivery baseline.

The decision owner may select the creation commit only after all of the
following are present on `main` and verified:

- the reusable v1 package-contract fixture and checks from #314;
- CI for `main` and the future `v2` branch;
- distinct preview routing for `main` and `v2`;
- independent `release-v1.yml` and `release-v2.yml` workflows and their
  pre-publication guards from #313;
- contribution, synchronization, preview, and release routing documentation
  from #316;
- the repository-verifiable ruleset artifacts and preparation from #317;
- an explicit disposition for every open pull request targeting `main`, as
  required by #312.

Ruleset activation is a separate, mandatory pre-creation gate. Before the `v2`
Git ref exists, the assigned repository or organization administrator must
create and activate a ruleset targeting the future branch name `v2`. The
administrator must record the ruleset owner and verifiable evidence of its
effective configuration in #317, including required pull requests and checks,
review requirements, deletion and force-push prevention, merge-commit support,
and only the minimum release-automation bypass. Repository-verifiable artifacts
do not substitute for this external configuration, and this ADR does not claim
that the external gate has already passed.

The selected commit must descend from the audited Stage 0 base. The decision
owner records its full SHA in both this ADR's `Approved v2 creation commit`
field and issue #315 only after both the repository baseline gate and the
external ruleset-activation gate have passed. The branch-creation operator then
verifies that `main` resolves to that exact SHA, creates `v2` from it, and
records the same SHA as the initial common commit in #312. Immediately after
creation, the assigned administrator must verify and record in #317 that the
ruleset is effective on `v2` and that its required checks apply. Stage 1 is not
authorized until that post-creation verification passes. Any baseline change
after approval invalidates the selection and requires a new full SHA approval
before `v2` is created.

This record-and-selection rule deliberately prevents premature creation of the
long-lived `v2` branch.

### Cutover readiness and ownership

The cutover decision record assigns roles, not permanent named individuals:

- **Decision owner** confirms every readiness criterion and authorizes or stops
  cutover.
- **Release owner** runs the release, synchronization, drift, and publication
  checks and records their evidence.
- **Rollback owner** owns the stop/go checkpoints and executes the documented
  rollback or recovery decision.

One person may hold more than one role only when repository governance permits
it, but each role and current assignee must be explicit in the cutover tracking
issue. Repository or organization administrators remain responsible for
ruleset operations described by #317.

Cutover is ready only when:

- Stage 0 exit criteria in #310 and branch validation in #312 are complete;
- the v1 contract, CI, preview, release routes, and publication guards pass on
  their actual protected branches;
- all required checks and rulesets are effective, including support for
  merge-commit synchronization;
- every v1 change has a verified synchronization decision and the final drift
  check is clean;
- the final v1 and final v2 release candidates pass their agreed test suites;
- the decision, release, and rollback owners have accepted the evidence and
  rollback checkpoints.

### Cutover sequence

The release owner executes these steps in order, with a stop/go checkpoint after
each step:

1. publish the final v1 release from `main`;
2. create `release/v1` from the exact commit that produced that release, record
   the full SHA, and apply/verify its prepared protection;
3. perform the final reviewed merge-commit synchronization from `main` to `v2`
   and record the source and resulting merge SHAs;
4. pass the final drift check and verify a final v2 release candidate under
   `next`;
5. promote `v2` to `main` through the reviewed, ruleset-compliant operation
   approved in the cutover record, then verify default-branch and workflow
   routing;
6. publish stable v2 under `latest`.

The operation used in step 5 must preserve the ancestry established by the
final synchronization and must not rewrite either maintenance line.

### Rollback and recovery

Before stable v2 publication, failure at a checkpoint stops the sequence. The
rollback owner keeps `latest` on the final stable v1 release, restores the last
verified branch/workflow routing where a cutover configuration changed, and
records which checks must pass before retrying. `release/v1`, once created from
the final v1 commit, is retained; it is not evidence that v1 has been deprecated.

After stable v2 is published under `latest`, the version and publication are
treated as irreversible. Recovery must not delete or reuse the published
version, rewrite protected branch history, or silently restore v1 to `latest`.
The rollback owner stops further publication, opens an incident decision, and
chooses an auditable forward recovery such as a corrective `2.x` release. Any
exceptional npm dist-tag or default-branch change requires an explicit
administrator-approved incident action. V1 maintenance remains available from
`release/v1` under `v1`.

### Formal v1 deprecation

V1 deprecation is not implied by creating `v2`, cutting over the default branch,
or publishing stable v2. It requires a separate decision that defines the
support end date, communication, remaining security obligations, dist-tag
handling, branch/ruleset disposition, and retirement criteria for
`release-v1.yml`.

## Consequences

- Stable v1 consumers remain on `latest` until the v2 cutover.
- V2 prereleases cannot accidentally claim the stable channel.
- Full merge ancestry makes synchronization and drift auditable.
- The v2 branch cannot be created until its contract, delivery, documentation,
  and protection baseline is present at one approved commit.
- Maintaining two release workflows is intentional until v1 is formally
  deprecated.
