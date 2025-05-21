import { act, renderHook } from "@testing-library/react";
import isEqual from "lodash/isEqual";

import { Graph } from "../../graph";
import { Layer, LayerProps } from "../../services/Layer";

import { useLayer } from "./useLayer";

// Mock dependencies
jest.mock("lodash/isEqual");
const mockedIsEqual = isEqual as jest.Mock;

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
  let consoleErrorSpy: jest.SpyInstance;

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

    // Setup isEqual mock with default implementation
    mockedIsEqual.mockImplementation((a, b) => JSON.stringify(a) === JSON.stringify(b));

    // Mock console.error to avoid act warnings
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    consoleErrorSpy.mockRestore();
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
    it("should call setProps on initial render", () => {
      // Setup
      const props = createValidLayerProps();

      // Execute
      const { result } = renderHook(() => useLayer(graph, TestLayer, props));

      // Get the layer instance
      const layer = result.current;

      // Verify that setProps was called on the created layer
      expect(layer.setProps).toHaveBeenCalledWith(props);
    });

    it("should pass initial props to layer via addLayer", () => {
      // Setup
      const initialProps = createValidLayerProps();

      // Execute
      renderHook(() => useLayer(graph, TestLayer, initialProps));

      // Verify
      expect(addLayerSpy).toHaveBeenCalledWith(TestLayer, initialProps);
    });

    it("should call setProps when props change", () => {
      // Setup
      const initialProps = createValidLayerProps();
      const newProps = {
        ...createValidLayerProps(),
        canvas: { zIndex: 3 }, // Changed prop
      };

      // Mock isEqual to return false, indicating props have changed
      mockedIsEqual.mockReturnValue(false);

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

    it("should not call setProps when props have not changed", () => {
      // Setup
      const props = createValidLayerProps();

      // Mock isEqual to return true, indicating props have not changed
      mockedIsEqual.mockReturnValue(true);

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

    it("should use usePrevious hook for props comparison", () => {
      // Setup
      const initialProps = createValidLayerProps();
      const newProps = {
        ...initialProps,
        canvas: { zIndex: 5 },
      };

      // Mock a specific implementation for isEqual that we can track
      let comparedNewProps: any = null;

      mockedIsEqual.mockImplementation((a, b) => {
        comparedNewProps = b;
        return false; // Always trigger setProps
      });

      // Execute initial render
      const { rerender, result } = renderHook(({ props }) => useLayer(graph, TestLayer, props), {
        initialProps: { props: initialProps },
      });

      // Get the layer instance
      const layer = result.current;

      // Clear calls from initial render
      mockedIsEqual.mockClear();
      layer.setProps.mockClear();

      // Re-render with new props
      act(() => {
        rerender({ props: newProps });
      });

      // Verify isEqual was called with previous and current props
      expect(mockedIsEqual).toHaveBeenCalledTimes(1);
      expect(comparedNewProps).toEqual(newProps);
      expect(layer.setProps).toHaveBeenCalledWith(newProps);
    });
  });
});
