import React, { useEffect, useRef, useState } from "react";

import { createAnchorPortId, getEntityAddress } from "@gravity-ui/graph";
import type {
  ECanDrag,
  Graph,
  GraphEventListener,
  GraphEventName,
  TCameraState,
  TEntityAddress,
} from "@gravity-ui/graph";
import { ConnectionEditingLayer } from "@gravity-ui/graph-connection-editing";
import { useLayer } from "@gravity-ui/graph-react";

function describe(address: TEntityAddress | undefined): string {
  return address ? `${address.type} ${address.id}` : "Background";
}

function focusPorts(graph: Graph) {
  const source = graph.connections.getPort(createAnchorPortId("p01/orders", "out-0"));
  const target = graph.connections.getPort(createAnchorPortId("p01/extract", "in-0"));
  if (!source || !target) return;
  graph.zoomTo(
    {
      x: Math.min(source.x, target.x),
      y: Math.min(source.y, target.y),
      width: Math.abs(target.x - source.x),
      height: Math.abs(target.y - source.y),
    },
    { padding: 50, transition: 0 }
  );
}

export function PointerDragPanel({ graph, children }: React.PropsWithChildren<{ graph: Graph }>) {
  useLayer(graph, ConnectionEditingLayer, {});
  const surface = useRef<HTMLDivElement>(null);
  const logView = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<{ type: string; strategy: ECanDrag }>();
  const [target, setTarget] = useState("—");
  const [selection, setSelection] = useState("—");
  const [result, setResult] = useState("Touch the scene");
  const [fingers, setFingers] = useState<number[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const node = surface.current;
    if (!node) return undefined;
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    const touches = new Set<number>();
    let handoff: { finger: PointerEvent; camera: TCameraState } | undefined;
    let sawPinchUpdate = false;
    let portDrag = false;
    let created = false;
    const on = <K extends GraphEventName>(name: K, listener: GraphEventListener<K>) =>
      graph.on(name, listener, options);
    const record = (label: string) => setHistory((recent) => [...recent.slice(-15), label]);

    // The graph intentionally ignores the second contact during a claimed port drag.
    node.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch") {
          touches.add(event.pointerId);
          const count = touches.size;
          setFingers((previous) => (count === 1 ? [1] : [...previous.slice(-8), count]));
          if (count > 1) {
            record(`${count} fingers`);
            return;
          }
        } else {
          setFingers([]);
        }
        setPointer({
          type: event.pointerType || "(empty)",
          strategy: graph.rootStore.settings.getCanDrag(event.pointerType),
        });
        setTarget(event.target instanceof Element ? event.target.tagName.toLowerCase() : "DOM");
        setSelection("—");
        setResult("No graph press");
      },
      options
    );
    const lift = (event: PointerEvent) => {
      if (!touches.delete(event.pointerId)) return;
      const count = touches.size;
      setFingers((previous) => [...previous.slice(-8), count]);
      if (handoff?.finger.pointerId === event.pointerId) handoff = undefined;
    };
    node.ownerDocument.addEventListener("pointerup", lift, options);
    node.ownerDocument.addEventListener("pointercancel", lift, options);
    const interrupt = () => {
      handoff = undefined;
      if (touches.size) {
        touches.clear();
        setFingers([]);
        setResult("Interrupted");
      }
    };
    node.ownerDocument.defaultView?.addEventListener("blur", interrupt, options);
    node.ownerDocument.addEventListener(
      "visibilitychange",
      () => {
        if (node.ownerDocument.hidden) interrupt();
      },
      options
    );

    on("press", ({ target: hit, event }) => {
      if (event.pointerType === "touch" && touches.size > 1) return;
      const address = getEntityAddress(hit);
      setTarget(describe(address));
      setSelection(address && graph.selectionService.isSelected(address.type, address.id) ? "selected" : "unselected");
      setResult("Pressed");
    });
    on("dragstart", () => {
      const before = graph.$camera.peek();
      // Default drag arbitration runs after all dragstart listeners return.
      queueMicrotask(() => {
        if (controller.signal.aborted || portDrag) return;
        const dragged = graph.dragService.$state.peek().components[0];
        const after = graph.$camera.peek();
        if (dragged) setResult(describe(getEntityAddress(dragged)));
        else if (before.x !== after.x || before.y !== after.y) setResult("Camera");
        else setResult("No movement");
      });
    });

    for (const name of ["click", "dblclick", "longpress"] as const) {
      on(name, () => {
        record(name);
        setResult(name);
      });
    }
    on("pinch", ({ phase, pointers, event }) => {
      if (phase === "start") {
        handoff = undefined;
        sawPinchUpdate = false;
      }
      if (phase === "update" && sawPinchUpdate) return;
      sawPinchUpdate = phase === "update";
      if (phase === "end") {
        const finger = pointers.find((p) => p.pointerId !== event.pointerId);
        if (finger) handoff = { finger, camera: graph.$camera.peek() };
      }
      record(
        phase === "start" || phase === "end"
          ? `pinch.${phase} (${graph.$camera.peek().scale.toFixed(2)}×)`
          : `pinch.${phase}`
      );
      setResult(`pinch.${phase}`);
    });
    // Read the committed camera after the graph's document-capture handler processes this finger.
    node.ownerDocument.addEventListener(
      "pointermove",
      (event) => {
        if (!handoff || handoff.finger.pointerId !== event.pointerId) return;
        const { camera, finger } = handoff;
        const dx = event.clientX - finger.clientX;
        const dy = event.clientY - finger.clientY;
        if (!dx && !dy) return;
        handoff = undefined;
        const after = graph.$camera.peek();
        if (after.x === camera.x && after.y === camera.y) {
          record("1 finger: camera stationary");
          setResult("No movement");
          return;
        }
        const offset = Math.hypot(after.x - camera.x - dx, after.y - camera.y - dy);
        record(`pan (1 finger) · offset ${offset.toFixed(1)} px`);
        setResult("Camera");
      },
      { signal: controller.signal }
    );

    on("connection-create-start", () => {
      portDrag = true;
      created = false;
      record("connection-create-start");
      setResult("Port drag");
    });
    on("connection-created", () => {
      created = true;
      record("connection-created");
    });
    on("connection-create-drop", () => {
      portDrag = false;
      record("connection-create-drop");
      setResult(created ? "Connection created" : "Dropped without a connection");
    });
    on("connection-create-cancel", () => {
      portDrag = false;
      record("connection-create-cancel");
      setResult("Port drag cancelled");
    });
    return () => controller.abort();
  }, [graph]);

  useEffect(() => {
    if (logView.current) logView.current.scrollTop = logView.current.scrollHeight;
  }, [history]);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "8px 12px", font: "14px/1.45 system-ui", maxHeight: "48dvh", overflowY: "auto" }}>
        <output aria-label="Last pointer gesture">
          <div>
            pointerType <b>{pointer?.type ?? "—"}</b> · canDrag <b>{pointer?.strategy ?? "—"}</b>
          </div>
          <div style={{ whiteSpace: "nowrap", overflowX: "auto" }}>
            Target <b>{target}</b> · at press <b>{selection}</b>
          </div>
          <div>
            Result <b>{result}</b>
          </div>
          <div>
            Fingers <b>{fingers.join(" → ") || "—"}</b>
          </div>
          <div
            role="log"
            aria-label="Gesture history"
            ref={logView}
            style={{ height: "2.9em", overflowY: "auto", overflowWrap: "anywhere" }}
          >
            {history.join(" → ") || "No events yet"}
          </div>
        </output>
        <button type="button" onClick={() => focusPorts(graph)}>
          Focus ports
        </button>{" "}
        <button type="button" onClick={() => setHistory([])}>
          Clear log
        </button>
        <details>
          <summary>Try the gestures</summary>
          <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
            <li>
              Hold a block for half a second, then lift. Look for one longpress. Tap twice quickly on the same block for
              dblclick.
            </li>
            <li>
              Pan, add a finger and pinch. Lift either finger, then move the one left on the scene. The camera should
              follow the remaining finger. The offset shows the difference in pixels on its first move.
            </li>
            <li>
              Focus ports. Touch the right port of Orders DB and add a second finger before moving. Bring the fingers
              closer to zoom out.
            </li>
            <li>
              Try again. Drag the port until the preview line appears, then add a finger. Drop the first finger on the
              left port of Extract orders to create the connection.
            </li>
          </ul>
        </details>
      </header>
      <div
        ref={surface}
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        onPointerCancelCapture={() => setResult("Pointer cancelled")}
      >
        {children}
      </div>
    </div>
  );
}
