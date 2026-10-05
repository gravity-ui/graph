# Layer lifecycle and optional resources

Issue: #358. Base: v2 after #357. Compiler: TypeScript 5.9.2.

`Layer` creates configured Canvas/HTML resources during construction. Missing
resources are explicit `undefined`, including `LayerContext.ctx` and `graphCanvas`.
Detach removes elements but retains resources for reattachment. A configured
canvas requires a real 2D context; construction throws immediately if it is null.
Checked protected helpers support subclasses that require a canvas, while the
graph's own canvas accessor remains required.

Detach aborts graph/DOM listeners and signal subscriptions, cancels camera
movement work, clears movement state and clears the root reference. Signal
cleanup captures its original abort signal and is idempotent. Reattachment
restores HTML activation from the current camera and installs subscriptions once.
Explicit hide/show state is tracked separately so activation cannot undo hide().
GraphLayer store subscriptions now use this cleanup path. Layers validates the
root before attaching, clears DPR cleanup after calling it, and removes destroyed
layers from its registry.

Block lifecycle flags have explicit initial values. Its connected state is
assigned in the constructor before the overridable subscribe hook runs, retaining
custom block metadata and props generics and the application-owned type contract.
No runtime metadata validation is introduced.

Strict diagnostics: core 290 -> 249; React 31 -> 30; minimap 2; devtools 21;
Storybook 188; E2E 0. The baseline may only lose diagnostic identities/counts.
The gate rejects any strict diagnostic in Layer.ts or LayersService.ts and any
initialization/null diagnostic (TS2564/2532/18047/18048) in canvas Block.ts.
Block cleanup also tolerates omitted anchors before the first iteration.
Other Block event/view-state typing remains
tracked as existing debt for later issues.

Validation covers configured/missing resources before attachment, null 2D
contexts, repeated detach, reattachment, signal/DOM cleanup, GraphLayer store
subscriptions, movement cleanup, missing-root validation and destroyed registry
cleanup. Consumer fixtures compile optional resource guards against both source
entrypoints and packed declarations.
