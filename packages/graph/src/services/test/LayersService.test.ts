import { Graph } from "../../graph";
import { Layer } from "../Layer";

describe("Layers.update", () => {
  let graph: Graph;

  afterEach(() => graph.unmount());

  it("does not render a layer created with selfUpdated", () => {
    graph = new Graph({}, document.createElement("div"));
    const rendered: string[] = [];
    class Own extends Layer {
      protected render(): void {
        rendered.push("own");
      }
    }
    class Regular extends Layer {
      protected render(): void {
        rendered.push("regular");
      }
    }
    const props = { camera: graph.cameraService, graph };
    const own = graph.layers.createLayer(Own, props, { selfUpdated: true });
    const regular = graph.layers.createLayer(Regular, props);
    own.performRender();
    regular.performRender();
    graph.layers.update();
    expect(rendered).toEqual(["regular"]);
  });
});
