import React, { useEffect, useState } from "react";

import { getEntityAddress } from "@gravity-ui/graph";
import type { ECanDrag, Graph, TEntityAddress } from "@gravity-ui/graph";

function describe(address: TEntityAddress | undefined): string {
  return address ? `${address.type} ${address.id}` : "Background";
}

export function PointerDragPanel({ graph, children }: React.PropsWithChildren<{ graph: Graph }>) {
  const [pointer, setPointer] = useState<{ type: string; strategy: ECanDrag }>();
  const [target, setTarget] = useState("—");
  const [selection, setSelection] = useState("—");
  const [result, setResult] = useState("Touch the scene");

  useEffect(() => {
    const controller = new AbortController();
    const options = { capture: true, signal: controller.signal };
    graph.on(
      "press",
      (press) => {
        const address = getEntityAddress(press.target);
        setTarget(describe(address));
        setSelection(
          address && graph.selectionService.isSelected(address.type, address.id) ? "selected" : "unselected"
        );
        setResult("Pressed");
      },
      options
    );
    graph.on(
      "dragstart",
      () => {
        const before = graph.$camera.peek();
        // Default drag arbitration runs after all dragstart listeners return.
        queueMicrotask(() => {
          if (controller.signal.aborted) return;
          const dragged = graph.dragService.$state.peek().components[0];
          const after = graph.$camera.peek();
          if (dragged) setResult(describe(getEntityAddress(dragged)));
          else if (before.x !== after.x || before.y !== after.y) setResult("Camera");
          else setResult("No movement");
        });
      },
      options
    );
    graph.on("click", () => setResult("Click"), options);
    graph.on("longpress", () => setResult("Long press"), options);
    graph.on(
      "pinch",
      ({ phase }) => {
        if (phase === "start") setResult("Pinch");
      },
      options
    );
    return () => controller.abort();
  }, [graph]);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <output aria-label="Last pointer gesture" style={{ padding: "8px 12px", font: "14px/1.45 system-ui" }}>
        <div>
          pointerType <b>{pointer?.type ?? "—"}</b> · canDrag <b>{pointer?.strategy ?? "—"}</b>
        </div>
        <div>
          Target <b>{target}</b> · at press <b>{selection}</b>
        </div>
        <div>
          Result <b>{result}</b>
        </div>
      </output>
      <div
        style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        onPointerCancelCapture={() => setResult("Pointer cancelled")}
        onPointerDownCapture={({ pointerType, target: element }) => {
          setPointer({ type: pointerType || "(empty)", strategy: graph.rootStore.settings.getCanDrag(pointerType) });
          setTarget(element instanceof Element ? element.tagName.toLowerCase() : "DOM");
          setSelection("—");
          setResult("No graph press");
        }}
      >
        {children}
      </div>
    </div>
  );
}
