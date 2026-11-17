# Connection submission follow-up

The user prioritised connections over MiniMap. Baseline: published `86da2d13`. Preserve public APIs, line/Bézier/polyline geometry, alpha/AA, effects, labels/arrows, delegated ports, hit testing and one WebGL context.

## Completed investigation

- [x] Freeze source and compare actual Running Dash, Nirvana Effects and ETL 10k fixtures. Exclude non-finite ETL camera and isolated-block mutation probes.
- [x] Measure separate CPU submission and GPU costs, including a counterbalanced legacy/Canvas/unified Running Dash comparison. The overview has 8.07× more cubic pieces than legacy.
- [x] Probe owner/sub caches and a shader-tail guard independently. Reject and remove them: no reliable end-to-end gain.
- [x] Probe finer culling before planning, after planning, with per-batch visibility caching, and only on separate native draws. Preserve quality and original AA admission. Reject all implementations: reduced GPU work/calls did not offset CPU/address-upload costs across the matrix.
- [x] Revert every culling/ordering/shader experiment. Keep results, exclusions and reasoning in the research report.

## Small independent GC correction

- [x] Replace PathDrawIds per-range snapshot objects with retained uint32 metadata; preserve exact addresses, validation and partial-upload behavior. Five unit tests and independent review pass.
- [x] Validate real Nirvana sweep ABBA and separate transient-allocation sampling. Do not equate helper speed with frame pacing.
- [x] Run core unit tests, relevant browser connection/port/label/restore checks and types/lint/build on the final source.
- [x] Save the final research summary and acceptance evidence. Commit scope: the accepted change and its tests, this plan, the report and compact measurements.

The final commit reference and results are recorded in the existing Obsidian capture/card after committing.

## Interfaces and review

Only `PathDrawIds` private snapshot storage changes. Its three callers pass ordinary numeric ranges; the 2^24 exact-float validation fits uint32. A separate live count must exclude stale capacity after shrink/clear, and caller range mutations must not alias the snapshot. No public exports, options, dependency, event or geometry-service changes. Numeric capacity retains its high-water mark; source objects are never retained by the snapshot.

All hardware timing is serialised. The rejected refinement variants are archived in frozen scratch sources, not package code. Their native-command lifetime/statistics/animation findings were specific to the removed pipeline. The next overview study must address geometry budget while preserving phase and AA; repeating a fine-culling experiment does not solve a fully visible scene.
