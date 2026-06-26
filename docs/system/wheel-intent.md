# Wheel Intent Resolution

The camera routes wheel input by **intent** — pan or zoom — not by inferred device type (trackpad vs mouse). Classification lives in [`src/utils/functions/wheelIntent.ts`](../../src/utils/functions/wheelIntent.ts) and is configured via graph settings (`resolveWheelIntent`).

This design prepares for a future **input event bus**: raw DOM events (`wheel`, `pointerdown`, …) will be normalized into semantic graph events (`camera:pan`, `camera:zoom`, …). Camera already consumes intent today; later it will subscribe to those semantic events instead of calling the resolver from a raw `wheel` listener.

---

## Why intent, not device type

The browser exposes a single `WheelEvent` for all scroll input. There is no `event.device` property. Overlapping signals between trackpads and smooth-scroll mice (fractional deltas, PIXEL mode, small steps) made OS-based inference fragile.

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

Rules are evaluated in priority order; the first match wins. Debug logs use **rule ids** (column below), which are more specific than the I1–I5 groups.

| Priority | Rule id (debug) | Intent |
|----------|-----------------|--------|
| 1 | `I1:pinch` | Zoom |
| 2 | `I2:horizontal-or-diagonal` | Pan |
| 3 | `I3:integer-trackpad` / `I3:integer-trackpad-slow` | Pan |
| 4 | `I4:mouse-wheel-step` / `I4:large-step` | Pan or Zoom (`MOUSE_WHEEL_BEHAVIOR`) |
| 5 | `I3:rapid-small` / `I4-burst:smoothing` | Pan or Zoom |
| 6 | `I4:fractional-mouse` | Pan or Zoom (`MOUSE_WHEEL_BEHAVIOR`) |
| 7 | `I5:last-intent` | Sticky last intent (default Zoom) |

---

### Trackpad vs mouse: `deltaMode` and delta shape

Trackpads **always** emit `deltaMode === 0` (`DOM_DELTA_PIXEL`). On Chromium (Chrome/Edge), **mouse wheels also use PIXEL mode** with integer deltas (often ±100 per notch). Firefox still uses LINE/PAGE for mice.

| Signal | Source | Resolver |
|--------|--------|----------|
| `deltaMode !== 0` (LINE/PAGE) | **Mouse** wheel | **I4** per `MOUSE_WHEEL_BEHAVIOR` |
| `deltaMode === 0` + **small integer** `deltaX`/`deltaY` (< 20 px) | **Trackpad** | **Pan** (I3) |
| `deltaMode === 0` + **large integer** in rapid stream (< 38 ms) | **Trackpad** fast scroll | **Pan** (I3) |
| `deltaMode === 0` + **isolated large integer** (≥ 20 px, not rapid) | **Mouse** (Chromium) | **I4** per `MOUSE_WHEEL_BEHAVIOR` |
| `deltaMode === 0` + **legacy wheelDelta ≈ ±120** | **Mouse** (Chromium/Edge) | **I4** (never I3, even in rapid stream) |
| `deltaMode === 0` + **fractional** deltas | **Mouse** smooth-scroll | **I4** per `MOUSE_WHEEL_BEHAVIOR` |

Integer check uses `Number.isInteger` on raw `deltaX` and `deltaY` (PIXEL mode only).

---

### I1 — Trackpad modifier zoom (pinch / Cmd / Ctrl+scroll)

**Condition**: `(ctrlKey || metaKey) && deltaMode === PIXEL`

**Intent**: Zoom (`I1:pinch`)

Trackpads always emit `deltaMode === 0` (PIXEL). When a zoom modifier is held, every wheel tick is zoom — including fast scroll with **integer** deltas and the fractional inertia tail:

| Platform | Modifier | Gesture |
|----------|----------|---------|
| macOS | `metaKey` | Cmd + two-finger scroll |
| macOS | `ctrlKey` | Pinch-to-zoom (OS-synthesised) |
| Windows / Linux | `ctrlKey` | Ctrl + two-finger scroll |

Mechanical mouse wheels use LINE/PAGE (`deltaMode !== 0`) and stay on **I4** per `MOUSE_WHEEL_BEHAVIOR`.

Camera applies `PINCH_ZOOM_SPEED` when {@link isPinchZoomGesture} is true (same condition as I1).

---

### I2 — Horizontal or diagonal movement

**Condition**: diagonal — both axes ≥ **2 px** (normalized), smaller axis ≥ **50%** of the larger (no Shift); **or** predominant horizontal — `|deltaX| ≥ 2` and `|deltaX| > |deltaY|`

**Intent**: Pan (`I2:horizontal-or-diagonal`)

Ignores small `deltaX` noise on predominantly vertical mouse wheel ticks (trackpad inertia may emit `deltaX=±1…3` alongside vertical scroll; integer trackpad is handled by I3 below).

---

### I3 — Integer trackpad (PIXEL mode)

**Condition**: `deltaMode === 0` + integer `deltaX`/`deltaY`, and either:

- both axes **< 20 px** (normalized peak), **or**
- previous event **< 38 ms** ago (rapid stream) with peak **≥ 20 px**

Horizontal/diagonal gestures are handled by I2 first.

**Intent**: Pan

| Timing | Rule id |
|--------|---------|
| Rapid stream (&lt; 38 ms since previous event) | `I3:integer-trackpad` |
| Not rapid (small ticks only) | `I3:integer-trackpad-slow` |

Isolated large integer PIXEL steps without legacy `wheelDelta` fall through to **I4** via `isDominantAxisLargeWheel`. Events with **legacy `wheelDelta(Y)` ≈ ±120** (Chromium mechanical mouse on Windows) skip **I3** entirely — including rapid streams (~33 ms apart).

---

### I4 — Mouse wheel

**Intent**: depends on `MOUSE_WHEEL_BEHAVIOR` (`"zoom"` → Zoom, `"scroll"` → Pan)

| Variant | Condition | Rule id |
|---------|-----------|---------|
| Classic step | LINE/PAGE mode, **or** fractional PIXEL with `\|deltaY\| ≥ 20 px` | `I4:mouse-wheel-step` |
| Large single-axis step | one normalized axis ≥ 50 px, other ~0 | `I4:large-step` |
| Slow fractional notch | slow, vertical-only, fractional PIXEL in **~3–5 px** band (e.g. Δy ≈ -4.000244) | `I4:fractional-mouse` |
| Burst smoothing | within **120 ms** after an I4 step, vertical-only fractional event | `I4-burst:smoothing` |

Integer PIXEL steps **≥ 20 px** outside a rapid stream are mouse (I4), not I3. `I4:fractional-mouse` starts the burst window.

---

### I3 — Rapid stream, small fractional delta (trackpad inertia)

**Condition**: previous event **< 38 ms** ago, `deltaMode === 0`, both normalized axes **< 20 px**, fractional (integer path uses I3 above)

**Intent**: Pan (`I3:rapid-small`) — unless inside a mouse burst window (`I4-burst:smoothing`).

---

### I5 — Sticky last intent

**Condition**: none of the rules above matched

**Intent**: carry forward `lastIntent` (`I5:last-intent`; initial default **Zoom**, aligned with default `MOUSE_WHEEL_BEHAVIOR`)

---

## Decision flow

```
WheelEvent arrives
│
├─ I1: (ctrlKey or metaKey) + PIXEL delta?
│     → Zoom
│
├─ I2: diagonal OR predominant horizontal?
│     → Pan
│
├─ I3: small integer PIXEL, or large integer in rapid stream?
│     → Pan  (I3:integer-trackpad / I3:integer-trackpad-slow)
│
├─ I4: mouse wheel step OR large single-axis step?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
├─ I3: rapid stream + both axes < 20 px (fractional)?
│     → Pan  (or I4-burst:smoothing if in mouse burst)
│
├─ I4: slow fractional notch (~3–5 px)?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
└─ I5: else → last intent (I5:last-intent)
```

---

## Signals and normalization

### deltaMode

| mode | value | Typical source |
|------|-------|----------------|
| PIXEL | 0 | **Trackpad** (always); smooth-scroll **mouse** (fractional) |
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

Only in PIXEL mode (`deltaMode === 0`). **Integer** raw deltas → trackpad pan; **fractional** → mouse (I4). Used for I1 (pinch) and debug signals.

Checks use **raw values only** — multiplying by DPR before an integer test caused false positives on Windows at non-integer OS scaling (e.g. 110 % → DPR ≈ 1.1).

### Inter-event timing

**Rapid stream**: gap since previous event `< 38 ms`.

**Mouse burst**: **120 ms** after an I4 mouse step; nearby fractional events may follow `I4-burst:smoothing`.

There is no sticky device session — only `I5:last-intent` carries prior classification forward.

---

## Integration with Camera

```typescript
// Transitional path in Camera.handleWheelEvent:
const intent = settings.wheelIntentFromEvent(event, MOUSE_WHEEL_BEHAVIOR);

if (intent === EWheelIntent.Pan) {
  handlePan(event);   // → future: graph event "camera:pan"
  return;
}

const acceleration = isPinchZoomGesture(event) ? PINCH_ZOOM_SPEED : 1;
handleZoom(event, acceleration);  // → future: graph event "camera:zoom"
```

---

## Known limitations

### Ambiguous slow fractional scroll

Trackpad inertia and smooth-scroll mice can both emit small fractional PIXEL deltas. Integer trackpad is unambiguous; fractional paths rely on timing, magnitude bands, and `MOUSE_WHEEL_BEHAVIOR`. After a pan gesture, `I5:last-intent` may keep panning until a distinct I4 step or Ctrl+scroll (I1) zoom.

### PointerEvents / TouchEvents do not help for wheel routing

Trackpad scroll is translated to `WheelEvent` only; `pointerType` stays `"mouse"`. Touch events fire on touchscreens, not trackpads. Intent heuristics remain the only portable tool.

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
  resolveWheelIntent: (_event, _mouseWheelBehavior) => EWheelIntent.Zoom,
});

// Debug logging (browser console, development builds only):
enableWheelIntentDebug();
// Or capture structured entries yourself:
enableWheelIntentDebug((entry) => {
  console.log(entry.rule, entry.result, entry.input, entry.signals);
});
```

Debug hooks are explicit opt-in. Each wheel event logs two plain-text lines: a one-line summary and a `JSON.stringify` payload you can copy from the console.

**Storybook dev stand:** run `npm run storybook` → **Dev / WheelIntentProbe** — live table of raw `WheelEvent` fields plus resolver rule/signals; copy JSON after reproducing on your OS/device.

See also [Camera](./camera.md) for `MOUSE_WHEEL_BEHAVIOR` and camera constants.
