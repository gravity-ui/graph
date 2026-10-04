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
    expect(Object.prototype.hasOwnProperty.call(store.asConfig, "background")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(store.asConfig, "connection")).toBe(true);
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
    graph.resetSettings(["getCameraBlockScaleLevel"]);
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
    graph.resetSettings(["background"]);
    expect(store.$background.value).toBeUndefined();
    graph.resetSettings(["blockComponents"]);
    expect(store.$blockComponents.value).toEqual({});
  });
  it("resets multiple settings atomically and preserves other values", () => {
    store.setupSettings({ canDrag: ECanDrag.ALL, dragThreshold: 0, canZoomCamera: false });
    const updates = jest.fn();
    const unsubscribe = store.$settings.subscribe(updates);
    updates.mockClear();
    graph.resetSettings(["canDrag", "dragThreshold", "canDrag"]);
    expect(store.asConfig.canDrag).toBe(DefaultSettings.canDrag);
    expect(store.asConfig.dragThreshold).toBe(DefaultSettings.dragThreshold);
    expect(store.asConfig.canZoomCamera).toBe(false);
    expect(updates).toHaveBeenCalledTimes(1);
    const current = store.$settings.value;
    graph.resetSettings([]);
    expect(store.$settings.value).toBe(current);
    expect(updates).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it("restores constructor settings selectively and entirely after later setup calls", () => {
    const callback = jest.fn();
    const configured = new Graph({
      settings: { dragThreshold: 10, canDrag: ECanDrag.ALL, background: Component, getCameraBlockScaleLevel: callback },
    });
    const settings = configured.rootStore.settings;
    const initial = settings.asConfig;
    configured.setupGraph({
      settings: { dragThreshold: 20, canDrag: ECanDrag.NONE, getCameraBlockScaleLevel: jest.fn() },
    });
    configured.updateSettings({ canZoomCamera: false });
    configured.resetSettings(["dragThreshold", "getCameraBlockScaleLevel"]);
    expect(settings.asConfig.dragThreshold).toBe(10);
    expect(settings.asConfig.getCameraBlockScaleLevel).toBe(callback);
    expect(settings.asConfig.canZoomCamera).toBe(false);
    expect(settings.asConfig.canDrag).toBe(ECanDrag.NONE);
    configured.resetSettings();
    expect(settings.asConfig).toEqual(initial);
    expect(settings.asConfig.background).toBe(Component);
  });

  it("keeps an independent initial snapshot through input mutation and repeated resets", () => {
    const blockComponents: Record<string, typeof Block> = { First: Block };
    const input = { dragThreshold: 10, blockComponents };
    const configured = new Graph({ settings: input });
    const other = new Graph({ settings: { dragThreshold: 30 } });
    input.dragThreshold = 99;
    delete input.blockComponents.First;
    configured.updateSettings({ dragThreshold: 20, blockComponents: { Second: Block } });
    configured.resetSettings(["blockComponents"]);
    expect(configured.rootStore.settings.asConfig.blockComponents).toEqual({ First: Block });
    configured.updateSettings({ blockComponents: { Third: Block } });
    configured.resetSettings();
    expect(configured.rootStore.settings.asConfig.dragThreshold).toBe(10);
    expect(configured.rootStore.settings.asConfig.blockComponents).toEqual({ First: Block });
    other.resetSettings();
    expect(other.rootStore.settings.asConfig.dragThreshold).toBe(30);
    expect(DefaultSettings.dragThreshold).toBe(5);
  });
});
