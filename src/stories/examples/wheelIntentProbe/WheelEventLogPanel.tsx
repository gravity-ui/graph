import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Flex, Label, Switch, Text, TextInput } from "@gravity-ui/uikit";

import type { TWheelProbeLogEntry } from "./wheelEventCapture";
import { copyTextToClipboard, formatWheelProbeSummary } from "./wheelEventCapture";

import "./WheelEventLogPanel.css";

const MAX_ENTRIES_CAP = 500;

type TWheelEventLogPanelProps = {
  entries: TWheelProbeLogEntry[];
  mouseWheelBehavior: string;
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  onClear: () => void;
};

export function WheelEventLogPanel({
  entries,
  mouseWheelBehavior,
  paused,
  onPausedChange,
  onClear,
}: TWheelEventLogPanelProps): React.ReactElement {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const jsonPreRef = useRef<HTMLPreElement>(null);
  const hiddenCopyRef = useRef<HTMLTextAreaElement>(null);
  const copyFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    };
  }, []);

  const showCopyFeedback = useCallback((message: string): void => {
    setCopyFeedback(message);
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback(null);
      copyFeedbackTimerRef.current = null;
    }, 4000);
  }, []);

  const selectForManualCopy = useCallback(
    (text: string, selectJsonFallback: boolean): void => {
      if (selectJsonFallback && jsonPreRef.current) {
        const range = document.createRange();
        range.selectNodeContents(jsonPreRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else if (hiddenCopyRef.current) {
        hiddenCopyRef.current.value = text;
        hiddenCopyRef.current.focus({ preventScroll: true });
        hiddenCopyRef.current.select();
      }
      showCopyFeedback("Auto-copy blocked — text selected, press Ctrl/Cmd+C");
    },
    [showCopyFeedback]
  );

  const copyFromHiddenTextarea = useCallback((text: string): boolean => {
    const textarea = hiddenCopyRef.current;
    if (textarea === null) {
      return copyTextToClipboard(text);
    }

    try {
      textarea.value = text;
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }, []);

  const runCopy = useCallback(
    (text: string, selectJsonFallback: boolean): void => {
      // Sync copy must run in the click handler — await breaks the user-gesture chain in Storybook.
      if (copyFromHiddenTextarea(text)) {
        showCopyFeedback("Copied to clipboard");
        return;
      }

      const clipboard = navigator.clipboard;
      if (clipboard?.writeText) {
        clipboard.writeText(text).then(
          () => {
            showCopyFeedback("Copied to clipboard");
          },
          () => {
            selectForManualCopy(text, selectJsonFallback);
          }
        );
        return;
      }

      selectForManualCopy(text, selectJsonFallback);
    },
    [copyFromHiddenTextarea, selectForManualCopy, showCopyFeedback]
  );

  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return entries;
    }
    return entries.filter((entry) => formatWheelProbeSummary(entry).toLowerCase().includes(q));
  }, [entries, filter]);

  const selectedEntry = useMemo(() => entries.find((entry) => entry.id === selectedId) ?? null, [entries, selectedId]);

  const copyAll = useCallback((): void => {
    runCopy(JSON.stringify(entries, null, 2), false);
  }, [entries, runCopy]);

  const copySelected = useCallback((): void => {
    if (selectedEntry === null) {
      return;
    }
    runCopy(JSON.stringify(selectedEntry, null, 2), true);
  }, [selectedEntry, runCopy]);

  const selectedJsonText =
    selectedEntry === null ? "Click a row to inspect full payload" : JSON.stringify(selectedEntry, null, 2);

  const platformHint = entries[0]?.platform ?? navigator.platform;

  return (
    <Flex direction="column" className="wheel-probe-panel" gap={3}>
      <textarea ref={hiddenCopyRef} className="wheel-probe-hidden-copy" readOnly tabIndex={-1} aria-hidden="true" />
      <Flex direction="column" gap={1}>
        <Text variant="header-1">Wheel intent probe</Text>
        <Text variant="body-2" color="secondary">
          Scroll over the canvas with a mouse wheel, trackpad, or modifier keys. Each row is one real{" "}
          <code>WheelEvent</code> plus <code>resolveWheelIntent</code> output.
        </Text>
        <Text variant="caption-2" color="secondary">
          Platform: {platformHint} · MOUSE_WHEEL_BEHAVIOR: <strong>{mouseWheelBehavior}</strong> · {entries.length}{" "}
          events (max {MAX_ENTRIES_CAP})
        </Text>
      </Flex>

      <Flex gap={3} alignItems="center" wrap="wrap">
        <Switch checked={paused} onUpdate={onPausedChange}>
          Pause capture
        </Switch>
        <Button view="outlined" size="s" onClick={onClear} disabled={entries.length === 0}>
          Clear
        </Button>
        <Button view="outlined" size="s" onClick={copyAll} disabled={entries.length === 0}>
          Copy all JSON
        </Button>
        <Button view="outlined" size="s" onClick={copySelected} disabled={selectedEntry === null}>
          Copy selected
        </Button>
        {copyFeedback !== null ? (
          <Text variant="caption-2" color={copyFeedback.startsWith("Copied") ? "positive" : "warning"}>
            {copyFeedback}
          </Text>
        ) : null}
      </Flex>

      <Label text="Filter">
        <TextInput placeholder="rule, zoom, int, Ctrl…" value={filter} onUpdate={setFilter} size="s" />
      </Label>

      <div className="wheel-probe-table-wrap">
        <table className="wheel-probe-table">
          <thead>
            <tr>
              <th>#</th>
              <th>+ms</th>
              <th>Δx</th>
              <th>Δy</th>
              <th>mode</th>
              <th>int</th>
              <th>keys</th>
              <th>rule</th>
              <th>→</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={9} className="wheel-probe-empty">
                  {paused ? "Capture paused" : "No events yet — scroll over the graph"}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => {
                const { raw, resolver } = entry;
                const isSelected = entry.id === selectedId;
                const keys = [
                  raw.ctrlKey ? "C" : "",
                  raw.metaKey ? "M" : "",
                  raw.shiftKey ? "S" : "",
                  raw.altKey ? "A" : "",
                ]
                  .filter(Boolean)
                  .join("");

                return (
                  <tr
                    key={entry.id}
                    className={[
                      "wheel-probe-row",
                      isSelected ? "wheel-probe-row_selected" : "",
                      resolver.result === "zoom" ? "wheel-probe-row_zoom" : "wheel-probe-row_pan",
                    ].join(" ")}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <td>{entry.id}</td>
                    <td>{Math.round(resolver.session.timeSinceLastMs)}</td>
                    <td>{raw.deltaX}</td>
                    <td>{raw.deltaY}</td>
                    <td>{raw.deltaModeLabel}</td>
                    <td>{raw.deltaXIsInteger && raw.deltaYIsInteger ? "✓" : "~"}</td>
                    <td>{keys || "—"}</td>
                    <td>{resolver.rule}</td>
                    <td>{resolver.result}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Flex direction="column" gap={1} className="wheel-probe-detail">
        <Text variant="subheader-2">Selected event JSON</Text>
        <pre ref={jsonPreRef} className="wheel-probe-json">
          {selectedJsonText}
        </pre>
      </Flex>
    </Flex>
  );
}

export { MAX_ENTRIES_CAP };
