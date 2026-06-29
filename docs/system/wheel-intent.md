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

Camera passes wheel policy on each call via `TResolveWheelIntentOptions` (from graph constants):

```typescript
type TResolveWheelIntentOptions = {
  mouseWheelBehavior: TMouseWheelBehavior;
  wheelInputDevice?: TWheelInputDevice; // default "auto"
};

resolveWheelIntent(event, {
  mouseWheelBehavior: MOUSE_WHEEL_BEHAVIOR,
  wheelInputDevice: WHEEL_INPUT_DEVICE,
});
```

Rules are evaluated in priority order; the first match wins. Debug logs use **rule ids** (column below), which are more specific than the I1–I5 groups.

| Priority | Rule id (debug) | Intent |
|----------|-----------------|--------|
| 1 | `I1:pinch` | Zoom |
| 2 | `I2:horizontal-or-diagonal` | Pan |
| 3 | `I3:input-device-trackpad` | Pan (when `WHEEL_INPUT_DEVICE === "trackpad"`) |
| 4 | `I4:*` via `WHEEL_INPUT_DEVICE === "mouse"` | Pan or Zoom (`MOUSE_WHEEL_BEHAVIOR`) |
| 5 | `I3:integer-trackpad` / `I3:integer-trackpad-slow` | Pan |
| 6 | `I4:mouse-wheel-step` / `I4:large-step` | Pan or Zoom (`MOUSE_WHEEL_BEHAVIOR`) |
| 7 | `I3:rapid-small` / `I4-burst:smoothing` | Pan or Zoom |
| 8 | `I4:fractional-mouse` | Pan or Zoom (`MOUSE_WHEEL_BEHAVIOR`) |
| 9 | `I5:last-intent` | Sticky last intent (default Zoom) |
| — | `I5:sticky-stream` | Post-pass: keep prior intent inside rapid stream (see I5) |

Rules 3–4 apply only when `WHEEL_INPUT_DEVICE` is set explicitly; `"auto"` uses rules 5–9. `I5:sticky-stream` runs after the main chain when rapid stream would flip intent.

---

### Trackpad vs mouse: `deltaMode` and delta shape

Trackpads **always** emit `deltaMode === 0` (`DOM_DELTA_PIXEL`). On Chromium (Chrome/Edge), **mouse wheels also use PIXEL mode** with integer deltas (often ±100 per notch). Firefox still uses LINE/PAGE for mice.

| Signal | Source | Resolver |
|--------|--------|----------|
| `deltaMode !== 0` (LINE/PAGE) | **Mouse** wheel | **I4** per `MOUSE_WHEEL_BEHAVIOR` |
| `deltaMode === 0` + **small integer** `deltaX`/`deltaY` (< 20 px) | **Trackpad** | **Pan** (I3) |
| `deltaMode === 0` + **large integer** in rapid stream (< 38 ms) | **Trackpad** fast scroll | **Pan** (I3) |
| `deltaMode === 0` + **isolated large integer** (≥ 20 px, not rapid) | **Mouse** (Chromium) | **I4** per `MOUSE_WHEEL_BEHAVIOR` |
| `deltaMode === 0` + **legacy wheelDelta ≈ ±120** | **Mouse** (Chromium/Edge on Windows) | **I4** (never I3, even in a rapid stream) |
| `deltaMode === 0` + **wheelDelta ≈ 3 × deltaY** (Mac Chrome/YaBrowser) | **Trackpad or ambiguous mouse** | **I3** in rapid stream / small steps; not legacy |
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

Isolated large integer PIXEL steps without legacy `wheelDelta` fall through to **I4** via `isDominantAxisLargeWheel`. Events with **legacy `wheelDelta(Y)` ≈ ±120** (Chromium mechanical mouse on Windows) skip **I3** entirely — including rapid streams (~33 ms apart). On Mac Chrome/YaBrowser, `wheelDelta ≈ 3 × deltaY` is **not** treated as legacy (trackpad and some mice share this shape).

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

**Rapid stream sticky** (`I5:sticky-stream`): post-pass after the main chain. When the previous event was **< 38 ms** ago, the newly matched rule would **change** vertical intent, and the previous event was classified by a confident rule (I1–I4, not `I5:last-intent`), keep the prior intent. Pinch (I1) and horizontal/diagonal (I2) always override. Does not apply when the previous rule was `I5:last-intent` (allows trackpad inertia tail to establish pan after an ambiguous first tick).

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
├─ WHEEL_INPUT_DEVICE === "trackpad"?
│     → Pan  (I3:input-device-trackpad)
│
├─ WHEEL_INPUT_DEVICE === "mouse"?
│     → Pan or Zoom (I4:* per MOUSE_WHEEL_BEHAVIOR)
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
     ↓
   Rapid stream (< 38 ms) and intent would flip?
     → keep prior intent (I5:sticky-stream); I1/I2 exempt
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

Only in PIXEL mode (`deltaMode === 0`). **Integer** raw deltas often indicate trackpad (I3), but Chromium on Windows and some Mac mice also emit integer PIXEL — use legacy `wheelDelta`, timing, and `WHEEL_INPUT_DEVICE` to disambiguate. **Fractional** PIXEL deltas usually route to mouse (I4), with exceptions for rapid small trackpad inertia (I3:rapid-small). Used for I1 (pinch) and debug signals.

Checks use **raw values only** — multiplying by DPR before an integer test caused false positives on Windows at non-integer OS scaling (e.g. 110 % → DPR ≈ 1.1).

### Inter-event timing

**Rapid stream**: gap since previous event `< 38 ms`.

**Mouse burst**: **120 ms** after an I4 mouse step; nearby fractional events may follow `I4-burst:smoothing`.

There is no sticky device session — `I5:last-intent` carries prior classification when no rule matches; `I5:sticky-stream` prevents intent flips **inside** a rapid stream (< 38 ms between events).

---

## Integration with Camera

```typescript
// Transitional path in Camera.handleWheelEvent:
const intent = settings.wheelIntentFromEvent(event, {
  mouseWheelBehavior: MOUSE_WHEEL_BEHAVIOR,
  wheelInputDevice: WHEEL_INPUT_DEVICE,
});

if (intent === EWheelIntent.Pan) {
  handlePan(event);   // → future: graph event "camera:pan"
  return;
}

const acceleration = isPinchZoomGesture(event) ? PINCH_ZOOM_SPEED : 1;
handleZoom(event, acceleration);  // → future: graph event "camera:zoom"
```

---

## Wheel input device modes (`WHEEL_INPUT_DEVICE`)

The camera does not receive raw hardware type from the browser. It receives a **`WheelEvent`** and asks `resolveWheelIntent` for **pan** or **zoom**. Two camera constants control the outcome:

| Constant | Where | Role |
|----------|-------|------|
| **`WHEEL_INPUT_DEVICE`** | graph **constants** (`camera`) | How to classify vertical wheel input: infer (`"auto"`), force trackpad, or force mouse |
| **`MOUSE_WHEEL_BEHAVIOR`** | graph **constants** (`camera`) | What vertical **mouse-classified** wheel does: `"zoom"` (default) or `"scroll"` (pan) |

Pinch (Cmd/Ctrl + scroll) and horizontal/diagonal swipes behave the same in all modes — see [I1](#i1--trackpad-modifier-zoom-pinch--cmd--ctrlscroll) and [I2](#i2--horizontal-or-diagonal-movement).

### What the camera does after classification

```typescript
const intent = settings.wheelIntentFromEvent(event, {
  mouseWheelBehavior: MOUSE_WHEEL_BEHAVIOR,
  wheelInputDevice: WHEEL_INPUT_DEVICE,
});

if (intent === EWheelIntent.Pan) {
  handlePan(event); // two-finger swipe, horizontal scroll, mouse scroll when behavior is "scroll"
  return;
}

const acceleration = isPinchZoomGesture(event) ? PINCH_ZOOM_SPEED : 1;
handleZoom(event, acceleration); // mouse wheel zoom, pinch-to-zoom
```

| Resolved intent | Camera action | Typical gesture |
|-----------------|---------------|-----------------|
| **Pan** | Move viewport (`handlePan`) | Trackpad two-finger swipe, Shift+wheel, horizontal two-finger swipe |
| **Zoom** | Scale at cursor (`handleZoom`) | Mouse wheel (when `MOUSE_WHEEL_BEHAVIOR: "zoom"`), Cmd/Ctrl + scroll, pinch |

---

### `"auto"` (default)

Resolver **infers** trackpad vs mouse from gesture shape (I3/I4 heuristics). Use when users may switch devices or you cannot detect hardware reliably.

| Gesture | Usual result (`MOUSE_WHEEL_BEHAVIOR: "zoom"`) | Notes |
|---------|-----------------------------------------------|-------|
| Trackpad two-finger vertical swipe | **Pan** | Integer PIXEL; fast swipes stay pan in rapid stream |
| Trackpad horizontal / diagonal swipe | **Pan** | I2 |
| Trackpad Cmd/Ctrl + scroll (pinch) | **Zoom** | I1; uses `PINCH_ZOOM_SPEED` |
| Mouse wheel notch (Windows Chromium) | **Zoom** | Integer PIXEL + `wheelDelta ≈ ±120` |
| Mouse wheel notch (Firefox LINE mode) | **Zoom** | I4 |
| Smooth-scroll mouse (fractional PIXEL) | **Zoom** | I4 |
| Mac Chrome trackpad fast swipe | **Pan** | `wheelDelta ≈ 3×deltaY` is not treated as mouse legacy |
| Mac Chrome high-end mouse (integer + 3×) | **Ambiguous** | Same DOM shape as trackpad — may pan when you expect zoom |

Inside a **rapid stream** (< 38 ms between events), **`I5:sticky-stream`** keeps the intent from the previous tick so one gesture does not flip pan ↔ zoom mid-swipe.

**When to use:** general-purpose graph editors, Storybook demos, mixed input.

---

### `"trackpad"`

Resolver **skips mouse heuristics** for vertical scroll. Every vertical wheel tick → **pan**, except I1/I2.

| Gesture | Camera action |
|---------|---------------|
| Two-finger vertical swipe (any speed, any `deltaY`) | **Pan** |
| Horizontal / diagonal two-finger swipe | **Pan** |
| Cmd/Ctrl + scroll / pinch | **Zoom** (`PINCH_ZOOM_SPEED`) |
| Mouse wheel (if user switches device) | **Pan** (vertical ticks forced to trackpad path) |

`MOUSE_WHEEL_BEHAVIOR` does **not** affect vertical trackpad scroll — it always pans.

**When to use:** laptop-first apps, editors where trackpad is the primary input, or Mac Chrome where `"auto"` misclassifies swipes as mouse zoom.

---

### `"mouse"`

Resolver **skips trackpad heuristics** for vertical scroll. Every vertical wheel tick → **I4** → follows **`MOUSE_WHEEL_BEHAVIOR`**.

| Gesture | `MOUSE_WHEEL_BEHAVIOR: "zoom"` | `MOUSE_WHEEL_BEHAVIOR: "scroll"` |
|---------|------------------------------|----------------------------------|
| Mouse wheel vertical | **Zoom** | **Pan** |
| Mouse wheel + Shift | **Pan** (horizontal axis via camera) | **Pan** (horizontal) |
| Smooth-scroll mouse ramp | **Zoom** | **Pan** |
| Trackpad two-finger swipe (if user switches device) | **Zoom** | **Pan** |
| Cmd/Ctrl + scroll on PIXEL delta | **Zoom** | **Zoom** (I1 still wins) |
| Horizontal / diagonal swipe | **Pan** | **Pan** (I2) |

**When to use:** desktop apps with mouse only, CAD/diagram tools defaulting to wheel zoom, Mac Chrome with high-end mouse that looks like trackpad in `"auto"`.

---

### Choosing a mode

```
                    Can users switch mouse ↔ trackpad?
                              │
              ┌───────────────┴───────────────┐
             yes                              no
              │                                │
         WHEEL_INPUT_DEVICE                  Known device
            "auto"                               │
              │                    ┌─────────────┴─────────────┐
              │                 trackpad                    mouse
              │           WHEEL_INPUT_DEVICE:          WHEEL_INPUT_DEVICE:
              │              "trackpad"                    "mouse"
              │                    │                         │
              └────────────────────┴─────────────────────────┘
                              │
              Still ambiguous on Mac Chrome integer + 3× wheelDelta?
                              │
                    Prefer pan → "trackpad"
                    Prefer zoom → "mouse" + MOUSE_WHEEL_BEHAVIOR: "zoom"
```

### Configuration examples

```typescript
// Default — infer device, mouse wheel zooms
const graph = new Graph({
  constants: {
    camera: { MOUSE_WHEEL_BEHAVIOR: "zoom", WHEEL_INPUT_DEVICE: "auto" },
  },
});

// Laptop editor — always pan on two-finger swipe
graph.setConstants({ camera: { WHEEL_INPUT_DEVICE: "trackpad" } });

// Mouse-only desktop — wheel always zooms (even on Mac Chrome integer deltas)
graph.setConstants({ camera: { WHEEL_INPUT_DEVICE: "mouse" } });

// Mouse-only but wheel scrolls canvas instead of zooming
graph.setConstants({
  camera: { WHEEL_INPUT_DEVICE: "mouse", MOUSE_WHEEL_BEHAVIOR: "scroll" },
});
```

Changing `WHEEL_INPUT_DEVICE` via `graph.setConstants()` takes effect on the next wheel event — no need to recreate `resolveWheelIntent`.

---

## Known limitations

### Ambiguous slow fractional scroll

Trackpad inertia and smooth-scroll mice can both emit small fractional PIXEL deltas. Integer trackpad is unambiguous; fractional paths rely on timing, magnitude bands, and `MOUSE_WHEEL_BEHAVIOR`. After a pan gesture, `I5:last-intent` may keep panning until a distinct I4 step or Ctrl+scroll (I1) zoom.

### PointerEvents / TouchEvents do not help for wheel routing

Trackpad scroll is translated to `WheelEvent` only; `pointerType` stays `"mouse"`. Touch events fire on touchscreens, not trackpads. Intent heuristics remain the only portable tool.

When the app knows the primary wheel device (e.g. desktop app with mouse only, or editor that detects trackpad vs mouse), set camera constant **`WHEEL_INPUT_DEVICE`**. See [Wheel input device modes](./wheel-intent.md#wheel-input-device-modes-wheel_input_device) for full behavior tables.

On Mac Chrome/YaBrowser, trackpads and some high-end mice both emit integer PIXEL deltas with `wheelDelta ≈ 3 × deltaY` — `"auto"` cannot distinguish them. Explicit `WHEEL_INPUT_DEVICE` fixes that trade-off.

```typescript
const graph = new Graph({
  constants: {
    camera: {
      WHEEL_INPUT_DEVICE: "mouse", // or "trackpad"
    },
  },
});
```

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
  resolveWheelIntent: (_event, _options) => EWheelIntent.Zoom,
});

// Debug logging (browser console, development builds only):
enableWheelIntentDebug();
// Or capture structured entries yourself:
enableWheelIntentDebug((entry) => {
  console.log(entry.rule, entry.result, entry.input, entry.signals);
});
```

Debug hooks are explicit opt-in. Each wheel event logs two plain-text lines: a one-line summary and a `JSON.stringify` payload you can copy from the console.

**Storybook dev panel:** run `npm run storybook` → **Dev / WheelIntentProbe** — live table of raw `WheelEvent` fields plus resolver rule/signals; copy JSON after reproducing on your OS/device.

See also [Camera](./camera.md) for `MOUSE_WHEEL_BEHAVIOR` and camera constants.
