import { Block } from "../../components/canvas/blocks/Block";
import { Graph } from "../../graph";

describe("toImage with a block outline", () => {
  it("includes the halo when a crop reaches only the shadow of an export-only outline", () => {
    const graph = new Graph({}, document.createElement("div"));
    try {
      const bounds = { minX: 0, minY: 0, maxX: 50, maxY: 30 };
      graph.scene.store.add({
        id: "card",
        entityType: "block",
        x: 0,
        y: 0,
        zIndex: 1,
        bounds,
        primitives: [{ kind: "rect", part: "body", x: 0, y: 0, width: 50, height: 30, fill: "#fff" }],
      });
      graph.scene.styles.add([
        {
          target: Block,
          scope: { minScale: 2 },
          style: {
            outline: { color: "#112233", width: 2, halo: { color: "rgba(0,0,0,.6)", width: 20 } },
          },
        },
      ]);
      graph.scene.bindStyle("card", { type: "block", id: "card" }, Block);
      const image = graph.scene.toImage({ rect: { x: 65, y: 10, width: 2, height: 2 }, scale: 2, pixelRatio: 1 });
      const ctx = image.getContext("2d") as unknown as { __getEvents(): { type: string }[] };
      expect(ctx.__getEvents().filter((e) => e.type === "stroke")).toHaveLength(3);
    } finally {
      graph.unmount();
    }
  });

  it("uses the export's style, skips the live outline and respects a delegated owner's visibility", () => {
    const graph = new Graph({}, document.createElement("div"));
    try {
      const { store } = graph.scene;
      const bounds = { minX: 0, minY: 0, maxX: 50, maxY: 30 };
      store.add({
        id: "b",
        entityType: "block",
        x: 0,
        y: 0,
        zIndex: 1,
        bounds,
        primitives: [{ kind: "rect", part: "body", x: 0, y: 0, width: 50, height: 30, fill: "#fff" }],
      });
      store.add({
        id: "consumer-outline",
        entityType: "block-outline",
        parent: "b",
        x: 0,
        y: 0,
        zIndex: 0,
        bounds,
        primitives: [
          { kind: "path", segments: Float32Array.of(0, 0, 1, 1, 2, 2, 3, 3), stroke: { color: "#aa0000", width: 1 } },
        ],
      });
      graph.scene.styles.add([
        { target: Block, style: { outline: { color: "#555555", width: 2 } } },
        { target: Block, scope: { maxScale: 0.5 }, style: { outline: null } },
        { target: Block, scope: { minScale: 2 }, style: { outline: { color: "#113377", width: 3 } } },
      ]);
      graph.scene.bindStyle("b", { type: "block", id: "b" }, Block);
      graph.scene.query({ x: 0, y: 0, width: 55, height: 35 });
      expect(store.childrenOf("b").length).toBe(2);
      const colors = (scale: number) => {
        const image = graph.scene.toImage({
          rect: { x: 0, y: 0, width: 55, height: 35 },
          scale,
          level: "schematic",
          pixelRatio: 1,
        });
        const ctx = image.getContext("2d") as unknown as {
          __getEvents(): { type: string; props: { value: string } }[];
        };
        return ctx
          .__getEvents()
          .filter((e) => e.type === "strokeStyle")
          .map((e) => e.props.value);
      };
      expect(colors(2)).toEqual(["#aa0000", "#113377"]);
      expect(colors(0.25)).toEqual(["#aa0000"]);
      store.update("b", { hidden: true });
      expect(colors(2)).toEqual([]);
    } finally {
      graph.unmount();
    }
  });
});
