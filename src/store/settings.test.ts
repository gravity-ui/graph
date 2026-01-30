import { Graph } from "../graph";

import { DefaultSettings, ECanChangeBlockGeometry, ECanDrag, GraphEditorSettings } from "./settings";

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

  it("Should init with default settings", () => {
    expect(store.asConfig).toEqual(DefaultSettings);
  });

  it("Should get config via key", () => {
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(false);
  });

  it("Should set config via key", () => {
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(false);
    store.setConfigFlag("canDuplicateBlocks", true);
    expect(store.getConfigFlag("canDuplicateBlocks")).toBe(true);
  });

  describe("$canDrag computed with backward compatibility", () => {
    describe("new setting (canDrag)", () => {
      it("should default to NONE", () => {
        expect(store.$canDrag.value).toBe(ECanDrag.NONE);
      });

      it("should use ALL when explicitly set", () => {
        store.setupSettings({ canDrag: ECanDrag.ALL });
        expect(store.$canDrag.value).toBe(ECanDrag.ALL);
      });

      it("should use ONLY_SELECTED when explicitly set", () => {
        store.setupSettings({ canDrag: ECanDrag.ONLY_SELECTED });
        expect(store.$canDrag.value).toBe(ECanDrag.ONLY_SELECTED);
      });

      it("should use NONE when explicitly set", () => {
        store.setupSettings({ canDrag: ECanDrag.NONE });
        expect(store.$canDrag.value).toBe(ECanDrag.NONE);
      });
    });

    describe("deprecated setting (canChangeBlockGeometry)", () => {
      it("should use ALL when set via deprecated setting", () => {
        store.setupSettings({ canChangeBlockGeometry: ECanChangeBlockGeometry.ALL });
        expect(store.$canDrag.value).toBe(ECanDrag.ALL);
      });

      it("should use ONLY_SELECTED when set via deprecated setting", () => {
        store.setupSettings({ canChangeBlockGeometry: ECanChangeBlockGeometry.ONLY_SELECTED });
        expect(store.$canDrag.value).toBe(ECanDrag.ONLY_SELECTED);
      });

      it("should use NONE when set via deprecated setting", () => {
        store.setupSettings({ canChangeBlockGeometry: ECanChangeBlockGeometry.NONE });
        expect(store.$canDrag.value).toBe(ECanDrag.NONE);
      });
    });

    describe("conflict resolution (both settings provided)", () => {
      it("should prioritize deprecated canChangeBlockGeometry over canDrag to not break existing users", () => {
        store.setupSettings({
          canChangeBlockGeometry: ECanChangeBlockGeometry.NONE,
          canDrag: ECanDrag.ALL,
        });
        expect(store.$canDrag.value).toBe(ECanDrag.NONE);
      });

      it("should use canChangeBlockGeometry=ALL even when canDrag=NONE", () => {
        store.setupSettings({
          canChangeBlockGeometry: ECanChangeBlockGeometry.ALL,
          canDrag: ECanDrag.NONE,
        });
        expect(store.$canDrag.value).toBe(ECanDrag.ALL);
      });

      it("should use canChangeBlockGeometry=ONLY_SELECTED even when canDrag=ALL", () => {
        store.setupSettings({
          canChangeBlockGeometry: ECanChangeBlockGeometry.ONLY_SELECTED,
          canDrag: ECanDrag.ALL,
        });
        expect(store.$canDrag.value).toBe(ECanDrag.ONLY_SELECTED);
      });
    });

    describe("migration path", () => {
      it("should allow migration by removing deprecated setting and using new one", () => {
        // User starts with deprecated setting
        store.setupSettings({ canChangeBlockGeometry: ECanChangeBlockGeometry.NONE });
        expect(store.$canDrag.value).toBe(ECanDrag.NONE);

        // User migrates: removes deprecated setting, adds new one
        store.setupSettings({
          canChangeBlockGeometry: undefined,
          canDrag: ECanDrag.ALL,
        });
        expect(store.$canDrag.value).toBe(ECanDrag.ALL);
      });
    });
  });
});
