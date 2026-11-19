# OffscreenCanvas rendering in a worker: feasibility and scope

Assessment date: 2026-11-17. Architecture baseline: `646bbce51abcbc69f88d8223d432bf60138d3887`, with installed luma.gl 9.4.2 and tiny-sdf 2.3.0; the group-drag row below includes the subsequent narrow group-state fix. This is a source and platform assessment; no worker renderer was implemented or benchmarked. Evidence comes from the [final resident-path measurements](2026-11-17-resident-path-results.md) and [group-drag measurements](2026-11-17-group-drag.md), not a worker speedup prediction.

**Recommendation:** spend **3–5 engineer-days on a gated prototype**, then decide from input latency and Live-update measurements. A supported worker renderer retaining existing text, custom effects, fallback, HTML handover and package behavior is approximately **20–35 engineer-days total**, including that prototype. Moving only the WebGL calls is technically straightforward, but insufficient to preserve the current integration contract. The likely benefit is a more responsive main thread during renderer preparation and animation; the current GPU-bound overview will not become twice as fast merely by changing the JavaScript thread.

## What the current measurements permit us to claim

| Workload | Final production evidence | Worker implication |
| --- | --- | --- |
| Full Nirvana, 13,916 blocks / 18,604 connections | WebGL scheduler median 1.8 ms, p95 2.5–2.7 ms; asynchronous GPU median 28.20–28.39 ms | Very little steady main-thread work is available to move. Geometry, fill, samples and GPU bandwidth remain the same. Do not promise an FPS gain. |
| Running Dash, 2,286 / 19,290 | Unified scheduler p95 4.2–4.5 ms; pan rAF p95 17.3–19.4 ms; original dedicated renderer 8.9–9.2 ms | Worker isolation may help input under other page work. It does not remove the retained fine mesh or explain away the remaining legacy gap. |
| Live ETL, 5,000 / 6,000, deterministic 80 ticks | WebGL busiest-update-per-tick median 21.9–22.7 ms, p95 31.8–37.0 ms; rAF p95 about 25 ms | A more promising CPU case, but this scheduler statistic includes graph/layer work outside the backend. It is not 22 ms of transferable rendering cost. |
| First schematic transition after Live | 63.3–67.4 ms scheduler; 3.12 MB largest upload | Renderer preparation could move off the main thread; new component/anchor/label creation can remain there. Worker transfer adds a separate cost. |
| Group drag after the state fix, 19 members in ETL 5,000 / 6,000; MiniMap off | Handler median/p95 1.3/1.6 ms; scheduler 13.4/14.9 ms; nested backend draw 11.4/12.4 ms; rAF p95 16.9 ms | Remaining renderer CPU is a credible isolation target. The removed 95,000 deep snapshots per step and former 240 ms handler were main-thread state work that a renderer worker would not have eliminated. |

GPU timer durations and rAF intervals describe different asynchronous stages and must not be added or subtracted to predict worker FPS. Instrument the boundary before estimating the removable fraction. The GPU will still receive the same record textures, ordered IDs, shaders, exact stroke mesh and render passes.

In that post-fix drag run, enabling MiniMap adds three picture refreshes among 24 measured steps at its 100 ms cadence, costing about 21–22 ms each; rAF p95 becomes 41.3 ms. MiniMap query/Canvas drawing remains outside the proposed scene-renderer worker. Backend and scheduler timings overlap, and the harness does not measure pointer-to-display latency. This strengthens the case for a measured prototype without changing the effort estimate or implying an FPS result.

## Platform and installed-library fit

The HTML standard supports transferring a canvas to a worker and creating WebGL2 there. Transfer must precede context creation; the original element becomes a presentation placeholder. Updates reach that placeholder asynchronously during rendering updates. Consequently, a worker message saying “draw submitted” is not proof that the new image is already visible. These constraints determine initialization, fallback and HTML handover. [HTML canvas specification](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface)

Dedicated workers have `requestAnimationFrame`; the worker should use it while animation is visible, with scene time synchronized to the graph's pause/resume clock. It should not import the existing global scheduler unchanged: its window-free branch uses a 16 ms timer. [HTML animation-frame specification](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)

OffscreenCanvas is shipped across modern engines. Google's overview lists Chrome 69 and Firefox 105; WebKit specifically distinguishes Safari 16.4's 2D support from **Safari 17's WebGL support**. These are historical capability baselines, not a substitute for testing the application's minimum browser versions, WebViews and actual WebGL2 context creation. [Google platform overview](https://web.dev/articles/offscreen-canvas), [WebKit Safari 17 announcement](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)

Installed luma code already accepts `HTMLCanvasElement | OffscreenCanvas`: `packages/graph/node_modules/@luma.gl/core/src/adapter/canvas-surface.ts:158` recognizes offscreen surfaces; its `CanvasObserver` starts DOM observers only when an HTML canvas exists. `@luma.gl/webgl/src/context/helpers/create-browser-context.ts:24` creates WebGL2 for either canvas kind. `WebGLCanvasContext` manages the framebuffer without requiring a DOM element. Use the existing device/model route with explicit dimensions; no luma upgrade or new rendering engine is indicated by this inspection. The actual worker import/attach path still needs a browser smoke test. [luma CanvasContext documentation](https://luma.gl/docs/api-reference/core/canvas-context)

## Boundary supported by the code

All source paths below are relative to the repository root.

| Responsibility | Keep on main thread initially | Move to dedicated renderer worker |
| --- | --- | --- |
| Graph and application state | Signals, custom component methods, connection geometry callbacks, event dispatch, selection, hit testing, DOM measurements | A renderer-owned mirror of already produced scene data |
| Camera and HTML | Input, camera state, container sizing/DPR observation, React/HTML transforms and delegation | Latest accepted camera snapshot and backing-buffer resize |
| Scene preparation | Component view data, semantic LOD creation, styles/rules evaluation, authoritative text measurement/layout | Non-text primitive encoding, resident allocation, depth/overlap scheduling, culling and ordered draw-ID preparation |
| Rendering | Canvas2D fallback and synchronous export | luma device/models, textures/buffers, shader compilation, GPU submission, mixed connection target and composition |
| Effects | Public effect objects, `use()` encoders, fallback callbacks, subscriptions to uniform signals | GLSL descriptors, numeric per-path parameters, versioned uniform values, existing shader plugin construction |
| Text | Font discovery/loading, current layout authority, glyph generation and atlas patches | Glyph instance storage, atlas texture uploads and drawing |

This is a renderer split, not moving `Graph` itself. `graph.ts:130` updates layers before the scene; `GraphScene.ts:266` then flushes the scene and invokes frame-end callbacks. `GraphScene.query()` and scene order are also read synchronously by hit testing and minimap consumers. Moving these APIs wholesale would require an application model migration and would change DX.

The useful seam exists in `lib/scene/SceneRendererLayer.ts:126`: coalesced `applyMany`, styles, then `draw(frame)`. However, `webgl/backendTypes.ts:104` currently exposes synchronous methods, a live `SceneStore`, an HTML canvas and immediately readable stats. A worker proxy needs an internal asynchronous protocol while preserving the public graph API. `WebGLSceneBackend.ts:783` currently retains the store and uses `childrenOf`, `zIndexOf` and style rows during later changes; sending just a list of draw calls would lose those dependencies. A plain-data scene mirror must preserve parent/nested ownership, order, hidden state and style composition.

### Data transport and ownership

Proposed protocol: `init(epoch, canvas, snapshot, resources)`; ordered scene transactions carrying `revision`, deletes/upserts and changed fields; styles/effect/text resource patches; a replaceable `frame(cameraSeq, requiredRevision, size, dpr, level, textPolicy, clock)`; replies for applied revision, submitted frame, resource errors, context state and sampled stats. Name the frame reply “submitted,” not “presented.”

Use one in-flight update plus a coalesced pending update initially. Camera snapshots may replace older cameras; scene transactions must retain delete/re-add, parent-child and resource dependencies. `SceneChangeQueue.ts` already defines the relevant delete-first semantics, but today retains live element references. Messages must snapshot their values. A new attachment epoch rejects delayed replies after detach, renderer switches or context loss. Latest camera and corresponding LOD/text changes must form a coherent revision, rather than letting a new camera draw unavailable level content.

Retain the authoritative main-thread scene for hit testing, Canvas fallback and export. Send small origin/style/uniform changes as data; copy changed geometry once into transferable staging buffers and transfer those, with pooling only if measurements justify it. Never detach the `Float32Array` still owned by a connection or `SceneStore`. Functions cannot be structured-cloned and transferable buffers detach from the sender. Existing effect classes, Signals and `Path2D` icons therefore require explicit descriptors or the current unsupported-primitive/fallback behavior, not blind `postMessage(store)`. [Structured serialization and transfer specification](https://html.spec.whatwg.org/multipage/structured-data.html#safe-passing-of-structured-data)

Worker resident data replaces the current main-thread backend's resident arrays; it should not create a second complete encoded backend. Some semantic scene duplication and bounded staging memory are unavoidable and must be measured. GPU upload bytes remain distinct from message bytes: moving the final ETL's approximately 1.34 MB/tick of GPU uploads does not imply that exactly that amount must cross the worker boundary. Scene deltas can be smaller, while a naive full snapshot can be much larger. SharedArrayBuffer and cross-origin-isolation requirements are unnecessary for the first design.

### Fonts and colors are the largest compatibility trap

`lib/scene/textMetrics.ts:281` creates a **document** canvas and otherwise uses approximate fallback metrics. `GraphScene.ts:409` invalidates measurements, reruns component text calculations and grows bounds on late fonts. `SceneRendererLayer.ts:140` recreates the atlas/backend. Moving these modules unchanged would silently alter layout in a worker.

Workers have their own `FontFaceSet`; document stylesheet fonts are not an automatic shared font registry. Reconstructing known `FontFace` resources is possible, but transparently recovering every application's CSS-connected font source is not a safe generic assumption. Font URLs, credentials, fallback fonts and optical-size metrics need parity. [CSS Font Loading specification](https://drafts.csswg.org/css-font-loading/#font-face-source)

For the first supported implementation, keep the existing measurement/layout authority and atlas generation on main, and pass glyph placements plus dirty atlas rows to the worker. Extract the existing camera-aware text preparation from `WebGLSceneBackend` rather than adding synchronous font RPC. This preserves current exact line breaks but leaves text preparation CPU on main. `tinySdfGlyphs.ts:7` and installed tiny-sdf already support OffscreenCanvas generation; that alone does not establish identical loaded fonts. A later fully worker-owned text path is a separate optimization after a defined font-resource contract and parity tests.

Likewise, `lib/scene/colorAlpha.ts:78` parses hex/rgb directly but falls back through `utils/functions/color.ts:10` to a document canvas for named/HSL colors. Resolve existing color semantics before transport or explicitly provide the same normalization service; do not let non-hex paints become different or disappear in a worker.

### Custom effects keep their public API

`ConnectionEffect.ts:75` stores source, uniform declarations, animation/halo metadata and Signal values, plus application encode/fallback functions. `WebGLSceneBackend.ts:1692` watches those signals; `webgl/shaders.ts:createPathPlugin` builds the luma plugin. Keep the application callbacks and subscriptions on main, register source/type descriptors once by stable effect identity, and forward numeric uniform changes. Recreate worker-side renderer descriptors and the same plugins, including custom-shader fallback and diagnostics. Do not depend on cross-realm `instanceof ConnectionEffect`, which the current validation uses.

Preserve stock-effect identity internally as well: the mixed-path eligibility checks compare the actual built-in fragments. A transport adapter must retain this distinction without asking callers to rewrite effects. Keep interpolation, shader source, opacity/order, AA targets, DPR and color values unchanged; worker isolation requires no adaptive geometry or raster graph cache.

## Lifecycle and UX acceptance

1. **Canvas ownership:** split DOM host creation/removal from the GPU backend (`WebGLSceneBackend.ts:2957`, constructor at `:721`, disposal at `:904`). Main creates a fresh sibling canvas, transfers it before `getContext`, and retains the existing Canvas2D layer. Worker owns one WebGL context and all GPU resources. Replacing a failed worker uses a fresh display canvas; do not attempt to reclaim a context-bearing transferred canvas.
2. **Resize/DPR:** main reports CSS size and DPR; worker preserves current `round(width * dpr)` sizing (`WebGLSceneBackend.ts:831`) and resizes all targets together. Do not read worker-global DPR or let old-size frames overwrite a newer viewport.
3. **Animation:** preserve `SceneClock.ts` stop/start, hidden-page pause and continuous effect phase across renderer recreation. Send the authoritative scene time with pause/resume and frame state; do not substitute a worker-local clock with a new epoch. A worker can continue drawing the last accepted scene while main is busy, but cannot invent new pointer positions or component state. No synchronous waits on the UI thread.
4. **HTML handover:** `graph-react/src/layer/ReactLayer.tsx:40` currently hides/shows HTML at graph frame end after the scene has drawn. Worker submission removes this same-frame assumption. Test camera/HTML registration, hover ports and detailed→schematic transitions with deliberately delayed worker messages. A submission ACK alone is insufficient for a no-blank-frame guarantee. First prototype should retain the main-thread renderer for delegated HTML scenes unless a measured presentation/handover strategy passes; do not ship an unproved delayed hide.
5. **Failure/recovery:** forward creation, compile and context-loss events; retain load/attachment tokens; rebuild worker resources from the latest snapshot after recovery. On timeout, worker exception, blocked asset or unsupported WebGL2, dispose/remove its surface and use the current main-thread renderer/fallback. Test rapid detach/reattach and loss during initialization, not only steady drawing. One active WebGL context remains the target.
6. **Export:** retain `GraphScene.ts:690` synchronous `toImage(): HTMLCanvasElement`, its Canvas interpreter, export preparers and current-view layer composition. It already does not require reading WebGL pixels. Worker rendering must not silently make this API asynchronous. A future exact animated GPU screenshot would be a separately scoped asynchronous operation with a revision/time fence.
7. **Stats/tests:** keep worker timing, main preparation, message bytes/queue age and GPU time separate. `getBackend().stats` can only expose a last reported snapshot in worker mode; internal tests/bench harnesses need an explicit completion barrier. `scheduler.performUpdate()` must retain synchronous state/Canvas test behavior, without pretending the worker has presented a frame.

## Packaging and browser policy

The package currently publishes only its root/styles entry and builds neutral ESM chunks with dependencies externalized (`packages/graph/package.json`, `scripts/build-package.mjs:249`). A copied worker file with bare luma imports is not automatically a deployable browser worker. Publish and test a worker asset/entry resolved by the host bundler, including relative dynamic chunks and production asset base paths. Vite and webpack document the statically analyzable `new Worker(new URL(..., import.meta.url), {type: 'module'})` pattern, but this library's emitted package must be tested as a consumer dependency. [Vite workers](https://vite.dev/guide/features.html#web-workers), [webpack workers](https://webpack.js.org/guides/web-workers/)

Require no app-level worker setup for the ordinary supported path. Preserve lazy loading and SSR imports without browser globals. Test packaged Vite and webpack consumers, CSP that disallows blob workers, denied worker loads and offline/chunk failure. An optional factory/URL escape hatch is a packaging decision only if these tests prove it necessary, not a prerequisite public API expansion. Feature detection must include successful worker startup and WebGL2/device creation, not merely `typeof OffscreenCanvas`.

## Stages and effort estimate

Estimates are for an engineer familiar with this renderer, including focused tests; they are not elapsed-day promises or measured implementation effort.

| Stage | Scope and exit condition | Engineer-days |
| --- | --- | ---: |
| 1. Gated prototype | Same exact shaders/resources in one worker; frozen Nirvana/Dash plus Live deltas; main text preparation; resize, uniform update, and forced failure; measure input latency, boundary CPU and memory | 3–5 |
| 2. Live renderer protocol | Versioned mirror, stable records, sparse updates, backpressure, resource/effect descriptors, context/attach lifecycle and diagnostics | 5–8 |
| 3. Text and UX integration | Extract main-thread text/atlas adapter, font epochs, camera-aware relayout, HTML/camera handover, clock, synchronous export compatibility | 5–9 |
| 4. Packaging and release validation | Published-package worker assets, SSR/lazy behavior, browser matrix, failure tests, performance/quality acceptance | 4–7 |

The itemized range is **17–29 days**; plan **20–35 days** with integration and review contingency, roughly 4–7 working weeks for one engineer. Full worker-side font discovery/layout is excluded and could add roughly **4–8 days after** a viable font-resource contract, with greater uncertainty for arbitrary host CSS. Moving custom components, hit testing, HTML or connection-routing callbacks into a worker is outside this estimate and outside the recommended first scope.

The prototype should record main-thread long tasks and input-to-visible latency under deterministic Live updates, group drag and imposed unrelated page work; backend prepare/submission time; GPU time; message payloads/queue depth; cold attach; and retained/peak memory. Compare the same fixtures, shaders, clock values and DPR against current main-thread WebGL, not a simplified graph. Suggested continuation gate: a material main-thread or input-latency reduction on Live/drag, bounded queues and memory, and no normal-load frame-pacing or handover regression. A concrete target such as ≥5 ms removed from the p95 busy update is a decision threshold, not a forecast. Use the post-fix group-drag baseline above, and measure MiniMap separately: a renderer worker must not receive credit for the already eliminated main-thread copy storm or for MiniMap work it does not own.

Quality acceptance includes frozen-frame pixel comparisons of plain/dashed/custom paths, transparent overlaps and mixed/native barriers; text in multiple scripts and late fonts; DPR 1/2/3, resize and zoom through semantic LODs; HTML delegation/ports during delayed frames; background pause/resume; export; context recovery; unsupported browser/worker failure; and repeated mount/unmount. GPU-bound Nirvana alone is not an adequate success criterion for this work.

## Context and limits

The proposal assumes the existing [scene clock, text and export contracts](../../../packages/graph/docs/system/scene.md) and [HTML handover](../../../packages/graph/docs/migration-guides/v1-to-v2.md#the-handover-to-html). The [original design notes](https://github.com/gravity-ui/graph/tree/fdf03fb76324899490c8bb46e902eb71ecdca5d1/docs/design/scene-blocks-3b) record the earlier decision on raster caching.

No browser worker smoke test, worker FPS result, packaging prototype or new GPU job was performed for this assessment. Capability and code inspection establish feasibility, while the staged experiment must establish value and UX correctness before production migration.
