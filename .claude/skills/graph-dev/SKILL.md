---
name: graph-dev
description: Development workflow for @gravity-ui/graph. Use when implementing features, fixing bugs, or designing APIs in this library.
disable-model-invocation: true
---

# @gravity-ui/graph Development Workflow

Follow these phases in order. Skip to Phase 3 only for trivial one-line fixes.

---

## Phase 1: Planning

Before writing any code, understand what you are touching. Read the relevant source files. Use `EnterPlanMode` for non-trivial features.

**Architecture questions to answer:**

1. **Which layers are affected?**

   Before deciding where to add or change something, discover all existing layers in the codebase:
   - Search `src/` for classes that extend `Layer` to get the current full list
   - For each candidate layer, read its source to understand its zIndex, purpose, and what events it handles

   **Identify the right layer:**
   - Does an existing layer already do something close? Extend or modify it rather than creating a new one.
   - Is it purely visual without interaction? → probably `GraphLayer` or a new Canvas-only layer
   - Is it an HTML overlay? → use the `html` property in Layer constructor with `transformByCameraPosition: true`
   - Is it a new user interaction (drag, click, keyboard)? → check whether it fits into an existing interaction layer or needs a dedicated one

   **If the task specifies which layer to use:** read that layer's source, understand what it currently does, and verify the fit. If the specified layer seems wrong (wrong zIndex, wrong responsibility, event conflicts with existing handlers), raise the concern and clarify with the user before starting.

2. **How do events propagate?**
   - User input → which layer catches it? → which service processes it? → which store signals change? → which components re-render?
   - Are there events that need to be preventable via `executеDefaultEventAction`?

3. **What are the data boundaries?**
   - Store (`RootStore`, signals) — single source of truth
   - Canvas components read from store, never own authoritative state
   - React components sync via `$viewComponent` signal bridge

4. **Does it touch the scheduler?**
   - All Canvas rendering goes through the scheduler (RAF-batched)
   - Don't call `render()` directly — always `performRender()`
   - React updates are synchronous (via signals), Canvas updates are deferred

5. **Are there circular dependency risks?**
   - `affectsUsableRect: false` on HitBox to break cycles with boundary elements
   - Layers must not depend on each other directly

**Output of this phase**: A written plan with affected files, implementation approach, and potential risks.

---

## Phase 2: DX/UX Analysis

After planning, forecast how the feature will be used — before writing a single line.

### Developer Experience (DX)

- How does a library consumer configure this feature? Is the API consistent with existing patterns (e.g., `graph.addLayer(MyLayer, props)`, `graph.setEntities(...)`, `useGraphEvent`)?
- Are there footguns? (e.g., forgetting to call `super.afterInit()`, wrong coordinate space)
- Does it require boilerplate that could be hidden inside the library?

### User Experience (UX)

- What does the end user see and feel?
- Are there edge cases that could produce unexpected visual behavior?
- Does interaction feel responsive (correct z-index stacking, correct hit regions)?

### Critical rule

> **If a clean DX or UX requires compromises from the library — complexity, performance regressions, or incorrect behavior — eliminate the compromises, even at the cost of DX/UX.**

The library is correct and performant first. API ergonomics are secondary. A footgun that the consumer can avoid with documentation beats a footgun baked into the library internals.

**Output of this phase**: A brief written DX/UX assessment. If you identified a tradeoff, explicitly state which side you chose and why.

---

## Phase 3: Development

Follow the conventions from `CLAUDE.md`. Key rules:

- **No `any` type** — use concrete types, `void`, or `unknown`
- **State**: `setState()`/`setProps()` not direct assignment; `performRender()` not `render()`
- **Layers**: DOM ops only in `afterInit()`, never in constructor or `init()`
- **Events**: AbortController via layer wrapper methods (`onGraphEvent`, `onCanvasEvent`, etc.)
- **Children**: `Component.create(props)` not `new Component(props)`; return from `updateChildren()`
- **Signals**: wrap multiple signal writes in `batch(() => { ... })`
- **Coordinates**: components receive world coordinates; canvas transform handles screen conversion

---

## Phase 4: Testing

Choose the right test type for each concern.

### Unit tests — isolated logic, no graph rendering

Write a Jest unit test when the code under test:
- Is a pure function or utility (`src/utils/`)
- Is a service or store class that can be instantiated without a real `Graph` object
- Does **not** require simulating user events on a real canvas
- Does **not** require a running scheduler or animation frame loop

Examples: `HitTest`, `IncrementalBoundingBoxTracker`, coordinate math, store selectors, `BatchPath2DRenderer`.

```bash
npm run test
npm run test -- <pattern>         # run specific test file
```

### E2e tests — user interactions and visual behavior

**Add an e2e test to the test suite** when the fix or feature requires:
- User interaction (click, drag, hover, keyboard)
- Visual verification (z-index stacking, cursor changes, rendering output)
- Camera/zoom behavior
- `setEntities` lifecycle with real block components rendered in the browser

E2e tests live in `e2e/tests/`. Use `GraphPageObject` and its Component Object Models.

```bash
npm run e2e:bundle                 # REQUIRED after any source change
npm run e2e                        # run all e2e tests
npx playwright test <pattern>      # run specific test
```

> **Always run `npm run e2e:bundle` before `npm run e2e`** if you changed TypeScript source.
> The e2e server must be on port 6006. Kill Storybook first if it's running there.

### Self-checking during development

While implementing, write a temporary e2e test **for yourself** to verify that the code behaves as you expect before considering the task done. This is your development feedback loop, not a final test.

**Rules for self-check tests:**
- Place them in `e2e/tests/` alongside other tests — run them, iterate, confirm behavior
- Once verified, decide: does this test cover something the permanent suite should guard? If yes, clean it up and keep it. If it's purely scaffolding for your own debugging, delete it.
- **Never leave temporary assertions, `console.log` calls, or debugging helpers in `GraphPageObject`, `GraphBlockComponentObject`, `GraphConnectionComponentObject`, or other shared POM/COM files.** These files are the stable API for all tests — keep them clean. Add methods to them only if they are genuinely reusable.

### What not to unit-test

Don't write a unit test if the assertion would require:
- Mocking `CanvasRenderingContext2D` in a non-trivial way
- Faking the scheduler loop
- Simulating pointer events on a canvas element

Use e2e for those cases instead.
