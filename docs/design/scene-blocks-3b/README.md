# Scene v2, plan 3b: design documents

These are the design documents behind the commit "feat(graph)!: child scene components, hit levels and the HTML
handover". They are kept for review. They are working documents, not user docs; the user docs are in
`packages/graph/docs`.

They are copies of working files, so paths inside them still point to where the files were written:
`docs/superpowers/...` for the spec, plan and facts, and `.superpowers/sdd/...` for the task workspace. Those
directories are not in the repository.

| File | What it is |
| --- | --- |
| [2026-11-10-v2-scene-core-design.md](2026-11-10-v2-scene-core-design.md) | The spec of the scene core, step 1. Plan 3b implements §5.1, §5.2, §9, §10 and §12. |
| [2026-11-09-webgl-block-design-questions.md](2026-11-09-webgl-block-design-questions.md) | The scene design decisions, one statement per topic. Read it before the spec. |
| [2026-11-15-scene-blocks-3b.md](2026-11-15-scene-blocks-3b.md) | The implementation plan: Tasks 1–14, with the addenda 3x, 3y and 7x at the end. |
| [2026-11-15-plan3b-facts.md](2026-11-15-plan3b-facts.md) | The facts the plan was built on: the code as it was, the consumers, and the risks. |
| [2026-11-16-plan-3b-decisions.md](2026-11-16-plan-3b-decisions.md) | The decisions as they were applied during execution. It has D1–D8 and В1–В5 with the user's words, the settled items, the Global Constraints and the shared names. |
| [2026-11-16-webgl-mount-investigation.md](2026-11-16-webgl-mount-investigation.md) | Why the WebGL mount got slower: an extra V8 GC cycle, not more work. It also covers the fix, instance views instead of copies, added as Task 14x. |

Decisions made during execution that the plan predates:
- **D6:** the minimap redraws at most once per ~100 ms during continuous changes.
- **D7:** the cost of one minimap picture per action is accepted.
- **D8:** a press on a non-draggable child drags its nearest draggable ancestor. Task 12x implements it.
- **Task 14x:** the WebGL mount fix.

They are in the decisions file and in the investigation.
