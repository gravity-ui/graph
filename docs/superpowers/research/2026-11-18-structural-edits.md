# Connection editing and the long zoom frame

Measured against `acd245f3` on an Apple M3 Pro in Chromium with ANGLE Metal at DPR 2. The first fixture was ETL with 10,000 blocks and 10,000 connections, HTML and minimap enabled. The second was Nirvana Max Graph Test with 13,916 blocks and 18,604 resolved connections.

The operation sequence uses the public API to add a link, change its target to a different block and remove it through selection and deletion. The consecutive-operation benchmark measures responsiveness under repeated edits. A separate diagnostic waits two additional animation frames after every operation and timestamps completion of the scene draw and scheduler callbacks. This matters because the browser's rAF timestamp differs from the time the callback actually runs. A minimap update can also run after the backend submits the scene draw. The instrumentation records CPU-side draw completion and the first rAF callback. Presentation on the screen was not timestamped. CPU sampling and GC tracing were enabled only in diagnostic runs. Draw time is included in scheduler time.

## Where the time goes

**ETL.** In a settled baseline run, reconnecting the link took about 52 ms from input to the scene draw. The last scheduler callback completed after about 96 ms. Deletion took about 110 ms to the scene draw and about 162 ms to the last scheduler callback. Each reconnect and delete triggered one minimap picture in the four-cycle diagnostic, costing 40–53 ms. Addition triggered none. These timings include the work of the real public selection path on delete.

Changing the link also invalidated the translucent schedule. Adding or removing a translucent element marks the overlap levels for a full rebuild. A move can change levels through its new bounds. A changed layout or level revision then caused every source's range list to be visited, bucketed, sorted and merged again. In the consecutive ETL diagnostic, the largest sampled functions were range iteration, bucket sorting and bucket merging. Geometry writes remained local.

**Nirvana.** With settled operations, the median time to the first rAF callback was 63.5 ms for add, 26.4 ms for reconnect and 106.1 ms for delete. List updates reconstructed child descriptors for every connection. Even with unchanged geometry, the normal reconciliation path delivered props, queued component work and dispatched change events on retained views. The renderer also rebuilt its mixed draw plan on each edit. At fit it read roughly 390,000 submitted pieces to group records by owner and primitive, and read them again to determine stroke widths.

**Deletion in both fixtures.** Removing a selected edge scanned every edge's selection signal. It also unconditionally rebuilt the map and array of all blocks, even with zero blocks selected. Subscribers processed that new block list, including the ETL minimap. Separately, a real change of the graph's usable extent can legitimately require a new minimap picture.

An ETL check with at least 200 ms between operations confirmed the second trigger. Adding the link left the usable bounds unchanged. The new target moved the left bound from −48 to −4,561 and expanded the width from 63,056 to 71,642. Deletion restored the original bounds. The baseline and first prototype each drew one minimap picture for each reconnect and delete, zero for add. Each picture took 36.5–55.2 ms. A scheduler callback can also run on an idle frame, so the picture's own end timestamp identifies completion of this visual update.

Structural profiles included GC pauses up to 24.9 ms on ETL and 20 ms on Nirvana. The same runs repeatedly spent tens of milliseconds in application code. These samples locate work during the measured edits. They do not assign an exclusive cause to every delayed frame.

## Changes checked against those causes

* Delete resolved states from the existing connection selection bucket. Skip block-list publication when no resolved block is selected.
* During child reconciliation, a built-in connection can skip delivery of equal parent props if nobody observes that change. Compare against pending props as well as the last applied props. Custom connection classes and subscribed views retain their original callback path, including listeners or dispatch hooks on ancestors.
* Reuse the buckets for each translucent source whose actual draw positions stayed the same. A changed source still follows the original sorting and merging rules. The cache holds the current snapshot for each source and the most recent merged schedule. Unchanged camera frames retain the existing outer fast path.
* Each owner/sub pair represents one scene primitive. Its pieces all have the same encoded width, so the mixed plan only needs to read the first width in the run. Owner zero/sub zero still scans the whole run because zero-filled resident holes can alias that pair.

## Zoom

The historical 85.7 ms Nirvana draw spent 81 ms inside `buildMixedPlane` at scale ~0.02575. The saved sample had no GC or CPU trace. Its scale was inside the certified LOD band. Camera culling changed the submitted ranges, which required a new mixed plan.

Four further warmed 240-frame zoom cycles per fixture, with the pointer outside, produced maximum draw times of 18.2 ms on ETL and 17.1 ms on Nirvana. The longest GC pauses were 2.53 and 2.23 ms respectively. Neither run contained a major GC. Across the 960 Nirvana frames the CPU sampler attributed approximately 667 ms to the width pass and 467 ms to collecting mixed paths. These show repeated work in ordinary zoom frames. The additional 70+ ms in the historical call cannot be assigned to GC, culling or the scheduler from the evidence that was recorded.

The [measurement artifact](2026-11-18-structural-edit-measurements.json) records fixture and source identities, per-operation measurements and trace summaries.

## Final renderer comparison

The first prototype stored one object per physical translucent range in ETL. A control/prototype/prototype/control series confirmed lower median add and delete latency, but ETL had 263,132 duplicate range records. The final implementation reads those ranges from their existing owner. It keeps a numeric comparison vector of 2,105,056 bytes, plus 258,780 sorted bucket entries in the measured ETL fixture. These objects and the merged schedule are additional heap storage. Nirvana's plain path does not use this translucent bucket cache.

The following arithmetic medians are from the final implementation followed by the baseline, twenty cycles each, without CPU or GC tracing. The unit is milliseconds from the public API call to the first subsequent rAF callback. ETL had the minimap enabled in both builds.

| Scene and operation | Baseline median | Final median |
| --- | ---: | ---: |
| ETL add | 72.15 | 60.65 |
| ETL reconnect | 45.30 | 47.75 |
| ETL delete | 110.50 | 70.15 |
| Nirvana add | 64.35 | 45.95 |
| Nirvana reconnect | 25.50 | 25.50 |
| Nirvana delete | 109.05 | 49.85 |

The largest gain is removal of global work on delete. Reconnection still pays for translucent overlap/order or the mixed plan. ETL reconnect draw p95 in this pair increased from 38.4 to 45.0 ms and the combined ETL backend draw p95 increased from 48.3 to 55.6 ms. The optimizations improve median latency of specific operations, with a cost in retained metadata and variable backend tails. The final and baseline WebGL scene framebuffers after add, reconnect and delete matched byte-for-byte on both real graphs at scale 0.35 and fixed shader time. This comparison covers six pairs of framebuffers.

The mixed-width change is identical in the prototype and final build. In a 240-frame warmed zoom comparison on Nirvana, the total CPU time in mixed-plan construction fell from 397.3 to 324.7 ms. Draw p95 went from 9.9 to 9.4 ms. On ETL, which did not use that plan, draw p95 was 9.4 and 9.7 ms. All four runs had zero source geometry uploads. This result addresses repeated width work and leaves the cause of the historical 85.7 ms sample open.

## Minimap in Storybook

ETL at Scale, Scene Interaction and Plugins/MiniMap now start with the minimap disabled. The Minimap switch in Controls attaches and removes the layer on the same graph. In Chromium, each story had zero minimap layers and canvases at startup, one of each after enabling the switch, then zero after disabling it. Nirvana Max Graph Test already starts with zero. The changes are confined to the examples.

On the final renderer, three ETL edit cycles with at least 200 ms between edits produced six minimap pictures with the switch enabled and zero with it disabled. Both runs used the same 10,000 blocks, 10,000 links and initial scale. Each enabled repaint took 42.2–51.6 ms. All were triggered by reconnect or delete changing the graph extent. In that short ordered pair, scene submission with the minimap disabled was slower for all three operations. The observed saving is the work of the second canvas. The experiment does not establish a speedup for the main WebGL draw.

The remaining renderer work is the translucent overlap and order rebuild on ETL reconnect, and reconstruction of the visible mixed plan on Nirvana. A further change should be measured on single-edge edits as well as camera movement, with render order and framebuffer equality checked. Optimizing the minimap itself is deferred.

## Verification

The graph unit suite passed 1,973 tests with 6 existing todos. All 154 selected Chromium Metal and WebKit tests passed, covering scene connections, effects, overview LOD, block ordering, port delegation, connection editing and the enabled minimap. Graph and Storybook type checks passed. ESLint reported zero errors and eight warnings in the WebGL backend. The performance comparisons used Chromium Metal.
