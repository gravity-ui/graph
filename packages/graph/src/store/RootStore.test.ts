import { Graph } from "../graph";

describe("RootStore", () => {
  let graph: Graph;
  beforeEach(() => {
    graph = new Graph({});
  });
  it("Should create blocksList", () => {
    expect(graph.rootStore.blocksList).toBeDefined();
  });

  it("Should create connectionList", () => {
    expect(graph.rootStore.connectionsList).toBeDefined();
  });

  it("Should create settings store", () => {
    expect(graph.rootStore.settings).toBeDefined();
  });
});
