import { Graph } from "../graph";
import { ECanChangeBlockGeometry, GraphEditorSettings } from "./settings";

describe("Settings store", () => {
  let graph: Graph;
  let store: GraphEditorSettings;
  beforeEach(() => {
    graph = new Graph({});
    store = graph.rootStore.settings;
  });
  it("should be defined", () => {
    expect(store).toBeDefined();
  });

  it("Should init wit default settings", () => {
    expect(store.asConfig).toEqual({
      canDragCamera: true,
      canZoomCamera: true,
      canDuplicateBlocks: false,
      canChangeBlockGeometry: ECanChangeBlockGeometry.NONE,
      canCreateNewConnections: false,
      showConnectionArrows: true,
      scaleFontSize: 1,
      useBezierConnections: true,
      bezierConnectionDirection: "horizontal",
      useBlocksAnchors: true,
      connectivityComponentOnClickRaise: true,
      showConnectionLabels: false,
      blockComponents: {},
    });
  });
  it("Should get config via key", () => {
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(false);
  });
  it("Should set config via key", () => {
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(false);
    store.setConfigFlag("canDuplicateBlocks", true)
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(true);
  });
});
