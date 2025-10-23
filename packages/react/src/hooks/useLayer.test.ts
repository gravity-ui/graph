import { jest } from "@jest/globals";

import { Graph, Layer, LayerProps } from "@gravity-ui/graph";
import { act, renderHook } from "@testing-library/react";

import { useLayer } from "./useLayer";

// Type definitions for our tests
type TestLayerProps = Omit<LayerProps, "root" | "camera" | "graph" | "emitter"> & { root?: HTMLElement };

// Helper function to create valid layer props for testing
const createValidLayerProps = (): TestLayerProps => ({
  canvas: { zIndex: 1 },
  html: { zIndex: 2 },
});

// Mock Layer constructor for testing
class TestLayer extends Layer {
  setProps = jest.fn();
}

describe("useLayer hook", () => {
  // Real instances
  let graph: Graph;
  let addLayerSpy: jest.SpyInstance;
  let detachLayerSpy: jest.SpyInstance;

  // Mock console.error to suppress act warnings
  let consoleErrorSpy: jest.SpyInstance | undefined;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create a real Graph instance
    graph = new Graph({});

    // Spy on its methods
    addLayerSpy = jest.spyOn(graph, "addLayer");
    detachLayerSpy = jest.spyOn(graph, "detachLayer");

    // Mock the Layer's setProps method when it's created
    addLayerSpy.mockImplementation(() => {
      const layer = new TestLayer({ camera: graph.cameraService, graph } as any);
      jest.spyOn(layer, "setProps");
      return layer;
    });

    // Mock console.error to avoid act warnings
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy?.mockRestore();
  });

  describe("Initial rendering", () => {
    it("should return null when graph is null", () => {
      // Execute
      const { result } = renderHook(() => useLayer(null, TestLayer, createValidLayerProps()));

      // Verify
      expect(result.current).toBeNull();
      expect(addLayerSpy).not.toHaveBeenCalled();
    });

    it("should add layer to graph when graph is provided", () => {
      // Setup
      const props = createValidLayerProps();

      // Execute
      const { result } = renderHook(() => useLayer(graph, TestLayer, props));

      // Verify
      expect(result.current).not.toBeNull();
      expect(addLayerSpy).toHaveBeenCalledWith(TestLayer, props);
      expect(addLayerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Layer lifecycle", () => {
    it("should detach layer when component unmounts", () => {
      // Execute
      const { unmount, result } = renderHook(() => useLayer(graph, TestLayer, createValidLayerProps()));

      // Get the created layer
      const layer = result.current;

      // Trigger unmount inside act
      act(() => {
        unmount();
      });

      // Verify
      expect(detachLayerSpy).toHaveBeenCalledWith(layer);
      expect(detachLayerSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle null graph safely on unmount", () => {
      // First render with a graph
      const { rerender, unmount } = renderHook(({ g }) => useLayer(g, TestLayer, createValidLayerProps()), {
        initialProps: { g: graph },
      });

      // Then change to null graph
      act(() => {
        rerender({ g: null });
      });

      // Unmount should not cause errors
      act(() => {
        unmount();
      });

      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });

  describe("Props management", () => {
    it("should pass initial props to layer via addLayer", () => {
      // Setup
      const initialProps = createValidLayerProps();

      // Execute
      renderHook(() => useLayer(graph, TestLayer, initialProps));

      // Verify
      expect(addLayerSpy).toHaveBeenCalledWith(TestLayer, initialProps);
    });

    it.skip("should call setProps when props change", () => {
      // Setup
      const initialProps = createValidLayerProps();
      const newProps = {
        ...createValidLayerProps(),
        canvas: { zIndex: 3 }, // Changed prop
      };

      // Skipped: requires mocking isEqual which doesn't work well in ESM mode

      // Execute initial render
      const { rerender, result } = renderHook(({ props }) => useLayer(graph, TestLayer, props), {
        initialProps: { props: initialProps },
      });

      // Get the layer instance
      const layer = result.current;

      // Reset the calls to setProps after initial render
      (layer.setProps as jest.Mock).mockClear();

      // Re-render with new props - use act for React 18
      act(() => {
        rerender({ props: newProps });
      });

      // Verify
      expect(layer.setProps).toHaveBeenCalledWith(newProps);
      expect(layer.setProps).toHaveBeenCalledTimes(1);
    });

    it.skip("should not call setProps when props have not changed", () => {
      // Setup
      const props = createValidLayerProps();

      // Skipped: requires mocking isEqual which doesn't work well in ESM mode

      // Execute initial render
      const { rerender, result } = renderHook(({ props }) => useLayer(graph, TestLayer, props), {
        initialProps: { props },
      });

      // Get the layer instance
      const layer = result.current;

      // Reset the calls to setProps after initial render
      (layer.setProps as jest.Mock).mockClear();

      // Re-render with identical props (new object, same values)
      act(() => {
        rerender({ props: { ...props } });
      });

      // Verify
      expect(layer.setProps).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should recreate layer when graph reference changes", () => {
      // Setup initial graph
      const initialGraph = graph;

      // Setup new graph
      const newGraph = new Graph({});
      const newGraphAddLayerSpy = jest.spyOn(newGraph, "addLayer");
      newGraphAddLayerSpy.mockImplementation(() => {
        const layer = new TestLayer({ camera: newGraph.cameraService, graph: newGraph } as any);
        jest.spyOn(layer, "setProps");
        return layer;
      });

      // Execute initial render
      const { result, rerender } = renderHook(({ g }) => useLayer(g, TestLayer, createValidLayerProps()), {
        initialProps: { g: initialGraph },
      });

      // Get initial layer
      const initialLayer = result.current;

      // Verify initial state
      expect(initialLayer).not.toBeNull();
      expect(addLayerSpy).toHaveBeenCalledTimes(1);

      // Re-render with new graph - wrap in act
      act(() => {
        rerender({ g: newGraph });
      });

      // Get new layer
      const newLayer = result.current;

      // Verify layer was recreated
      expect(newLayer).not.toBe(initialLayer);
      expect(newGraphAddLayerSpy).toHaveBeenCalledTimes(1);
    });

    it.skip("should use usePrevious hook for props comparison", () => {
      // Skipped: requires mocking isEqual which doesn't work well in ESM mode
    });
  });
});
