import { expect, test } from "@playwright/test";
import type { TConnection, TMultipointConnection } from "@gravity-ui/graph";

import { GraphPageObject } from "../../page-objects/GraphPageObject";

for (const kind of ["bezier", "multipoint"] as const) {
  test(`${kind} keeps real Path2D hit testing before its first visible batch draw`, async ({ page }) => {
    const graph = new GraphPageObject(page);
    await page.goto("/base.html");
    await page.waitForFunction(() => window.graphLibraryLoaded === true);
    await page.evaluate((connectionKind) => {
      const { Graph, BlockConnection, MultipointConnection } = window.GraphModule;
      class ObservedConnection extends BlockConnection<TConnection> {
        public draws = 0;
        public override afterRender(ctx: CanvasRenderingContext2D) {
          this.draws++;
          super.afterRender?.(ctx);
        }
      }
      class ObservedMultipoint extends MultipointConnection {
        public draws = 0;
        public override afterRender(ctx: CanvasRenderingContext2D) {
          this.draws++;
          super.afterRender?.(ctx);
        }
      }
      const root = document.getElementById("root");
      if (!(root instanceof HTMLDivElement)) throw new Error("Root not found");
      const target = new Graph(
        {
          connections: [{ id: "far", sourcePortId: "source", targetPortId: "target" }],
          settings: {
            connection: connectionKind === "multipoint" ? ObservedMultipoint : ObservedConnection,
            useBezierConnections: true,
          },
        },
        root
      );
      const state = target.connections.getConnectionState("far");
      if (!state) throw new Error("Connection not found");
      const source = { x: 50_000, y: 50_000 };
      const destination = { x: 50_400, y: 50_000 };
      if (connectionKind === "multipoint") {
        const update: TMultipointConnection = { id: "far", points: [source, destination] };
        state.updateConnection(update);
      }
      state.$sourcePortState.value.updatePort({ ...source, lookup: false });
      state.$targetPortState.value.updatePort({ ...destination, lookup: false });
      target.cameraService.set({ x: 0, y: 0, scale: 1 });
      target.start();
      window.graph = target;
    }, kind);
    await graph.waitForFrames(3);

    const inspect = () =>
      graph.evaluate((target) => {
        const view = target.connections.getConnectionState("far")?.getViewComponent();
        return {
          draws: view && "draws" in view ? view.draws : null,
          hit: target.getElementOverPoint({ x: 50_200, y: 50_000 })?.getEntityId(),
          miss: target.getElementOverPoint({ x: 50_200, y: 50_100 })?.getEntityId() ?? null,
          rectangle: target
            .getElementsOverRect({ x: 50_190, y: 49_990, width: 20, height: 20 })
            .map((element) => element.getEntityId()),
        };
      });

    expect(await inspect()).toEqual({ draws: 0, hit: "far", miss: null, rectangle: ["far"] });
    await graph.evaluate((target) => target.cameraService.set({ x: -49_800, y: -49_800 }));
    await graph.waitForFrames(3);
    const visible = await inspect();
    expect(visible.draws).toBeGreaterThan(0);
    expect(visible.hit).toBe("far");

    await graph.evaluate((target) => target.cameraService.set({ x: 0, y: 0 }));
    await graph.waitForFrames(3);
    expect(await inspect()).toEqual(visible);
  });
}
