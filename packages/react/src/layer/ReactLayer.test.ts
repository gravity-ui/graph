import { Graph } from "@gravity-ui/graph";
import { jest } from "@jest/globals";

import { TBlockListProps } from "../BlocksList";

import { ReactLayer } from "./ReactLayer";

describe("ReactLayer", () => {
  let graph: Graph;
  let camera: Graph["cameraService"];
  let rootElement: HTMLDivElement;

  // Constants for default classes
  const DEFAULT_LAYER_CLASSES = ["layer", "layer-html", "no-user-select", "no-pointer-events", "layer-with-camera"];

  beforeEach(() => {
    graph = new Graph({});
    camera = graph.cameraService;
    rootElement = document.createElement("div");
    document.body.appendChild(rootElement);
  });

  afterEach(() => {
    document.body.removeChild(rootElement);
  });

  // Helper function to create ReactLayer with default props
  const createLayer = (blockListClassName?: string) => {
    return new ReactLayer({
      graph,
      camera,
      root: rootElement,
      blockListClassName,
    });
  };

  // Helper function to create ReactLayer without root (unattached)
  const createUnattachedLayer = (blockListClassName?: string) => {
    return new ReactLayer({
      graph,
      camera,
      root: undefined as any,
      blockListClassName,
    });
  };

  // Helper function to get HTML element safely
  const getHTMLElement = (layer: ReactLayer): HTMLElement => {
    layer.attachLayer(rootElement);
    const htmlElement = layer.getHTML();
    expect(htmlElement).toBeTruthy();
    return htmlElement;
  };

  // Helper function to check if element has only default classes
  const hasOnlyDefaultClasses = (element: HTMLElement): boolean => {
    return (
      DEFAULT_LAYER_CLASSES.every((cls) => element.classList.contains(cls)) &&
      element.classList.length === DEFAULT_LAYER_CLASSES.length
    );
  };

  describe("initialization", () => {
    it("should create layer with default HTML classes", () => {
      const layer = createLayer();
      const htmlElement = getHTMLElement(layer);

      DEFAULT_LAYER_CLASSES.forEach((className) => {
        expect(htmlElement.classList.contains(className)).toBe(true);
      });
    });

    it("should handle layer creation without attachment", () => {
      const layer = createUnattachedLayer("test-class");
      const htmlElement = layer.getHTML();

      expect(htmlElement).toBeTruthy();
      expect(htmlElement.parentNode).toBeNull(); // Not attached to DOM

      // blockListClassName is not applied until attachLayer is called (which calls afterInit)
      expect(htmlElement.classList.contains("test-class")).toBe(false);
      expect(hasOnlyDefaultClasses(htmlElement)).toBe(true);
    });

    it("should initialize with correct z-index", () => {
      const layer = createLayer();
      const htmlElement = getHTMLElement(layer);

      expect(htmlElement.style.zIndex).toBe("3");
    });
  });

  describe("blockListClassName", () => {
    it("should apply blockListClassName to HTML element", () => {
      const className = "test-class";
      const layer = createLayer(className);
      const htmlElement = getHTMLElement(layer);

      expect(htmlElement.classList.contains(className)).toBe(true);
    });

    it("should update blockListClassName when props change", () => {
      const initialClassName = "initial-class";
      const newClassName = "new-class";

      const layer = createLayer(initialClassName);
      const htmlElement = getHTMLElement(layer);

      // Check initial class
      expect(htmlElement.classList.contains(initialClassName)).toBe(true);

      // Update props and force iterate to trigger propsChanged
      layer.setProps({ blockListClassName: newClassName });
      layer.iterate();

      // Check that old class is removed and new class is added
      expect(htmlElement.classList.contains(initialClassName)).toBe(false);
      expect(htmlElement.classList.contains(newClassName)).toBe(true);
    });

    it("should handle undefined blockListClassName", () => {
      const layer = createLayer(undefined);
      const htmlElement = getHTMLElement(layer);

      expect(hasOnlyDefaultClasses(htmlElement)).toBe(true);
    });

    it("should remove class when changed to undefined", () => {
      const className = "test-class";
      const layer = createLayer(className);
      const htmlElement = getHTMLElement(layer);

      // Check initial class
      expect(htmlElement.classList.contains(className)).toBe(true);

      // Update to undefined and force iterate to trigger propsChanged
      layer.setProps({ blockListClassName: undefined });
      layer.iterate();

      // Check that class is removed
      expect(htmlElement.classList.contains(className)).toBe(false);
    });

    it("should not affect other default classes", () => {
      const className = "test-class";
      const layer = createLayer(className);
      const htmlElement = getHTMLElement(layer);

      // Check that default classes are preserved
      DEFAULT_LAYER_CLASSES.forEach((defaultClass) => {
        expect(htmlElement.classList.contains(defaultClass)).toBe(true);
      });
      expect(htmlElement.classList.contains(className)).toBe(true);
    });

    it("should handle multiple classes in a string", () => {
      const multipleClasses = "class1 class2 class3";
      const layer = createLayer(multipleClasses);
      const htmlElement = getHTMLElement(layer);

      // Check that all classes are applied
      expect(htmlElement.classList.contains("class1")).toBe(true);
      expect(htmlElement.classList.contains("class2")).toBe(true);
      expect(htmlElement.classList.contains("class3")).toBe(true);
    });

    it("should update multiple classes correctly", () => {
      const initialClasses = "initial1 initial2";
      const newClasses = "new1 new2 new3";

      const layer = createLayer(initialClasses);
      const htmlElement = getHTMLElement(layer);

      // Check initial classes
      expect(htmlElement.classList.contains("initial1")).toBe(true);
      expect(htmlElement.classList.contains("initial2")).toBe(true);

      // Update props and force iterate
      layer.setProps({ blockListClassName: newClasses });
      layer.iterate();

      // Check that old classes are removed and new classes are added
      expect(htmlElement.classList.contains("initial1")).toBe(false);
      expect(htmlElement.classList.contains("initial2")).toBe(false);
      expect(htmlElement.classList.contains("new1")).toBe(true);
      expect(htmlElement.classList.contains("new2")).toBe(true);
      expect(htmlElement.classList.contains("new3")).toBe(true);
    });

    it("should handle empty and whitespace strings", () => {
      const emptyClasses = "   ";
      const layer = createLayer(emptyClasses);
      const htmlElement = getHTMLElement(layer);

      // Should only have default classes
      expect(hasOnlyDefaultClasses(htmlElement)).toBe(true);
    });

    it("should remove multiple classes when changed to undefined", () => {
      const multipleClasses = "class1 class2 class3";
      const layer = createLayer(multipleClasses);
      const htmlElement = getHTMLElement(layer);

      // Check initial classes
      expect(htmlElement.classList.contains("class1")).toBe(true);
      expect(htmlElement.classList.contains("class2")).toBe(true);
      expect(htmlElement.classList.contains("class3")).toBe(true);

      // Update to undefined
      layer.setProps({ blockListClassName: undefined });
      layer.iterate();

      // Check that all classes are removed
      expect(htmlElement.classList.contains("class1")).toBe(false);
      expect(htmlElement.classList.contains("class2")).toBe(false);
      expect(htmlElement.classList.contains("class3")).toBe(false);
    });

    it("should not cause unnecessary DOM operations when setting same class", () => {
      const className = "test-class";
      const layer = createLayer(className);
      const htmlElement = getHTMLElement(layer);

      const addSpy = jest.spyOn(htmlElement.classList, "add");
      const removeSpy = jest.spyOn(htmlElement.classList, "remove");

      // Set same class
      layer.setProps({ blockListClassName: className });
      layer.iterate();

      // Should not add or remove classes
      expect(addSpy).not.toHaveBeenCalled();
      expect(removeSpy).not.toHaveBeenCalled();

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("renderPortal", () => {
    it("should return null when HTML element is forcibly removed", () => {
      const layer = createUnattachedLayer();
      const renderBlock = jest.fn<TBlockListProps["renderBlock"]>();

      // Mock getHTML to return null
      jest.spyOn(layer, "getHTML").mockReturnValue(null);

      const portal = layer.renderPortal(renderBlock);
      expect(portal).toBeNull();
    });

    it("should create portal even when layer is not attached", () => {
      const layer = createUnattachedLayer();
      const renderBlock = jest.fn();

      const portal = layer.renderPortal(renderBlock);
      expect(portal).toBeTruthy();
      expect(portal).toHaveProperty("$$typeof"); // React Portal symbol
      expect(portal).toHaveProperty("key", "graph-blocks-list");
    });

    it("should create portal when HTML element is available", () => {
      const layer = createLayer();
      const _htmlElement = getHTMLElement(layer);

      const renderBlock = jest.fn();
      const portal = layer.renderPortal(renderBlock);

      expect(portal).toBeTruthy();
      expect(portal).toHaveProperty("$$typeof"); // React Portal symbol
      expect(portal).toHaveProperty("containerInfo", _htmlElement);
      expect(portal).toHaveProperty("key", "graph-blocks-list");
    });

    it("should pass correct props to BlocksList", () => {
      const layer = createLayer();
      const _htmlElement = getHTMLElement(layer);

      const renderBlock = jest.fn();
      const portal = layer.renderPortal(renderBlock);

      expect(portal).toBeTruthy();
      expect(portal).toHaveProperty("containerInfo", _htmlElement);
      expect(portal).toHaveProperty("key", "graph-blocks-list");
      // Check that children is a React element (BlocksList)
      expect(portal.children).toBeTruthy();
    });
  });

  describe("error handling", () => {
    it("should handle applyBlockListClassName when HTML element is null", () => {
      const layer = createLayer("test-class");

      // Call applyBlockListClassName before attachLayer
      expect(() => {
        layer.attachLayer(rootElement);
      }).not.toThrow();
    });

    it("should handle props changes gracefully", () => {
      const layer = createLayer("initial-class");
      const _htmlElement = getHTMLElement(layer);

      // Test multiple rapid changes
      expect(() => {
        layer.setProps({ blockListClassName: "class1" });
        layer.iterate();
        layer.setProps({ blockListClassName: "class2" });
        layer.iterate();
        layer.setProps({ blockListClassName: undefined });
        layer.iterate();
      }).not.toThrow();
    });
  });

  describe("lifecycle", () => {
    it("should apply blockListClassName when attachLayer is called", () => {
      const className = "test-class";
      const layer = createUnattachedLayer(className);

      // Before attachment - HTML element exists but blockListClassName is not applied
      // because afterInit() hasn't been called yet
      const htmlElementBefore = layer.getHTML();
      expect(htmlElementBefore).toBeTruthy();
      expect(htmlElementBefore.parentNode).toBeNull();
      expect(htmlElementBefore.classList.contains(className)).toBe(false);

      // After attachLayer - HTML element should be in DOM and have the class
      // because attachLayer calls afterInit() which applies blockListClassName
      layer.attachLayer(rootElement);
      const htmlElementAfter = layer.getHTML();
      expect(htmlElementAfter.classList.contains(className)).toBe(true);
      expect(htmlElementAfter.parentNode).toBe(rootElement);
    });

    it("should handle detach and reattach correctly", () => {
      const className = "test-class";
      const layer = createUnattachedLayer(className);

      // First attachment
      layer.attachLayer(rootElement);
      let htmlElement = layer.getHTML();
      expect(htmlElement.classList.contains(className)).toBe(true);

      // Detach
      layer.detachLayer();

      // Reattach
      const newRoot = document.createElement("div");
      document.body.appendChild(newRoot);

      layer.attachLayer(newRoot);
      htmlElement = layer.getHTML();
      expect(htmlElement.classList.contains(className)).toBe(true);

      // Cleanup
      document.body.removeChild(newRoot);
    });
  });

  describe("integration", () => {
    it("should work with React StrictMode", () => {
      // Test that the layer works correctly when React.StrictMode causes double rendering
      const layer = createLayer("test-class");
      const htmlElement = getHTMLElement(layer);

      // Simulate double initialization that might happen in StrictMode
      layer.attachLayer(rootElement);
      layer.attachLayer(rootElement);

      expect(htmlElement.classList.contains("test-class")).toBe(true);
      // Should not have duplicate classes
      const testClassCount = Array.from(htmlElement.classList).filter((cls) => cls === "test-class").length;
      expect(testClassCount).toBe(1);
    });

    it("should handle camera transformations", () => {
      const layer = createLayer("test-class");
      const htmlElement = getHTMLElement(layer);

      // Check that camera transformation class is applied
      expect(htmlElement.classList.contains("layer-with-camera")).toBe(true);
    });
  });
});
