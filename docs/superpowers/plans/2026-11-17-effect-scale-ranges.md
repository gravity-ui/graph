# Effect scale ranges and detailed-pan ordering

User-authorized continuation of the unified scene work. Preserve geometry, visual quality, selection, hit tests and delegated ports.

## Design

`effect.use(input, {minScale?, maxScale?})` selects an inclusive lower and exclusive upper camera scale. Unbounded uses retain existing behavior. Outside the range, draw the original stroke without the shader or its extra halo; Canvas uses its existing effect fallback only inside the range. The same effect may be used with different ranges.

Group resident paths by effect identity and range. Evaluate activity once per group per frame, without re-encoding owners or uploading path records. Keep translucent ordering and conservative overlap bounds. Normal native programs switch to identity by uniform; custom programs mentioning `gl_FragDepth` use a plain sibling model sharing GPU records and addresses. Mixed paths switch their existing per-source plain bit. Visible, active animated ranges alone request another frame; inactive uniform signals do not wake the renderer.

For `orderTranslucent`, distinguish cache checks from real rebuilds. Investigate detailed HTML membership changes using the real ETL 5000/6000 story, and fix only demonstrated invalidation/cost. Cache-hit timings must report zero current work.

## Work and checks

- [x] Public API, validation, all propagation paths and Canvas fallback; focused unit tests.
- [x] Native/mixed shaders, shared storage, animation scheduling and custom depth semantics.
- [x] ETL Controls example for suppressing effects below a scale threshold.
- [x] Reproduce detailed-pan rebuilds, fix the proven cause and compare the same scenario.
- [x] Browser boundary tests, visible/hidden animation, pixels, context restore and no threshold uploads.
- [x] Typecheck, lint and relevant regressions; record results and remaining limits in the existing research capture.
