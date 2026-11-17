# Mixed stock effects without command fragmentation

Continue the authorized unified-scene work. Keep one context, alpha order, MSAA coverage, selection, delegated ports, effect ranges and public effect APIs.

## Diagnosis

Nirvana Effects Pipeline interleaves plain, dashFlow and pulse paths. GPU evaluates each effect, but per-program commands fragment the translucent pass: the initial measurement at fit submits 13,921 calls versus five for Comets. Real pointer interaction also changes the hovered connection's raise and width, causing dense overlap-level work. Direct camera pan and animation alone reuse the overlap order.

## Implementation and checks

- [x] One stock shader dispatches the existing plain/dashFlow/pulse implementations from a per-source flag. Keep records and effect scopes independent.
- [x] Gather compatible sources in the existing shared MSAA pass, preserving logical order and native barriers. Admit both built-in effects to the existing single-sample lower plane without relaxing its coverage guards.
- [x] Bound pathological incremental overlap propagation with exact rollback/full recomputation; skip unchanged absolute bounds.
- [x] For scenes whose translucent paint consists only of compatible resident paths, sort visible owner/sub ranges directly and cache that order. Skip overlap discovery; retain ordinary fallback for other paint/custom programs. Merge adjacent physical ranges so a single effect keeps its compact schedule.
- [x] Compare pixels against the ordinary pass, including curves, mixed effects, scope boundaries, hover raise, selection, opaque occlusion and fallback transitions.
- [x] Paired hardware measurements on real Nirvana Effects; targeted and regression checks; record measured limits in the accompanying local change.

No new public option or dependency. The changes affect only shader dispatch and the scene's internal scheduling.
