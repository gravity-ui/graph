import { Block } from "../components/canvas/blocks/Block";
import { Graph } from "../graph";
import { Component } from "../lib/Component";

import { DefaultSettings, ECanDrag, GraphEditorSettings } from "./settings";

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

  it.each([ECanDrag.ALL, ECanDrag.ONLY_SELECTED, ECanDrag.NONE])("uses canDrag %s directly", (canDrag) => {
    store.setupSettings({ canDrag });
    expect(store.$canDrag.value).toBe(canDrag);
  });

  it("ignores undefined patches, including callbacks, and preserves falsy values", () => {
    const resolveWheelIntent = jest.fn();
    const getCameraBlockScaleLevel = jest.fn();
    store.setupSettings({ dragThreshold: 0, canZoomCamera: false, resolveWheelIntent, getCameraBlockScaleLevel });
    store.setupSettings({
      dragThreshold: undefined,
      canZoomCamera: undefined,
      resolveWheelIntent: undefined,
      getCameraBlockScaleLevel: undefined,
    });
    expect(store.asConfig.dragThreshold).toBe(0);
    expect(store.asConfig.canZoomCamera).toBe(false);
    expect(store.asConfig.resolveWheelIntent).toBe(resolveWheelIntent);
    expect(store.asConfig.getCameraBlockScaleLevel).toBe(getCameraBlockScaleLevel);
  });

  it("notifies subscribers for single-setting updates without modifying defaults or other graphs", () => {
    const other = new Graph({});
    const updates = jest.fn();
    const unsubscribe = store.$settings.subscribe(updates);
    updates.mockClear();
    graph.api.setSetting("dragThreshold", 0);
    expect(updates).toHaveBeenCalledTimes(1);
    expect(store.$dragThreshold.value).toBe(0);
    expect(other.rootStore.settings.asConfig.dragThreshold).toBe(DefaultSettings.dragThreshold);
    expect(DefaultSettings.dragThreshold).toBe(5);
    unsubscribe();
  });

  it("resets one setting or all settings to defaults, clearing optional overrides", () => {
    store.setupSettings({ dragThreshold: 0, canZoomCamera: false, getCameraBlockScaleLevel: jest.fn() });
    graph.resetSetting("getCameraBlockScaleLevel");
    expect(store.asConfig.getCameraBlockScaleLevel).toBe(DefaultSettings.getCameraBlockScaleLevel);
    expect(store.asConfig.dragThreshold).toBe(0);
    graph.resetSettings();
    expect(store.asConfig).toEqual(DefaultSettings);
  });
  it("merges component registrations and resets custom optional overrides explicitly", () => {
    store.setupSettings({ blockComponents: { First: Block }, background: Component });
    store.setupSettings({ blockComponents: { First: undefined, Second: Block }, background: undefined });
    expect(store.$blockComponents.value).toEqual({ First: Block, Second: Block });
    expect(store.$background.value).toBe(Component);
    graph.resetSetting("background");
    expect(store.$background.value).toBeUndefined();
    graph.resetSetting("blockComponents");
    expect(store.$blockComponents.value).toEqual({});
  });
});
