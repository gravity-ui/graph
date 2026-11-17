# Plain connection overview LOD: quality and editable-layout gate

Measured 17–18 November 2026 against `b3365a1a22fbd1205b2d805626b70eec58814bac`. The control includes the independent unchanged-props fix described below. PR: [454](https://github.com/gravity-ui/graph/pull/454).

## Scope and representation

The candidate reduces ordinary built-in Bézier submissions at overview scales without creating another mesh or WebGL context. It groups two consecutive records in an existing eight-chord resident bin, or four records in a sixteen-chord bin, into one instanced draw address. The vertex shader evaluates the same resident float32 control points, normally using four chords per original piece. If an edited chunk in the eight-chord bin is promoted to sixteen chords, its pair uses eight chords per piece. Line and polyline records remain on their existing exact path.

The geometric certificate checks the entire stroke strip, including normals, joins, rounding and AA extent, against a one-eighth-device-pixel displacement budget. It runs when source geometry changes. Complete groups can be compacted inside a partially visible span; incomplete groups at cuts, source boundaries and native draw barriers stay separate. Original order is preserved. AA admission still uses the canonical plan; fewer submitted vertices cannot silently select a different AA policy.

Only built-in-created Bézier segment arrays with numeric world widths are considered. Custom code can mutate those arrays, so provenance alone is not the proof: the certificate checks the actual controls. Copied/custom arrays, hard dashes, active effects, pixel widths, translated origins, unsafe tangents and poorly conditioned cameras keep the detailed representation. Inactive eligible stock effects can use overview; activation restores their exact path. No public API or styling option was added.

The certified device-scale band is `1/128 … 1/16`. Entry uses a 10% inset on both ends; an active overview survives only inside the original band and all camera safety checks. This hysteresis prevents repeated large address writes during tiny reversals near a threshold. It never extends the quality band. Context reset clears the previous selection.

## Independent fix for structural editing

Adding or deleting a connection reconciled the connection list and called `BlockConnection.propsChanged` with unchanged props on every retained view. Its unconditional `updateLine` replaced their scene primitives. The fix retains the superclass hook and calls `updateLine` only when the existing shallow equality helper detects a real prop change.

On two actual add/reconnect/delete cycles, the original Nirvana baseline performed 148,840 encodes and approximately 249.65 MB of source writes; ETL performed 80,008 encodes and approximately 9.216 MB. With the guard, twenty cycles perform 80 encodes: 278,400 source bytes in Nirvana and 217,600 in ETL. The LOD comparison uses this corrected control, so this improvement is not attributed to LOD.

The regression asserts retained component **and primitive** identity after unrelated add/delete, while an actual arrow-prop change still replaces geometry. Context/state invalidation and custom superclass hooks remain active. Structural reconciliation and order preparation still have substantial CPU cost; local writes do not mean constant-time editing.

## Method and observed coverage

Chromium with ANGLE Metal on Apple M3 Pro, browser viewport 1600×1000, DPR 2, deterministic seed 7. The plain fixture is the actual Nirvana Max Graph Test: 13,916 blocks and 18,604 resolved connections. ETL has 10,000 blocks and 10,000 connections, graph area 1600×965, its default HTML layer and minimap enabled, and effect cutoff `.1`.

Fit pan uses control/candidate/candidate/control order, 100 measured frames per run after a full warm trajectory. Mutations move connected blocks and actual groups, and exercise repeated add/reconnect/delete and eligibility-changing width edits. GPU timing runs are serial, without concurrent builds or CPU tests. Heap and forced-GC runs are separate from latency measurements.

| Fit view | Corrected control | Overview candidate |
| --- | ---: | ---: |
| Nirvana stationary fit instances | 587,566 | 513,781 (−12.56%) |
| Nirvana pan GPU median, two runs | 31.315 / 29.557 ms | 25.536 / 25.195 ms |
| ETL stationary fit instances | 425,060 | 425,060 |
| ETL certified starts / compact IDs | 0 / 0 | 0 / 0 |

Nirvana GPU time improves by approximately 15–18.5% in adjacent pairs in this experiment. The rAF intervals straddle refresh thresholds; this is not a frame-rate multiplier or a Canvas-parity claim. ETL's timed pan has a median of 424,017 instances in every run; the table separately records its stationary coverage frame. Default ETL does not qualify for this LOD: many of its short routes already have only two or three canonical pieces, while their translucent batch requires four. No per-link rejection histogram was collected, so this does not establish the reason for every excluded link. No ETL geometry reduction or GPU improvement is claimed.

## Camera, quality and mutation evidence

Camera-only warmed zoom with the pointer outside the scene performs zero source encodes and zero source geometry writes in both fixtures. Pointer hover changes during a zoom are genuine scene changes and must not be counted as camera-only work. Culling and compact-address changes still have a cost.

Before hysteresis, 240 tiny reversals around the upper threshold uploaded 321.85 MB of addresses, despite zero source geometry writes. With hysteresis this falls to 5.08 MB, versus 3.90 MB in the control. Backend draw p95/max falls from 16.7/67.6 ms to 10.8/12.2 ms; control is 10.8/17.3 ms. rAF remains noisier than the earlier control. A final smooth-zoom run has draw p95 9.4 ms and one 85.7 ms outlier inside mixed-plan preparation, away from the LOD boundary. Its cause was not established without a GC trace; it is not hidden by reporting only the percentile.

Actual Nirvana fit pixels differ by at most 2/255 per channel; detailed `.1` and `.25` frames match the control byte-for-byte. All three ETL comparisons are byte-identical. Independent browser scenarios also cover fractional pan, multiple DPRs, translucent crossings, unsafe fallback, tagged style widths, effect activation, move/add/delete and return to the same picture. Overview is bounded approximation, not universal pixel equality: isolated opaque MSAA edge samples can differ more than the full-scene comparison. Representative [reference](2026-11-17-plain-overview-lod/dpr-2-overview-detailed1.png), [overview](2026-11-17-plain-overview-lod/dpr-2-overview-overview1.png), [difference](2026-11-17-plain-overview-lod/dpr-2-overview-difference1.png) and [metrics](2026-11-17-plain-overview-lod/dpr-2-overview-metrics1.json) are retained.

Source geometry remains local for connected movement: 6,720 bytes/frame for the measured Nirvana link and 800 for ETL; moving twenty Nirvana blocks updates their 28 incident links (206,400 bytes), and moving the actual nineteen-member ETL group updates nineteen links (14,720 bytes). These figures match the corrected control. A local change can still alter overview eligibility and rewrite a visible compact-address suffix; address locality is not promised.

## Memory and cold construction

One hundred add/reconnect/delete cycles restore the original live-record and connection counts in both fixtures. CPU typed-array and GPU capacities plateau between checkpoints 10 and 100. Nirvana's first new link expands an existing GPU allocation in both variants; subsequent cycles reuse it. This bounded test does not prove absence of every long-lived heap leak.

At fit, measured path CPU backing capacity changes from 96.38 to 98.29 MB in Nirvana and from 251.84 to 252.11 MB in ETL. Source GPU texture capacity is unchanged. Compact addresses reduce Nirvana's initial address storage from 1.57 to 1.27 MB. Certificates add bytes per record; the canonical-to-compact map adds four bytes per reserved address when used. Capacities retain their high-water mark.

Cold preparation numbers in the JSON cover the first nonempty frame, not every deferred anchor or HTML handover. Repeated warmed-process samples do not demonstrate a meaningful cold-start speedup; no such claim is made.

## Acceptance status

The first counterbalanced mutation gate found a reproducible CPU regression in the candidate. Nirvana add/reconnect/delete draw p95 was 33.1/35.0 ms versus control 30.0/27.5; ETL was 48.5/54.9 versus 46.6/47.3. Eligibility-changing width edits also added roughly 3–4 ms. Source writes stayed local. The initial explanation that ETL processed an all-undefined compact-source array was disproved: both measured source snapshots already returned `undefined` for no coverage. These failed measurements are retained rather than attributed to noise.

The final address-loop change separates the canonical loop from compaction, reuses a validated common span prefix, determines the physical source once per span/source boundary and writes offset mappings only at span boundaries, which include all command boundaries. All three renderer callers read those boundaries. A changed source revision invalidates the prefix shortcut. No new cache or geometry representation was added.

The repeated control/candidate/candidate/control gate gives the following backend draw p95 values. Compare within this last series: absolute ETL timings changed between series, so combining earlier controls with the new candidate would be misleading.

| Editing scenario | Corrected control, two runs | Final candidate, two runs |
| --- | ---: | ---: |
| Nirvana add/reconnect/delete | 28.9 / 44.4 ms | 29.8 / 31.3 ms |
| ETL add/reconnect/delete | 55.7 / 48.2 ms | 46.6 / 49.1 ms |
| Nirvana early eligibility-changing width | 24.0 / 18.3 ms | 18.6 / 19.8 ms |

The previous consistent CPU premium no longer reproduces; candidate and control overlap within the observed run variation. Source writes and encode counts remain equal. This accepts the scoped LOD change, **not** a general editing-performance target: structural rAF p95 is still roughly 100–170 ms, and a local eligibility change can still require scanning visible addresses. The original mixed-plan preparation and component reconciliation remain separate bottlenecks.

## Verification and limits

Final checks: 187 suites, 1,967 passing tests, 9 snapshots, 6 existing todo; graph typecheck; scoped ESLint with no errors and 13 warnings; package/E2E build. All 80 selected browser scenarios pass in Chromium Metal and WebKit, covering connections, effects, labels, delegated ports, context restoration, child order and the new overview scenarios. Independent source review covered viewport rounding, packed texture boundaries, hysteresis, command-boundary offset access and append/shrink cache validity.

The [measurement JSON](2026-11-17-plain-overview-lod-measurements.json) contains exact source hashes and explains which candidate was used for each gate: GPU/quality/memory, hysteresis, then final address-loop editing. It retains all failed iterations, final run order, sample counts, source versus address uploads, capacity checkpoints and limitations. The last loop change leaves shaders, source geometry and eligibility certificates unchanged. No new Canvas comparison, other GPU benchmark, server CI or thousand-block drag result is claimed.
