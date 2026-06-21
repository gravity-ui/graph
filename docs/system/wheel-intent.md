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

### macOS PIXEL mode: integer = trackpad, fractional = mouse

On macOS both devices emit `deltaMode: PIXEL`, but raw delta types differ reliably:

| Source | `deltaX` / `deltaY` in PIXEL mode | Resolver |
|--------|-----------------------------------|----------|
| **Trackpad** two-finger scroll | **Integer** (1, -2, 11, 20…) | **Pan** (`I3:integer-trackpad` / `I5:integer-trackpad`) |
| **Mouse** smooth-scroll wheel | **Fractional** (4.000244, 34.15, 153.34…) | **I4** per `MOUSE_WHEEL_BEHAVIOR` |

Checked via `Number.isInteger` on raw `deltaX` and `deltaY` (PIXEL mode only). LINE/PAGE wheel ticks are always mouse (I4).

Timing and magnitude thresholds remain for non-macOS platforms and for I4 burst smoothing after a mouse step.

---

### I2 — Horizontal or diagonal movement

**Condition**: both axes ≥ **2 px** (normalized) and the smaller axis is at least **50%** of the larger (no Shift)

**Intent**: Pan

Ignores small `deltaX` noise on predominantly vertical mouse wheel ticks and trackpad inertia (drivers sometimes emit `deltaX=±1…3` alongside vertical scroll).

---

### I3 — Integer trackpad (macOS)

**Condition**: macOS + PIXEL mode + integer `deltaX`/`deltaY` + vertical-dominant + rapid stream (&lt; 38 ms since previous event)

**Intent**: Pan (`I3:integer-trackpad`)

Any per-event magnitude, including inertia peaks ≥ 20 px.

---

### I5 — Integer trackpad slow scroll (macOS)

**Condition**: same integer PIXEL shape, not rapid stream, small delta

**Intent**: Pan (`I5:integer-trackpad`)

---

### I4 — Classic mouse wheel step

**Condition**: vertical-only wheel tick — LINE/PAGE mode, **or** on macOS PIXEL mode **fractional** delta with `|deltaY| ≥ 20 px`, **or** on other platforms `|deltaY| ≥ 20 px`

**Intent**: depends on `MOUSE_WHEEL_BEHAVIOR`

| Constant value | Intent |
|----------------|--------|
| `"zoom"` (default) | Zoom |
| `"scroll"` | Pan |

Physical mouse wheels emit LINE/PAGE steps or macOS smooth-scroll **fractional** ramps. **Integer** PIXEL steps on macOS are trackpad — handled by I3/I5, never I4.

**`I4:macos-fractional-mouse`**: slow (not rapid stream), vertical-only, **fractional** PIXEL delta (e.g. Δy ≈ -4.000244). Respects `MOUSE_WHEEL_BEHAVIOR`. Starts the **120 ms burst window**.

---

### I3 — Rapid stream with small delta (non-macOS trackpad)

**Condition**: previous event **< 38 ms** ago, and **both** normalized axes **< 20 px** (platforms other than macOS integer trackpad path)

**Intent**: Pan

Trackpad inertia on Windows/Linux and similar. On macOS, integer trackpad scroll uses I3/I5 above.

---

## Platform priors

`createWheelIntentResolver()` accepts an optional platform hint. Default is `"auto"` — {@link detectWheelIntentPlatform} runs once when the resolver is created.

| Platform | Ambiguous prior (I5) | Rationale |
|----------|----------------------|-----------|
| **macOS** | Pan | Trackpad is common; small slow vertical scroll is treated as pan |
| **other** | Zoom (`lastIntent` default) | Aligns with default `MOUSE_WHEEL_BEHAVIOR: "zoom"` |

```typescript
import { createWheelIntentResolver, EWheelIntentPlatform } from "@gravity-ui/graph";

resolveWheelIntent: createWheelIntentResolver({ platform: "auto" }),
// or explicitly:
resolveWheelIntent: createWheelIntentResolver({ platform: EWheelIntentPlatform.MacOS }),
```

**macOS slow fallback**: integer trackpad → I5; fractional → I4 (`I4:macos-fractional-mouse`).

Debug logs include `"platform": "macos" | "other"`.

---

### I5 — Ambiguous vertical scroll (sticky last intent)

**Condition**: none of I1–I4 matched

**Intent**:

- **macOS** + slow ambiguous **integer** trackpad scroll (`|deltaY| < 20 px`) → **Pan** (`I5:macos-ambiguous-pan`)
- otherwise carry forward `lastIntent` (initial default: **Zoom**)

Trackpad pan on macOS is handled by **I3** (rapid) and **I5** (slow integer). Mouse wheel zoom uses **I4** (≥ 20 px ramp peaks and `I4:macos-fractional-notch` for slow fractional notches).

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
├─ I4: classic mouse wheel step OR large single-axis step?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
├─ I3: rapid stream (< 38 ms) + both axes < 20 px?
│     → Pan
│
├─ I4: macOS slow fractional notch (< 20 px)?
│     → Pan or Zoom (MOUSE_WHEEL_BEHAVIOR)
│
└─ I5: else → last intent (default Zoom; macOS slow small **integer** → Pan)
```

---

## Signals and normalization

### deltaMode

All magnitude thresholds use pixel-equivalent values:

| mode | multiplier |
|------|-----------|
| PIXEL (0) | ×1 |
| LINE (1) | ×16 |
| PAGE (2) | ×600 |

### Fractional delta

Only in PIXEL mode (`deltaMode === 0`). On macOS, **integer** raw deltas → trackpad pan; **fractional** → mouse (I4). Used for I1 (pinch) and debug signals on all platforms.

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

### macOS: slow vertical scroll is inherently ambiguous

Trackpad two-finger scroll and smooth-scroll mice produce identical low-velocity `WheelEvent` streams. I5 biases toward continuity (last intent) rather than device labels. Consequence: a smooth-scroll mouse after pan gestures may keep panning until a large I4 step or explicit Ctrl+scroll (I1) zoom.

Pan-by-default on macOS is the accepted tradeoff: zoom remains available via Ctrl/Cmd+scroll or a distinct wheel step (I4).

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
