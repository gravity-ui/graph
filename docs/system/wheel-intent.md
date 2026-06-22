# Wheel Intent Resolution

The camera routes wheel input by **intent** — pan or zoom — not by inferred device type (trackpad vs mouse). Classification lives in [`src/utils/functions/wheelIntent.ts`](../../src/utils/functions/wheelIntent.ts) and is configured via graph settings (`resolveWheelIntent`).

This design prepares for a future **input event bus**: raw DOM events (`wheel`, `pointerdown`, …) will be normalized into semantic graph events (`camera:pan`, `camera:zoom`, …). Camera already consumes intent today; later it will subscribe to those semantic events instead of calling the resolver from a raw `wheel` listener.

---

## Why intent, not device type

The browser exposes a single `WheelEvent` for all scroll input. There is no `event.device` property. Signals that overlap between trackpads and smooth-scroll mice (fractional deltas, small steps, PIXEL mode on macOS) made device inference fragile and forced Camera to map device → action in a second step.

Resolving **intent directly** from gesture shape:

- keeps Camera unaware of hardware;
- matches the future event-bus contract (`pan` / `zoom`, not `trackpad` / `mouse`);
- folds `MOUSE_WHEEL_BEHAVIOR` into the input layer where it belongs.

---

## Default resolver

`createWheelIntentResolver()` returns a stateful `TResolveWheelIntent` function. Graph settings use a fresh instance by default:

```typescript
resolveWheelIntent: createWheelIntentResolver(),
```

Rules are evaluated in priority order; the first match wins.

### I1 — Pinch-to-zoom

**Condition**: `(ctrlKey || metaKey)` AND `(hasFractionalDelta || isSmallDelta)`

**Intent**: Zoom

The OS synthesises `ctrlKey=true` for trackpad pinch-to-zoom. Requiring fractional-or-small delta filters out Ctrl+scroll on a mechanical wheel (large steps, typically ≥ 20 px on the macOS smooth-scroll ramp).

Camera applies `PINCH_ZOOM_SPEED` when {@link isPinchZoomGesture} is true (same condition as I1).

---

### Trackpad vs mouse: `deltaMode` and delta shape

Trackpads **always** emit `deltaMode === 0` (`DOM_DELTA_PIXEL`). Mechanical mouse wheels use `LINE` (1) or `PAGE` (2), or on macOS smooth-scroll use **fractional** PIXEL deltas.

| Signal | Source | Resolver |
|--------|--------|----------|
| `deltaMode !== 0` (LINE/PAGE) | **Mouse** wheel | **I4** per `MOUSE_WHEEL_BEHAVIOR` |
| `deltaMode === 0` + **integer** `deltaX`/`deltaY` | **Trackpad** | **Pan** (`I3:integer-trackpad` / `I5:integer-trackpad`) |
| `deltaMode === 0` + **fractional** deltas | **Mouse** smooth-scroll (macOS) | **I4** per `MOUSE_WHEEL_BEHAVIOR` |

Integer check uses `Number.isInteger` on raw `deltaX` and `deltaY` (PIXEL mode only).

Timing thresholds remain for fractional trackpad inertia (`I3:rapid-small`, PIXEL mode only) and I4 burst smoothing after a mouse step.

---

### I2 — Horizontal or diagonal movement

**Condition**: both axes ≥ **2 px** (normalized) and the smaller axis is at least **50%** of the larger (no Shift)

**Intent**: Pan

Ignores small `deltaX` noise on predominantly vertical mouse wheel ticks and trackpad inertia (drivers sometimes emit `deltaX=±1…3` alongside vertical scroll).

---

### I3 — Integer trackpad

**Condition**: `deltaMode === 0` (PIXEL) + integer `deltaX`/`deltaY` + rapid stream (&lt; 38 ms since previous event)

**Intent**: Pan (`I3:integer-trackpad`)

Any per-event magnitude, including inertia peaks ≥ 20 px. Horizontal and diagonal gestures are handled by I2 first.

---

### I5 — Integer trackpad slow scroll

**Condition**: same integer PIXEL shape, not rapid stream

**Intent**: Pan (`I5:integer-trackpad`)

---

### I4 — Classic mouse wheel step

**Condition**: vertical-only wheel tick — LINE/PAGE mode, **or** **fractional** PIXEL delta with `|deltaY| ≥ 20 px`

**Intent**: depends on `MOUSE_WHEEL_BEHAVIOR`

| Constant value | Intent |
|----------------|--------|
| `"zoom"` (default) | Zoom |
| `"scroll"` | Pan |

Physical mouse wheels emit LINE/PAGE steps or smooth-scroll **fractional** ramps. **Integer** PIXEL steps are trackpad — handled by I3/I5, never I4.

**`I4:fractional-mouse`**: slow (not rapid stream), vertical-only, **fractional** PIXEL delta in the **~3–5 px** notch band (e.g. Δy ≈ -4.000244). Respects `MOUSE_WHEEL_BEHAVIOR`. Starts the **120 ms burst window**.

---

### I3 — Rapid stream with small delta (fractional trackpad inertia)

**Condition**: previous event **< 38 ms** ago, `deltaMode === 0`, and **both** normalized axes **< 20 px** (fractional PIXEL path; integer trackpad uses I3/I5 above)

**Intent**: Pan

Trackpad inertia when deltas are fractional on some drivers. Integer trackpad scroll uses I3/I5 above.

---

### I5 — Ambiguous vertical scroll (sticky last intent)

**Condition**: none of I1–I4 matched

**Intent**: carry forward `lastIntent` (initial default: **Zoom**, aligned with default `MOUSE_WHEEL_BEHAVIOR`)

Integer trackpad scroll is handled by **I3/I5** before I5 runs. Mouse wheel zoom uses **I4** (≥ 20 px fractional ramp peaks and `I4:fractional-mouse` for slow fractional notches).

---

## Decision flow

```
WheelEvent arrives
│
├─ I1: ctrl/meta + (fractional or small)?
│     → Zoom
│
├─ I2: diagonal OR |deltaX| ≥ 2 (normalized)?
│     → Pan
│
├─ I3/I5: integer PIXEL delta (trackpad)?
│     → Pan
│
├─ I4: classic mouse wheel step OR large single-axis step?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
├─ I3: rapid stream (< 38 ms) + both axes < 20 px (fractional)?
│     → Pan
│
├─ I4: slow fractional notch (< 20 px)?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
└─ I5: else → last intent (default Zoom; integer trackpad already handled above)
```

---

## Signals and normalization

### deltaMode

| mode | value | Typical source |
|------|-------|----------------|
| PIXEL | 0 | **Trackpad** (always); macOS smooth-scroll **mouse** (fractional) |
| LINE | 1 | **Mouse** wheel (Windows/Linux and others) |
| PAGE | 2 | **Mouse** wheel (legacy) |

Trackpad scroll never uses LINE/PAGE — those modes route straight to I4 (mouse).

All magnitude thresholds use pixel-equivalent values after normalization:

| mode | multiplier |
|------|-----------|
| PIXEL (0) | ×1 |
| LINE (1) | ×16 |
| PAGE (2) | ×600 |

### Fractional delta

Only in PIXEL mode (`deltaMode === 0`). **Integer** raw deltas → trackpad pan; **fractional** → mouse (I4). Used for I1 (pinch) and debug signals on all platforms.

Checks use **raw values only** — multiplying by DPR before an integer test caused false positives on Windows at non-integer OS scaling (e.g. 110 % → DPR ≈ 1.1).

### Inter-event timing

**Rapid stream**: gap since previous event `< 38 ms`.

There is no cold-start or 60 s sticky device session — only I5's `lastIntent` bit.

---

## Integration with Camera

```typescript
// Transitional path in Camera.handleWheelEvent:
const intent = settings.wheelIntentFromEvent(event, dpr, MOUSE_WHEEL_BEHAVIOR);

if (intent === EWheelIntent.Pan) {
  handlePan(event);   // → future: graph event "camera:pan"
  return;
}

const acceleration = isPinchZoomGesture(event) ? PINCH_ZOOM_SPEED : 1;
handleZoom(event, acceleration);  // → future: graph event "camera:zoom"
```

`dpr` is passed from `layers.rootSize.value.dpr` (updated via `observeDPR`) for API stability; the default resolver does not use it yet.

---

## Known limitations

### Slow vertical scroll can be ambiguous on macOS

Trackpad two-finger scroll and smooth-scroll mice both emit `deltaMode === 0` with fractional deltas at low velocity. The resolver distinguishes them by delta shape (integer vs fractional) and `MOUSE_WHEEL_BEHAVIOR`. After a pan gesture, I5 may keep panning until a distinct I4 step or Ctrl+scroll (I1) zoom.

### PointerEvents / TouchEvents do not help for wheel routing

Trackpad scroll on macOS is translated to `WheelEvent` only; `pointerType` stays `"mouse"`. Touch events fire on touchscreens, not trackpads. Intent heuristics remain the only portable tool.

---

## Configuring and debugging

```typescript
import {
  EWheelIntent,
  createWheelIntentResolver,
  enableWheelIntentDebug,
} from "@gravity-ui/graph";

const graph = new Graph({
  settings: {
    resolveWheelIntent: createWheelIntentResolver(),
  },
});

// Custom resolver:
graph.updateSettings({
  resolveWheelIntent: (_event, _dpr, _mouseWheelBehavior) => EWheelIntent.Zoom,
});

// Debug logging (browser console, development builds only):
enableWheelIntentDebug();
// Or capture structured entries yourself:
enableWheelIntentDebug((entry) => {
  console.log(entry.rule, entry.result, entry.input, entry.signals);
});
```

Debug hooks are explicit opt-in. Each wheel event logs two plain-text lines: a one-line summary and a `JSON.stringify` payload you can copy from the console.

See also [Camera](./camera.md) for `MOUSE_WHEEL_BEHAVIOR` and camera constants.
