## Summary

<!-- Describe the change and why it is needed. -->

## V1/v2 routing

- Work type: <!-- v1-maintenance | v2 | sync | release-v1 | release-v2 | cutover -->
- Project phase: <!-- before v2 cutover | after v2 cutover -->
- Target branch:
- Routing rationale:

Follow the
[v1/v2 contribution and synchronization runbook](https://github.com/gravity-ui/graph/blob/main/docs/contributing/v1-v2-routing.md).

## Verification

- Checks run:
- Workflow or preview evidence, when applicable:

## Synchronization record

<!-- Complete for sync work; otherwise write "Not applicable". -->

- Owner:
- Source v1 branch:
- Full source SHA:
- Applicability: <!-- port | no-port -->
- Rationale:
- Sync PR or no-port record:
- Resulting merge SHA:
- V2 conflict resolution or neutralization:
- Verification:

## Checklist

- [ ] The selected target branch matches the current project phase and work type.
- [ ] V1 changes are limited to necessary bug fixes, security fixes, or v1 documentation.
- [ ] A synchronization PR uses a merge commit; squash, rebase, and cherry-pick are not used as the canonical branch sync.
- [ ] Release and preview evidence uses the configured route and does not assume an undocumented destination.
- [ ] This change does not treat v2 cutover as formal v1 deprecation or workflow retirement.
