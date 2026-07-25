# V1/v2 ruleset administration

This runbook turns the repository expectations in
[`expected-policy.json`](../../.github/rulesets/expected-policy.json) into an
administrator-owned GitHub configuration and evidence record. The verifier and
this document are preparation only: they do not create, update, or delete a
ruleset, branch, bypass, or project item.

## Current audit boundary

The Stage 0 read-only audit observed an empty response from the repository
rulesets endpoint and a `404` from the `main` branch-protection endpoint. Those
results do not distinguish absent protection from insufficient caller
permission. They are not evidence that the expected rulesets exist or are
effective.

## Assign owners and the bypass decision

Record these fields in issue #317 before configuration:

- repository or organization administrator owner;
- verifier/evidence owner;
- explicit bypass decision: `none` or `integration`;
- bypass decision owner, approver, and date;
- rationale and controlled-test evidence for the selected decision;
- for `integration`, the approved release-automation GitHub App identity and
  numeric actor ID, actor type, and `pull_request` bypass mode;
- for `integration`, why the bypass is necessary and why `pull_request` is the
  minimum mode;
- rollback owner.

Test `none` first. Approve `integration` only if a controlled release-automation
test proves that the App cannot create or update the reviewed release pull
request without it. Do not infer an actor from a workflow secret, app name, or
fixture. The `4242` actor in the offline fixture is test data only. Until an
administrator records either decision, actual verification must fail.

## Prepare the rulesets

Using the GitHub administrative UI or a separately reviewed administrative
procedure, prepare three active branch rulesets with the exact names and ref
targets in `expected-policy.json`:

1. `main`, active for the current stable v1 branch;
2. future `v2`, active before `refs/heads/v2` is created;
3. future `release/v1`, active before that ref is created during cutover.

Each ruleset must:

- require pull requests, at least one approval, and resolved review
  conversations;
- include `merge` in `allowed_merge_methods` on `main` and `v2`;
- prevent deletion and non-fast-forward updates;
- require exactly `Verify Files`, `Tests`, `Package Contract`, and `E2E Tests`;
- enable strict required-status-check handling;
- contain no bypass actors when the decision is `none`;
- contain exactly the approved release-automation integration in `pull_request`
  mode when the decision is `integration`.

The `v2` ruleset must omit required linear history so pre-cutover synchronization
merge commits are accepted. The `main` ruleset must also omit it before the
post-cutover `release/v1` to `main` synchronization route becomes active. The
repository policy does not otherwise prescribe a linear-history setting for the
future `release/v1` source branch.

Creating a future-target ruleset does not create its branch. Do not create `v2`
until the complete Stage 0 baseline and the external pre-creation gate in ADR
0001 are approved. Do not create `release/v1` before cutover.

## Verify without changing GitHub

First verify the checker offline:

```sh
node .github/rulesets/verify.mjs --self-test
```

For an approved zero-bypass decision, run:

```sh
node .github/rulesets/verify.mjs --bypass-mode none
```

For an approved integration decision, run:

```sh
node .github/rulesets/verify.mjs \
  --bypass-mode integration \
  --bypass-actor-id "<approved numeric actor id>"
```

The verifier calls only these read endpoints:

- `GET /repos/gravity-ui/graph/rulesets`
- `GET /repos/gravity-ui/graph/rulesets/{ruleset_id}`

An empty list or API error fails with an explicit permission/state ambiguity;
it is never treated as success. For review without GitHub access, use a captured
ruleset-detail array:

```sh
node .github/rulesets/verify.mjs \
  --fixture path/to/rulesets.json \
  --bypass-mode none
```

Do not commit a capture containing sensitive administrative metadata.

The list request includes inherited rulesets. For each protected ref, the
verifier evaluates every returned active branch ruleset whose `ref_name`
condition includes the ref and does not exclude it. Unexpected overlap,
unsupported target syntax, or an unsupported active rule fails closed because
its combined effect cannot be proven safe. Pattern matching follows GitHub's
documented `File::FNM_PATHNAME` behavior: `*` and `?` stay within one path
segment, `**` crosses `/`, and character sets, ranges, and negation are
supported. Malformed classes or escapes and unsupported brace syntax fail
closed. A future GitHub pattern form requires an explicit verifier update before
it can pass.

## Evidence gates

Before creating `v2`, record in #317:

- ruleset URLs/IDs and names;
- administrator and bypass-decision owners;
- the recorded bypass decision, rationale, and controlled-test evidence;
- only for `integration`, the approved bypass actor ID, type, and mode;
- exported or captured rule details;
- successful verifier output;
- confirmation that `refs/heads/v2` does not yet exist.

Immediately after creating `v2`, rerun the verifier and record:

- effective ruleset details for the new ref;
- required-check visibility;
- a ruleset evaluation or controlled pull-request result showing that review,
  checks, deletion/force-push protection, and merge commits behave as expected.

Stage 1 remains blocked until that post-creation evidence is accepted. Repeat
the corresponding pre-creation and post-creation evidence gates for
`release/v1` during cutover.

## Rollback and failure handling

If preparation or verification fails, do not create the target branch and do
not weaken another ruleset to proceed. Record the mismatch, restore the last
reviewed administrative configuration using the administrator-owned change
procedure, and rerun the read-only verifier.

If the post-creation `v2` check fails, stop Stage 1 and block merges until the
prepared policy is effective. Do not delete or force-update the branch as an
informal rollback. Any ruleset rollback or bypass change is a separate,
reviewed administrator action with before/after evidence.
