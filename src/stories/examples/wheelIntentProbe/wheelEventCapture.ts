import type { TWheelIntentDebugEntry } from "../../../utils/functions/wheelIntent";

const DELTA_MODE_LABELS = ["PIXEL", "LINE", "PAGE"] as const;

type TLegacyWheelEvent = WheelEvent & {
  wheelDelta?: number;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
};

/** Raw browser fields useful for tuning wheel-intent heuristics. */
export type TRawWheelEventSnapshot = {
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  deltaMode: number;
  deltaModeLabel: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  deltaXIsInteger: boolean;
  deltaYIsInteger: boolean;
  wheelDelta: number | null;
  wheelDeltaX: number | null;
  wheelDeltaY: number | null;
};

export type TWheelProbeLogEntry = {
  id: number;
  capturedAt: string;
  platform: string;
  userAgent: string;
  raw: TRawWheelEventSnapshot;
  resolver: TWheelIntentDebugEntry;
};

export function snapshotRawWheelEvent(event: WheelEvent): TRawWheelEventSnapshot {
  const legacy = event as TLegacyWheelEvent;

  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaZ: event.deltaZ,
    deltaMode: event.deltaMode,
    deltaModeLabel: DELTA_MODE_LABELS[event.deltaMode] ?? String(event.deltaMode),
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    deltaXIsInteger: Number.isInteger(event.deltaX),
    deltaYIsInteger: Number.isInteger(event.deltaY),
    wheelDelta: legacy.wheelDelta ?? null,
    wheelDeltaX: legacy.wheelDeltaX ?? null,
    wheelDeltaY: legacy.wheelDeltaY ?? null,
  };
}

export function formatWheelProbeSummary(entry: TWheelProbeLogEntry): string {
  const { raw, resolver } = entry;
  const keys = [
    raw.ctrlKey ? "Ctrl" : "",
    raw.metaKey ? "Meta" : "",
    raw.shiftKey ? "Shift" : "",
    raw.altKey ? "Alt" : "",
  ]
    .filter(Boolean)
    .join("+");

  let intTag = "frac";
  if (raw.deltaXIsInteger && raw.deltaYIsInteger) {
    intTag = "int";
  } else if (raw.deltaXIsInteger || raw.deltaYIsInteger) {
    intTag = "mixed";
  }

  return [
    resolver.rule,
    "→",
    resolver.result,
    `| Δ(${raw.deltaX}, ${raw.deltaY}) ${raw.deltaModeLabel} ${intTag}`,
    keys ? `| ${keys}` : "",
    `| +${Math.round(resolver.session.timeSinceLastMs)}ms`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Sync clipboard copy via hidden textarea (works in Storybook iframe).
 */
export function copyTextToClipboard(text: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}
