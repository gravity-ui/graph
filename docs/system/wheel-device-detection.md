# Wheel Device Detection

The library needs to distinguish between a **trackpad** (two-finger scroll / pinch) and a **mouse wheel** in order to route wheel events correctly: trackpad → pan the canvas, mouse wheel → zoom. The detection lives in [`src/utils/functions/isTrackpadDetector.ts`](../../src/utils/functions/isTrackpadDetector.ts).

## Why detection is hard

The browser exposes a single `WheelEvent` for all scroll input. There is no `event.device` property. The signals available — delta magnitudes, fractional values, inter-event timing — overlap between device types, particularly on macOS where both the built-in trackpad and smooth-scroll mice (Magic Mouse, Logitech MX) deliver `deltaMode=0` (PIXEL mode) with fractional delta values.

---

## Signals used

### 1. deltaMode normalization

`WheelEvent.deltaMode` can be `0` (PIXEL), `1` (LINE), or `2` (PAGE). All magnitude comparisons inside the detector use pixel-equivalent values:

| mode | multiplier |
|------|-----------|
| PIXEL (0) | ×1 (no change) |
| LINE (1) | ×16 |
| PAGE (2) | ×600 |

This ensures thresholds work consistently across Linux/Firefox which commonly deliver LINE-mode events for mice.

### 2. Fractional delta (`hasFractionalDelta`)

Only applies in PIXEL mode (`deltaMode === 0`). A delta is considered fractional if either raw `deltaX` or raw `deltaY` is non-integer. Fractional deltas indicate a **precision pointer device** (trackpad, Magic Mouse, Precision Touchpad) rather than a stepped mechanical wheel.

> **Windows scaling caveat**: at non-integer OS scaling (e.g. 110 %, which can yield DPR ≈ 1.1) an ordinary mouse wheel emitting an integer delta of 3 would become 3.3 after multiplication by DPR. Earlier versions of this code checked both raw and DPR-scaled values (OR logic), which produced false positives on such systems. The check now uses **raw values only** to avoid this.

> **macOS caveat**: both the built-in trackpad and smooth-scroll mice deliver fractional PIXEL-mode deltas. Fractional alone is not a conclusive trackpad signal on macOS.

### 3. Delta magnitude (`isSmallDelta` / `isDominantAxisLargeWheel`)

- **`isSmallDelta`** — both `|deltaX|` and `|deltaY|` are below 50 px (normalized). Trackpad events tend to be granular and small; mouse wheel clicks deliver large steps (≥ 50 px on one axis).
- **`isDominantAxisLargeWheel`** — one axis ≥ 50 px, the other ≈ 0. Classic mouse wheel (vertical) or tilted wheel (horizontal) pattern.

### 4. Inter-event timing (`isRapidStream` / `isColdStart`)

- **Rapid stream** (`isRapidStream`) — the previous event was less than 38 ms ago. Trackpad inertia and two-finger scrolling produce a dense, high-frequency stream; most mouse wheels fire much less frequently.
- **Cold start** (`isColdStart`) — first ever event in the session, or more than 3 s since the last event. There is no stream context to reason about.

### 5. Touch / pointer capability (`hasPointerOrTouchDevice`)

`navigator.maxTouchPoints > 0` indicates the machine has a touchscreen or similar touch input. This is a reliable positive signal for Windows / Linux Precision Touchpads, but **returns `false` on macOS** even when a Magic Trackpad or built-in trackpad is present (macOS has no touchscreen).

Used as a supplementary signal in the cold-start heuristic combined with `deltaMode === 0` — the latter covers the macOS case that `maxTouchPoints` misses.

---

## Heuristics (priority order)

Evaluated for every `WheelEvent`. The first matching rule wins.

### H1 — Pinch-to-zoom gesture

**Condition**: `(ctrlKey || metaKey)` AND `(hasFractionalDelta || isSmallDelta)`

**Result**: Trackpad

The browser synthesises `ctrlKey=true` for pinch-to-zoom gestures on trackpads (two-finger spread). A real Ctrl+scroll from a mouse wheel is typically large and integer, so requiring fractional-or-small filters those out.

---

### H2 — Diagonal scroll

**Condition**: `!shiftKey` AND `|deltaX| > 2 px` AND `|deltaY| > 2 px` (both axes normalized)

**Result**: Trackpad

A physical scroll wheel can only scroll on one axis at a time. Meaningful simultaneous X+Y deltas indicate two-finger trackpad movement.

---

### H3 — Rapid stream (high-frequency events)

**Condition**: `isRapidStream` AND (`isSmallDelta` OR (`hasFractionalDelta` AND NOT `isDominantAxisLargeWheel`))

A dense stream of events that are either small or fractional and not a large single-axis step. Large single-axis steps in a rapid stream can still be smooth-mouse scroll inertia, so those are excluded.

Within this rule, the scroll direction matters:

#### H3a — Horizontal component present in rapid stream

**Condition** (sub-check): `|deltaX| ≥ 1.5` (raw, not normalized)

**Result**: Trackpad

Even a small but consistent horizontal component in a rapid stream is a strong trackpad indicator — mice rarely produce non-zero deltaX without a tilted wheel or Shift key.

> **Raw vs normalized**: the 1.5 threshold here (and the 0.5 threshold in H4a/H9) is applied to the raw `e.deltaX` value, not the DPR-normalized pixel equivalent. In PIXEL mode this makes no practical difference. In LINE/PAGE mode both values are always integer, so fractional comparisons are moot.

#### H3b — Vertical-dominant rapid stream

**Condition** (sub-check): `|deltaX| < 1.5 px`

| delta type | result |
|------------|--------|
| Integer (`!hasFractionalDelta`) | Trackpad — integer PIXEL-mode rapid-stream events come from Firefox/Linux trackpad drivers |
| Fractional, small (`isSmallDelta`) | Trackpad — macOS trackpad, Windows/Linux Precision Touchpad |
| Fractional, large (`!isSmallDelta`) | Mouse — high-velocity smooth-scroll (Logitech MX, etc.) |

> **macOS note**: `hasPointerOrTouchDevice()` is intentionally NOT used here — macOS always reports `maxTouchPoints=0` even with a Magic Trackpad. Touch capability is neither required nor consulted; `isSmallDelta` alone is the discriminator for fractional events.

---

### H4 — Non-stream fractional delta

**Condition**: `hasFractionalDelta` (and not already caught by H3)

Sub-cases by scroll direction:

#### H4a — Vertical-only (`|deltaX| < 0.5 px`)

| delta magnitude | result |
|-----------------|--------|
| Small (`isSmallDelta`) | Trackpad — macOS trackpad or Precision Touchpad |
| Large (`!isSmallDelta`) | Mouse — momentum wheel (Logitech MX, Magic Mouse in scroll mode) |

#### H4b — Single-axis large step (`isDominantAxisLargeWheel`)

**Result**: Mouse — one axis ≥ 50 px, other ≈ 0; classic wheel step.

#### H4c — Everything else with fractional delta

**Result**: Trackpad — mixed-axis fractional event that doesn't look like a wheel step.

---

### H5 — Horizontal scroll signal

**Condition**: `|deltaX| ≥ 2 px` AND `!shiftKey` AND (`isRapidStream` OR `isSmallDelta`)

**Result**: Trackpad

Mice without a tilt wheel produce no deltaX. A normalized horizontal delta ≥ 2 px combined with either rapid stream or small magnitude is a trackpad/Precision Touchpad signal. Sub-pixel noise (`|deltaX| < 2 px`) is ignored.

---

### H6 — Cold-start heuristic (optimistic guess)

**Condition**: `isColdStart` AND `(hasFractionalDelta OR isSmallDelta)` AND `(hasPointerOrTouchDevice() OR deltaMode === 0)`

**Result**: Trackpad (provisional)

Without stream context the detector cannot yet distinguish a first trackpad swipe from a mouse scroll. It makes an optimistic guess when:

- The event carries any precision-device signal (`hasFractionalDelta` or `isSmallDelta`), AND
- The device is plausibly a precision pointer: either `maxTouchPoints > 0` (Windows/Linux touchpad / touchscreen) **or** `deltaMode === 0` (PIXEL mode — covers macOS where `maxTouchPoints` is always 0).

The broader condition (vs the original `isSmallDelta && hasPointerOrTouchDevice()`) is necessary because:
- macOS never reports `maxTouchPoints > 0`, so the old form was a no-op there.
- A fast first swipe may produce a large delta, so requiring `isSmallDelta` would miss it; `hasFractionalDelta` catches those.

**Self-correction**: LINE/PAGE-mode mice without touch capability are excluded (`deltaMode !== 0` and `hasPointerOrTouchDevice()=false`). For PIXEL-mode devices, false positives are corrected by H9 (smooth-mouse inertia tail: non-rapid + small) and H8 (discrete large non-rapid step). Rapid+large events are intentionally not cleared — see H9.

---

### H7 — Sticky session state

**Condition**: trackpad was detected within the last 60 s and DPR has not changed

**Result**: Trackpad (carry-over)

Once a trackpad is confidently detected, all subsequent events maintain the classification without re-evaluating heuristics. `isSmallDelta` is **not** a gate on the carry-over result — it only controls whether the 60 s timeout is refreshed: small-delta events extend the window, large-delta events let it coast toward expiry.

The sticky state is **cleared** when:

- A clear mouse wheel step arrives (`!isRapidStream` AND `isDominantAxisLargeWheel`) — H8
- The session timeout expires (60 s without events)
- DPR changes (display configuration change)
- H9 fires

---

### H8 — Mouse wheel step override

**Condition**: `isTrackpadDetected` AND `!isRapidStream` AND `isDominantAxisLargeWheel`

**Result**: Clears trackpad state → Mouse

A large single-axis step that is not part of a rapid stream is unambiguously a physical mouse wheel click. It overrides any prior trackpad classification immediately.

---

### H9 — Sticky-clear for smooth-mouse inertia

**Condition** (all required):
- Trackpad was previously detected (`wasTrackpad`)
- No strong signals fired for this event
- Scroll is vertical-only (`|deltaX| < 0.5`, raw — not normalized)
- Delta is fractional
- `!isRapidStream && isSmallDelta` — non-rapid, winding-down tail

**Result**: Clears trackpad state → Mouse

Corrects false positives where a smooth-scroll mouse's momentum tail was mistaken for a trackpad. Only the coasting-to-a-stop pattern (slow, small, non-rapid) is cleared. **Rapid events are never cleared here**, even if the delta is large — a vigorous vertical trackpad swipe in mid-gesture looks identical to a smooth-scroll mouse at full speed, so clearing on rapid+large would incorrectly drop trackpad state mid-scroll.

---

## Decision flow

```
WheelEvent arrives
│
├─ H8: sticky trackpad AND clear mouse-wheel step?
│     → clear sticky state, continue
│
├─ H1: pinch-to-zoom (ctrlKey/metaKey + fractional/small)?
│     → Trackpad
│
├─ H2: diagonal scroll (|deltaX| > 2 AND |deltaY| > 2)?
│     → Trackpad
│
├─ H3: rapid stream + small-or-fractional-non-large?
│   ├─ H3a: horizontal component >= 1.5px?
│   │       → Trackpad
│   └─ H3b: vertical-dominant
│           integer         → Trackpad
│           fractional+small → Trackpad
│           fractional+large → Mouse
│
├─ H4: fractional delta?
│   ├─ H4a: vertical-only
│   │       small → Trackpad
│   │       large → Mouse
│   ├─ H4b: dominant-axis large → Mouse
│   └─ H4c: otherwise → Trackpad
│
├─ H5: horizontal >= 2px + (rapid OR small)?
│     → Trackpad
│
├─ H6: cold start + (fractional OR small) + (touch-capable OR PIXEL mode)?
│     → Trackpad (provisional)
│
├─ H7: sticky session state active (any delta size)?
│   └─ H9: vertical fractional, no strong signals, non-rapid + small?
│         → clear sticky state → Mouse
│     otherwise → Trackpad (carry-over; small delta refreshes timeout)
│
└─ default → Mouse
```

---

## Platform matrix

| Platform / Device | fractional | maxTouchPoints | deltaMode | Primary detection path |
|---|---|---|---|---|
| macOS built-in trackpad (Chrome/Safari) | yes | 0 | PIXEL | H6 (first event), then H3b / H4a |
| macOS Magic Mouse | yes | 0 | PIXEL | H6 (first event); H4a large → Mouse; H3b small → Trackpad* |
| macOS Logitech MX (smooth mode) | yes | 0 | PIXEL | H6 (first event); H4a large → Mouse; H3b small → Trackpad* |
| macOS regular USB mouse | no | 0 | LINE | H8 / default Mouse |
| Windows Precision Touchpad | yes | >0 | PIXEL | H3b / H4a (small fractional + touch) |
| Windows regular mouse | no | 0 | LINE | H8 / default Mouse |
| Linux trackpad (Firefox) | no | 0 | LINE (integer) | H3b integer rapid stream → Trackpad |
| Linux mouse | no | 0 | LINE | H8 / default Mouse |

\* On macOS, smooth-scroll mice with small per-event deltas (< 50 px) may be classified as trackpad — both from the cold-start first event (H6) and from rapid-stream events (H3b). This is an accepted tradeoff: any condition that would correctly exclude smooth-scroll mice (e.g. requiring `hasPointerOrTouchDevice()`) also excludes macOS trackpads, since macOS never reports `maxTouchPoints > 0` without a touchscreen. Ctrl+scroll zoom remains functional regardless of device classification.

---

## Known limitations

### 1. macOS trackpad vs smooth-scroll mouse are indistinguishable at low velocity

A slow two-finger trackpad scroll and a slow smooth-scroll mouse (Magic Mouse, Logitech MX) produce physically identical `WheelEvent` streams on macOS: PIXEL mode, fractional, small delta, vertical-only. There is no signal that separates them. The detector resolves this ambiguity by **biasing toward trackpad** (H3b, H4a, H6): any PIXEL-mode device gets pan-by-default, and zoom requires Ctrl+scroll.

Consequence: macOS smooth-scroll mouse users scrolling gently (deltaY < 50 px) will get pan instead of zoom. Ctrl+scroll zoom is unaffected. Fast scrolling (deltaY ≥ 50 px) is correctly classified as mouse via H4b.

This is a fundamental limit of the heuristic approach — not fixable without a device-identity browser API that does not exist.

### 2. `maxTouchPoints` detects touchscreens, not trackpads

`navigator.maxTouchPoints > 0` reflects a hardware touchscreen digitizer, not a trackpad. A Windows laptop with a Precision Touchpad but no touchscreen returns `maxTouchPoints = 0` — identical to macOS. The signal is reliable only for devices that physically have a touchscreen (Windows tablets, hybrid laptops, Android). On such devices it remains useful as a soft corroborating signal, but it must not be read as "has a trackpad."

### 3. Asymmetric entry / exit

Entering trackpad mode is cheap (H6 fires optimistically on the first PIXEL-mode event). Exiting is expensive: only H8 (large discrete non-rapid step) and H9 (non-rapid + small inertia tail) clear the state. For a smooth-scroll mouse whose inertia tail was caught by H9 and cleared, the next cold-start gesture re-enters trackpad mode via H6 and the cycle repeats.

For active continuous scrolling with a smooth-scroll mouse (rapid + small events), neither H8 nor H9 fires, and the device stays in trackpad mode for the full 60 s timeout. This is an accepted tradeoff given limitation #1.

### 4. Linux / Firefox integer-trackpad branch may not apply universally

H3b's integer-rapid-stream path (detecting `!hasFractionalDelta` in a rapid stream as trackpad) was designed for older Firefox on Linux where the trackpad driver reported PIXEL-mode integer events. Modern Firefox with libinput often delivers fractional PIXEL-mode events instead, making this branch less relevant. It causes no harm (integer rapid-stream events from mice are uncommon) but offers less coverage than it once did.

---

## Why TouchEvents and PointerEvents don't help

An obvious alternative to delta heuristics would be to consult the browser's higher-level input APIs.

### PointerEvents (`pointerType`)

`PointerEvent.pointerType` can be `"mouse"`, `"touch"`, or `"pen"`. Listening for `pointerdown`/`pointermove` with `pointerType === "touch"` gives a reliable "finger is on screen" signal on **Windows and Linux** touchscreens and Precision Touchpads — and this is already what `hasPointerOrTouchDevice()` (`navigator.maxTouchPoints > 0`) captures indirectly.

**On macOS the signal is absent.** A two-finger trackpad scroll is translated by the OS directly into a `WheelEvent` and never surfaces as a touch pointer. Every pointer event from a macOS trackpad carries `pointerType === "mouse"` (if it arrives at all). There is no PointerEvents path that distinguishes a trackpad from a mouse on macOS.

### TouchEvents (`touchstart` / `touchmove`)

Touch events fire only on genuine touchscreens. A macOS Magic Trackpad or built-in trackpad generates **no** touch events for scroll gestures — the OS absorbs the gesture and emits `WheelEvent` instead.

On devices where `touchstart` does fire (Windows Surface, Android, iOS), `navigator.maxTouchPoints > 0` is already `true`, so `hasPointerOrTouchDevice()` already benefits from that information.

### Conclusion

For wheel-event routing on macOS, there is no higher-level API that identifies the source device. The OS deliberately hides the distinction: a two-finger swipe and a smooth-scroll mouse wheel produce identical `WheelEvent` streams from the browser's perspective. Delta heuristics (magnitude, fractionality, inter-event timing) are the only tool available, which is why the detector is necessarily probabilistic rather than exact.

---

## Configuring detection

The detection function is exposed as a configurable callback on the graph settings:

```typescript
import { EWheelDeviceKind, TResolveWheelDevice } from "@gravity-ui/graph";

const customResolver: TResolveWheelDevice = (event, dpr) => {
  // Always treat scroll as mouse wheel (zoom by default)
  return EWheelDeviceKind.Mouse;
};

const graph = new Graph({
  settings: {
    resolveWheelDevice: customResolver,
  },
});
```

The default implementation is `defaultResolveWheelDevice`, which wraps the singleton `isTrackpadWheelEvent` detector described in this document.
