# ETL command preparation after a connection retarget

The comparison uses reference `b5712368b82fe6b7d46e3ae115566d296ab668f3` and candidate `68376683`. The test alternates one existing long connection between two valid targets with the minimap disabled. ETL has 10,000 blocks and 10,000 resolved connections. The Nirvana control has 13,916 blocks and 18,604 resolved connections and uses the same saved input on both builds. Both scenarios and the endpoint IDs are documented in the [previous reconnect report](2026-11-18-single-connection-reconnect.md).

## Attribution

The ETL diagnostic split the backend draw into named phases. Cached source bucketing took a median 9.05 ms, including 6.85 ms traversing resident ranges and 1.90 ms sorting bucket fragments. The upper-band merge took 2.15 ms. Filtering took 4.25 ms of the 4.60 ms visible-run phase. Stock program grouping took 0.30 ms. The scheduler reported 22.60 ms including a 21.35 ms backend draw. These nested diagnostic measurements locate repeated work and are separate from the timed comparison.

The source cache now updates a retained source from its previous ordered buckets when the layout changed for a single owner and changed overlap levels are known. It subtracts the previous physical spans and inserts the affected owners' new spans in canonical bucket and buffer order. It shares the unchanged bucket entries. Missing revisions, multiple shape edits, dense layouts and broad edits take the existing full path. Each retained list keeps the preceding shape of its last changed owner. The update still walks the cached bucket list when an incremental edit affects it. The range data remains resident throughout.

The filter processed 258,819 runs in the sampled fit state and emitted 21,425. Three sources with no visible instances accounted for 80,000 input runs. A same-state ABBA replay of skipping those sources and bypassing queries for fully visible sources reduced predicate calls from 258,819 to 175,753. It preserved the exact tuples, but p95 overlapped the reference across the short blocks (reference 4.8/5.1 ms, trial 4.7/4.9 ms). The measured candidate uses the existing filter.

## Timing and image checks

The ABBA sequence used 100 measured retargets per run and fixture, after 30 warmup retargets. Each edit had at least 100 ms to settle before the next. Chromium 145 ran on an Apple M3 Pro with ANGLE Metal, a 1600 × 1000 CSS pixel viewport and DPR 2. The fixture asserted one live WebGL context and zero minimap layers. The timings below pool 200 operations per build and scene. The 95th percentile is the entry at `floor(0.95 * n)` in the sorted sample.

| Metric | Reference median / p95, ms | Candidate median / p95, ms |
| --- | ---: | ---: |
| ETL API to next rAF | 37.10 / 41.70 | 31.45 / 38.00 |
| ETL backend CPU | 27.80 / 31.90 | 22.30 / 27.90 |
| ETL translucent ordering | 16.45 / 19.30 | 7.95 / 14.60 |
| ETL visible runs | 5.80 / 6.80 | 6.40 / 8.40 |
| Nirvana API to next rAF | 36.85 / 42.10 | 36.30 / 42.50 |
| Nirvana backend CPU | 26.75 / 30.30 | 26.45 / 30.20 |

The two candidate ETL runs had ordering medians of 10.60 and 5.90 ms, compared with 15.95 and 16.65 ms in the two reference runs. That spread makes the whole-frame p95 gain smaller than the short initial screen suggested. The remaining CPU budget includes filtering, path address preparation and the rest of the draw. The API-to-rAF measure includes the wait for an animation callback. The display presentation time falls outside that window.

At fit and scale 0.35, the main WebGL framebuffer matched byte-for-byte in all twelve reference-to-candidate comparisons. The test sampled the original endpoint, the moved endpoint and the restored endpoint on both graphs at fixed shader time. It also confirmed actual changed pixels on retarget and exact restoration. HTML compositing falls outside the WebGL comparison.

In 160 warmed ETL zoom frames, neither build encoded or uploaded path source geometry. CPU draw p95 was 10.7 → 10.3 ms. A separate 300-callback sample with Storybook Live enabled produced five backend draws and 196 source encodes per build. This confirms the real Live path still ran on both builds. The sample has too few ticks to estimate a Live tail percentile.

The [raw measurements](2026-11-18-etl-command-preparation-measurements.json) include all 800 timed operations, source and bundle hashes, fixed-time frame hashes, and the exploratory filter replay.

## Remaining filter work

A scratch proof reused filtered tails across 500 randomized schedules and matched the stateless filter. A canonical draw can join instances across the painter-band boundary. The reusable tail starts after that first upper draw, so the edited prefix can still filter the complete joined draw and recheck the seam. Upper predicates also need validation against actual write intervals. In one shared path source, the appended connection started at slot 214,176, immediately after the upper band. The last old upper slots and first new lower slots share a 128-record chunk. Recording the exact upload spans can distinguish these writes from upper geometry. The final build contains only the source-bucket update. No hardware timing exists for filtered-tail reuse.

## Verification

The graph unit suite passed 1,981 tests with six existing todos. The 148 selected browser cases passed in Chromium Metal and WebKit. Package build and graph, Storybook and E2E type checks passed. Scoped ESLint reported zero errors and ten warnings.
