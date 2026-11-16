# Task 14: the `blocks-webgl` mount step at Task 2. Investigation

Read-only investigation. No library code in the repository was changed. All instrumentation and the fix prototype
live in scratch copies under `/tmp/claude-501/t14inv/`.

## TL;DR

- **Cause.** Task 2 adds no work to the WebGL mount. Both trees apply the same 10,263 changes (10,000 owner adds and
  263 anchor child adds), and the time the apply spends outside GC is the same within about 3 ms.
  - The +40 ms is one extra V8 major GC cycle that lands inside `WebGLSceneBackend.applyMany`. It is an incremental
    mark-compact over the 200–250 MB JS heap: about 35 ms of marking steps on the main thread plus a 4–5 ms finalize
    pause.
  - Both GC cycles inside the apply are started with `gc_reason: "external memory pressure"`.
  - The WebGL encode allocates about **185 MB of off-heap `Float32Array`s per mount**:
    - 55 MB of temporary `InstanceList.toArray()` copies;
    - 125 MB from the doubling growth of `InstanceRanges`;
    - 3 MB of glyph runs;
    - 1 MB from the element table's growth.
  - V8 starts a mark-compact for each ~64 MB of external growth. The first one always falls inside the apply. The
    second one is triggered near the end of the apply, so it lands inside in some runs and not in others.
- **What Task 2 changes is the odds, not the work.** In untraced runs, the second cycle lands in about 24% of HEAD's
  mounts and about 68% of Task 2's (n = 25 each). The bench reports a median of 5, so its median follows the more
  common mode.
  - HEAD with only Task 2's three always-initialised per-block fields added, and nothing reading them, already shows
    the slow mode in 6 of 10 mounts. This is the sign of a GC threshold that small heap changes move.
- **Why only WebGL.** The Canvas2D renderer has no backend apply: it encodes nothing and allocates no typed arrays in
  its scene share. Its mount does have two major GCs, the same in both trees, but they cost about 15 ms of main-thread
  time and fall outside the scene share.
- **Incidental, not inherent.** None of Task 2's requirements (reach and levels learned at mount, offscreen too) adds
  WebGL work at mount for the default `Anchor`.
  - The final tree has the same cost: the second cycle lands in 4 of 5 traced mounts.
  - It also carries about 17 ms of extra apply work that is not GC, from later tasks. I did not investigate that.
- **Recommended fix (option A).** Stop copying each element's instances twice in the WebGL encode: hand the opaque
  instance lists to `InstanceRanges` as views, not `slice()` copies.
  - The prototype on the final tree: scene share 347 → 287 ms, apply 289 → 232 ms, mount 796 → 728 ms (medians,
    n = 10, untraced, same session as the baseline).
  - The apply gets one GC cycle in every traced mount (5 of 5 for each of `t2-fixA` and `final-fixA`).
  - This more than recovers the Task 2 step (+32 to +48 ms), and puts the final tree at or below HEAD.
  - It is backend-internal and does not touch anything Task 2 guarantees.

## Method

### Trees

- **Scratch copies.** I copied `/tmp/claude-501/graph-bisect/{head,t2}` to `/tmp/claude-501/t14inv/{head,t2}`. The
  copies keep this tree's bench scripts and the symlinked `node_modules`.
  - The final tree is `/tmp/claude-501/t14inv/final`: the `t2` copy with `packages/graph/src` and
    `packages/graph-minimap/src` replaced by the worktree's current sources.
  - The bench scripts in `graph-bisect/head` are identical to this tree's (`diff -rq` is clean).
  - `make-tree.sh` rebuilds any variant with the instrumentation applied.
- **Variants:**
  - `head-fields`: HEAD plus three unused fields on `Block`, with Task 2's initialisers (`true`, `6`, `false`).
  - `*-fixA`: the option A prototype (below).

### Instrumentation (in the copies only)

- **`patch-bench.py`**, in `scene/blocks.ts` and `scene-run.mjs`. Per mount it prints one `T14` line per repeat:
  - mount ms, scene share, the `setEntities` ms;
  - the scene split: level, write and apply (the bench's own `sceneMeter` counters);
  - for each tick: ms, the `graph.scene.update` time, level, write, apply and the store size;
  - the backend counters below.

  It also adds an optional CPU profile of the mount (`console.profile`, `T14_PROFILE_DIR`) and optional tracing
  (`browser.startTracing` around `window.bench.setup`, `T14_TRACE_DIR`, `T14_CATEGORIES`).
- **`patch-backend.py`**, in `WebGLSceneBackend.applyMany`:
  - the phase timers: release loop, `applyChange` loop, `rebaseChildren`, `flushDepth`;
  - the change counts (owner adds, child adds, updates).
- **`patch-trace.py`**: `performance.mark` for the start and end of the apply (frames with more than 1000 changes).
  The bench marks `t14-mount-start` and `t14-mount-end` around the mount.
- **`patch-ext.py`** (`t2` only, one run): counts the bytes of the typed arrays the encode allocates, per source. Only
  arrays over 64 bytes count, since V8 keeps typed arrays of up to 64 bytes on the heap.

### Runs

- **Command:**

  ```
  bash with-chromium-lock.sh <log> node /tmp/claude-501/t14inv/<tree>/scripts/bench/culling/scene-run.mjs --gpu \
    --scenes guarantee --scales 0.038 --modes pan --renderers blocks-webgl --repeats 5 --no-bulk
  ```

  It is driven by `/tmp/claude-501/t14inv/run-ab.sh`. Trees are interleaved within each round. `--no-bulk` only skips
  the actions after the mount.
- **Environment:** Apple M3 Pro, Chromium 145, ANGLE Metal.
- **Logs:** `/tmp/claude-501/t14inv/logs/`. Traces: `trace/` (full categories: `devtools.timeline`, `v8`,
  `disabled-by-default-v8.gc`, `blink.user_timing`); `trace3/` and `trace5/` (light categories: `v8` and
  `blink.user_timing`). CPU profiles: `prof/`.
- **Analysis scripts:**
  - `stats.mjs`: the medians of the `T14` lines.
  - `cycles.mjs`: apply windows grouped by the number of GC cycles started inside them.
  - `trace2.mjs`, `trace3.mjs`, `trace4.mjs`: GC per mount phase, with the GC reasons.
  - `analyze.mjs`: self time per function in the CPU profiles.

## Measurements

### 1. The split of the scene share (untraced; n = 25 mounts per tree, 5 sessions, interleaved; medians in ms)

| Part | HEAD `47fe8a02` | Task 2 `13dc2af2` | Δ |
|---|---|---|---|
| mount | 721.1 | 735.3 | +14 (the part outside the scene drifts by ±30 ms; per-session Δ: +56, +100, +23, −42, −7) |
| **scene share** | **294.1** | **326.4** | **+32** (per-session Δ: +44, +54, +36, +34, −16) |
| `setEntities` (synchronous) | 21.0 | 21.2 | 0 |
| level methods (`sceneComponentStats.levelMs`) | 13.8 | 13.8 | 0 |
| element writes (`sceneComponentStats.writeMs`) | 41.3 | 38.2 | −3 |
| **backend apply** (`stats.lastApplyMs`) | **235.1** | **273.0** | **+38** |
| — release loop | 0.3 | 0.3 | 0 |
| — **`applyChange` loop (adds and encode)** | **226.2** | **265.0** | **+39** |
| — `rebaseChildren` (child sub bases and encode) | 3.2 | 3.3 | 0 |
| — `flushDepth` (depth key writes) | 4.6 | 4.6 | 0 |
| changes applied | 10,263 (10,000 owner adds, 263 child adds) | same | 0 |
| ticks with scene work | 1 (one `applyMany` call; the second tick is 3 ms of nothing) | same | |

The first untraced session alone gives the same picture as the bisect:

| Tree | Mount | Scene | Apply loop |
|---|---|---|---|
| HEAD | 677.2 | 283.0 | 211.8–223.0 |
| Task 2 | 733.6 | 327.2 | 219.1, 261.7, 263.6, 265.9, 272.4 |

The `applyChange` loop is **bimodal** in both trees: one mode around 212–235 ms, the other around 260–330 ms.

| Tree (untraced) | n | apply loop > 255 ms ("slow mode") | sorted apply loop (ms) |
|---|---|---|---|
| HEAD | 25 | 6 (24%) | 212 214 216 217 218 219 219 220 222 222 222 223 226 234 234 239 244 246 249 251 **268 278 280 289 324** |
| HEAD with three unused fields | 10 | 6 (60%) | 219 219 223 238 246 **264 264 269 271 371** |
| Task 2 | 25 | 17 (68%) | 219 222 224 227 230 231 232 252 **260 262 264 265 265 266 269 272 281 287 296 297 301 302 306 311 328** |

### 2. What the two modes are: GC inside the apply (traces)

Traced mounts, grouped by the number of major GC cycles that start inside the apply window. GC is the main-thread
time in `V8.GCIncrementalMarking`, `V8.GCFinalizeMC` and `V8.GCScavenger` events. Mutator is the apply time minus GC.
Medians in ms.

| Tree | n | 1 cycle: n / apply / GC / mutator | 2 cycles: n / apply / GC / mutator |
|---|---|---|---|
| HEAD | 20 | 8 / 227.3 / 45.2 / 181.7 | 12 / 273.7 / 85.0 / 190.3 |
| Task 2 | 20 | 5 / 229.9 / 48.4 / 186.6 | 15 / 277.2 / 84.3 / 192.2 |
| HEAD with three unused fields | 10 | 7 / 237.4 / 46.9 / 192.9 | 3 / 305.0 / 95.2 / 209.8 |
| final tree | 5 | 1 / 247.5 / 49.3 / 198.2 | 4 / 311.7 / 99.0 / 217.2 |
| Task 2 + fix A | 5 | 5 / 250.3 / 52.2 / 194.7 | 0 |
| final + fix A | 5 | 5 / 237.8 / 42.5 / 195.7 | 0 |

- The second cycle costs +37 to +40 ms of GC on the main thread, plus a few ms of slower mutator (write barriers while
  marking). That is the whole step.
- Conditional on the cycle count, Task 2's apply equals HEAD's within about 3–5 ms.
- Tracing slows both trees and raises the share of slow mounts (HEAD: 60% traced against 24% untraced). Read the
  traced numbers for the mechanism and the untraced ones for the odds.

**The per-cycle detail of one traced Task 2 mount** (`trace/t2/mount-blocks-webgl-2.json`, V8 `GCTraceGCNVP`):

| When | Reason | Heap (MB) | Main-thread marking | Pause |
|---|---|---|---|---|
| pre-apply, at about 210 ms | `allocation limit` (old-gen limit, about 137 MB consumed) | 157.6 → 145.1 | 0.8 ms (254 steps) | 6.4 ms |
| apply, at about 97 ms in | `external memory pressure` | 243.1 → 197.4 | 32.7 ms (898 steps) | 4.7 ms |
| apply, at about 183 ms in | `external memory pressure` | 207.1 → 199.6 | 35.9 ms (940 steps) | 3.8 ms |

- The second cycle frees only 7.5 MB of JS heap. It exists for the ArrayBuffers.
- The main-thread marking is high in the apply because the apply allocates fast: V8 makes the mutator help with the
  marking. The pre-apply cycle marks almost entirely on background threads.

**Where the second trigger lies.** In the fast and the slow HEAD mount (`trace/head/mount-blocks-webgl-{2,4}.json`),
the events are identical to within 2 ms up to 176 ms into the apply:

- the first pressure start at 99 ms;
- its finalize at 139–141 ms;
- the array-buffer sweeps at 143–148 ms;
- two pressure checks with scavenges at about 164 ms and about 175 ms.

The slow mount then hits a third pressure check at 188 ms, which starts the second cycle. The fast mount never does
before its apply ends at 224 ms.

- The external-memory headroom left after the first cycle runs out within the last stretch of the apply.
- It depends on how much of the freed ArrayBuffer memory the concurrent sweeper has returned by then. That is a knife
  edge.
- Task 2's tree is on its slow side more often. HEAD plus three unused fields moves the odds the same way.

### 3. What the apply allocates off-heap (Task 2 copy with `patch-ext.py`, identical in all 5 repeats)

| Source | Bytes per mount | Lifetime |
|---|---|---|
| `InstanceList.toArray()`: `data.slice` of each encode's lists (`encodeRects.ts:265`, `encodeText.ts:228-230`) | 55.4 MB | Garbage right away: `setInstances` copies it into `InstanceRanges` |
| `InstanceRanges.reserve` growth: `new Float32Array(capacity)`, doubling (`InstanceRanges.ts:493-506`) | 125.3 MB | About half live (the final buffers, about 62 MB), the rest garbage |
| `glyphRun`: `runScratch.slice` (`glyphs.ts:548`) | 2.9 MB | Live (layout cache) |
| `ElementTable.ensureCapacity`: grows one 1024-texel row at a time (`tables.ts:76-82`) | 1.1 MB | Mostly garbage |
| **Total** | **≈184.6 MB**, of which ≈118 MB is garbage | |

- The change set and the encode code are the same in HEAD and Task 2: Task 2 touched none of `lib/scene/webgl`.
- The final tree's `encodeRects.ts`, `encodeText.ts`, `glyphs.ts` and `InstanceRanges.ts` are byte-identical to
  HEAD's, so the same allocation happens there.

### 4. CPU profile of the mount (5 per tree, 100 µs sampling)

- The apply is dominated by:
  - text: `measureText` 41 ms, `glyphRun`, `placeGlyphs` and `writeTextGlyphs` about 40 ms together;
  - `InstanceList.toArray` at 57–63 ms of self time. The `slice` allocation of off-heap backing stores is costly in
    itself.
- No function appears in one tree only.
- Under the profiler the GC difference mostly vanishes (284 against 291 ms of apply on the stack), so the profiles
  served only to confirm that the JS work is the same. Logs: `prof/`.

### 5. Canvas2D (`blocks`), traced, 5 mounts per tree

- Each mount has two major GCs in both trees:
  - an allocation-limit one at about 20 ms;
  - an external-memory-pressure one at about 410–470 ms, in the final ticks.
- Main-thread incremental marking and finalize: 13–18 ms per mount in both trees.
- Scene share (level + write; there is no backend apply): 43–51 ms in both trees.
- No apply means no allocation burst during marking. So there is no mutator-assisted marking and nothing that moves
  with Task 2. This fits the +3.6 ms in the bisect's Canvas2D column, which is within its noise.

## Answers

### Q1. Where do the ~40 ms go?

All into the WebGL backend apply. The bench's other parts are unchanged:

| Part | Δ |
|---|---|
| level methods | 0 |
| element writes | −3 |
| `setEntities` | 0 |
| `rebaseChildren` (sub-order widths) | 0 |
| `flushDepth` | 0 |
| changes (element bounds, counts) | identical |

Inside the apply, the `applyChange` loop (adds and their encodes) takes +39 ms (median, untraced, n = 25). The traces
show that this is **GC, not encode work**:

| | Apply | GC in apply | Mutator |
|---|---|---|---|
| one cycle | about 227–230 ms | 45–48 ms | |
| two cycles | about 274–277 ms | 84–85 ms | |
| HEAD against Task 2 | | | within 3–5 ms in either mode |

The uploads and instance ranges are not part of the mount's scene share: they happen in `draw()`. The
`flushDepth` and `rebaseChildren` phases are equal.

### Q2. Why WebGL and not Canvas2D?

- Anchor reaches, bounds and sub-order widths change nothing that WebGL encodes at mount:
  - the same 10,263 changes, the same 263 anchor child elements (only the blocks the default camera shows create
    anchors), the same `rebaseChildren` and `flushDepth` times;
  - the per-block Task 2 code on the default path (`picksAnchorClasses()` is false) clears a flag and returns
    (`Block.syncAnchorClasses`, `Block.ts:808`);
  - `Blocks.didUpdateChildren` now unions 10,000 level masks (`Blocks.ts:266`), well under 1 ms.
- The 40k anchors are not created in either tree at mount, on either renderer.
- WebGL pays because its apply encodes every element at once and allocates about 185 MB of off-heap typed arrays doing
  so. That drives V8's external-memory GC trigger, and while the apply allocates, the main thread does the marking
  steps (about 35 ms per cycle).
- The Canvas2D path has no apply and no such allocation in its scene share. Its two major GCs cost about 15 ms of
  main-thread time each mount, the same in both trees.

### Q3. Inherent to Task 2, or incidental?

**Incidental.** It is not a cost of anything Task 2 must do:

- "a block learns its anchor classes' reach at mount, offscreen too" is a no-op for blocks that do not override
  `getAnchorClass`, and the bench's blocks do not override it;
- there is no per-block allocation in the default path apart from three in-object fields (`Block.ts:394-400`), and no
  repeated lookup or extra encode.

Task 2 moves a GC threshold that the WebGL encode sits on:

- HEAD itself lands on the slow side in 24% of untraced mounts (and 60% traced).
- HEAD plus Task 2's three fields, with nothing reading them, lands there in 60% untraced, close to Task 2's 68%. The
  sample is small (6 of 25 against 6 of 10, one-sided Fisher p ≈ 0.05), so this is suggestive rather than proven.

**The final tree still has it.** Its apply has two cycles in 4 of 5 traced mounts. Untraced (n = 10, the same session
as fix A):

| Final tree | Value |
|---|---|
| scene share | 347.3 ms |
| apply | 288.9 ms |
| mount | 795.5 ms |

- This matches the A/B's 727 against 672.
- The final tree's apply also has about 17 ms more mutator time than Task 2's, in both the plain and the fix-A pair
  (288.9 against 270.6; 231.5 against 214.6). It comes from later tasks and is outside this question; I did not split
  it.

### Q4. Fix options

#### A. No per-element copies in the WebGL encode (recommended)

**Where (final tree):**

- `InstanceList.toArray()`, `packages/graph/src/lib/scene/webgl/encodeRects.ts:141-142`.
- Its callers:
  - `encodeRects` at `:265`;
  - `encodeText` at `packages/graph/src/lib/scene/webgl/encodeText.ts:228-230`.
- Their consumers:
  - `WebGLSceneBackend.encode`, `WebGLSceneBackend.ts:945-955` (`setInstances(this.rects.opaque, …)` at `:954`);
  - `writeGlyphs`, `:1012`ff (`setInstances(this.glyphs.opaque, …)` at `:1045`);
  - `setInstances`, `:315-322`, which calls `InstanceRanges.set`, which copies into the batch buffer.

**Change:**

- Add `InstanceList.view()`: `data.subarray(0, length)`, valid until the list's next `reset()` or append.
- Return views for the opaque lists and the opaque subs. Keep `toArray()` copies for the translucent ones:
  `setTranslucent` keeps them in `translucentWrites` for camera-aware texts.
- Move `setInstances(this.rects.opaque, …)` directly after `encodeRects`, so no other encode runs while the view is
  live.

**Measured** with a cruder prototype that turns every `toArray` into `subarray`. That is safe for this bench, which has
no translucent camera-aware text. Untraced, n = 10, same sessions:

| Tree | Apply | Scene | Mount |
|---|---|---|---|
| Task 2 | 270.6 → 214.6 | 319.6 → 268.9 | 729.7 → 685.2 |
| final | 288.9 → 231.5 | 347.3 → 287.2 | 795.5 → 728.0 |

- Traced, every fix-A apply has exactly one GC cycle (10 of 10).
- **Expected saving:** about 55–60 ms of the final tree's scene share. That is the second GC cycle (about 40 ms) plus
  about 15–20 ms of copying and allocation. It is more than the Task 2 step.
- **Risk to Task 2's guarantees:** none. Nothing in anchors, blocks or the scene store changes.
- **Its own risk:** a view kept past the next encode is silently overwritten. Mitigate with a distinct type or name
  for views, the call-order change above, and a unit test that two consecutive encodes do not alias what
  `InstanceRanges` holds.
- **Size:** small. About 20–30 lines in `encodeRects.ts`, `encodeText.ts` and `WebGLSceneBackend.ts`, plus a test.

#### B. Less growth churn in `InstanceRanges` at a bulk mount

**Where:** `InstanceRanges.reserve`, `packages/graph/src/lib/scene/webgl/InstanceRanges.ts:493-506`. The `while
(capacity < target) capacity *= 2` doubling allocates about 125 MB for about 62 MB of final buffers.
`ElementTable.ensureCapacity` (`tables.ts:76-82`) grows one row per 1024 elements, about 1 MB.

**Change:** reserve once per bulk `applyMany`, for example from the add count times the running instances-per-element
of each batch, or grow by a larger factor past a size.

- **Expected:** removes up to about 60 MB of garbage external memory per mount. On top of A, it would make the one
  remaining cycle less likely to land inside the apply: up to about 40 ms more, not measured. Alone, it would probably
  turn the two-cycle mode into one cycle, like A, but without A's copy saving.
- **Risk to Task 2:** none.
- **Its own risk:** over-reservation costs memory. Note that the retained buffers also count as external memory.
- **Size:** medium. A reserve hint through `applyMany`, `InstanceRanges` and the batches, plus tests.

#### C. Restructure Task 2's per-block state (not recommended)

**Where:** `Block.ts:394-400`: `anchorClassesDirty`, `anchorCreationMask` and `anchorClassErrorReported`, always
initialised. Move them into a lazily created object for blocks that override `getAnchorClass`.

- **Expected:** an unreliable 0–40 ms. It shifts the odds of the threshold back toward HEAD's, and any later per-block
  field shifts them again.
- **Risk to Task 2:** low.
- **Size:** small.

The evidence suggests these fields contribute, but the real problem is the encode's allocation, and HEAD itself flips.

#### D. Bench only: a stable mount measurement (not a product fix)

Force the GC state before `setEntities` in `scripts/bench/culling/scene/blocks.ts`: `gc()` is exposed, and the heap
measurement already uses it twice. Optionally, also report the GC ms inside the mount from a light trace.

- This reduces the bimodality that makes a median of 5 swing by 40 ms between sessions.
- It does not change what users pay. A real mount still crosses the external-memory threshold.
- **Size:** small.

### Recommendation

**Option A.**

- Expected saving: about 55–60 ms of the `blocks-webgl` mount's scene share on the final tree (347 → 287 ms median),
  and the mount 796 → 728 ms. That is at or below HEAD's scene share (294–304 ms).
- No risk to the behaviour Task 2 guarantees.
- Option B is a possible follow-up if the single remaining cycle (about 40 ms) is worth chasing.
- Keep Task 2 as it is.

## Limits of this investigation

- **The exact V8 rule** that decides whether the second external-memory check fires was not pinned down. It looks
  like the timing of ArrayBuffer sweeping against the limit V8 resets after the first cycle. The traces show where it
  fires and what it costs, not why one run crosses and another does not.
- **The "three fields tip it" evidence is suggestive.** 6 of 10 against 6 of 25 untraced, and the other way round
  under tracing (3 of 10 against 12 of 20).
- **Session drift.** Absolute mount numbers drift between sessions by ±30 ms. Compare only within a row's session.
  The fix-A numbers were measured interleaved with their baselines.
- **The fix-A prototype is not the proposed change.** It also turns the translucent lists into views. That is unsafe
  in general and was not exercised by this bench.
- **No pixel check.** `blocks-webgl` is the only column, so the bench compares no pixels. The prototype mounted the
  same 10,263 elements, and its apply phases were otherwise unchanged.
