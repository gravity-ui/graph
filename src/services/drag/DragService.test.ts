import { signal } from "@preact/signals-core";

import type { GraphComponent } from "../../components/canvas/GraphComponent";
import type { Graph } from "../../graph";

import { DragService } from "./DragService";
import { DragContext, DragDiff } from "./types";

// Mock component interface for testing (simulates GraphComponent without inheritance)
interface MockComponent {
  isDraggable: () => boolean;
  handleDragStart: (context: DragContext) => void;
  handleDrag: (diff: DragDiff, context: DragContext) => void;
  handleDragEnd: (context: DragContext) => void;
  constructor: { name: string };
}

// Factory for creating mock draggable components
function createMockDraggableComponent(name = "MockDraggableComponent"): MockComponent & {
  dragStartCalls: DragContext[];
  dragCalls: Array<{ diff: DragDiff; context: DragContext }>;
  dragEndCalls: DragContext[];
  setIsDraggable: (value: boolean) => void;
} {
  let _isDraggable = true;
  const component = {
    dragStartCalls: [] as DragContext[],
    dragCalls: [] as Array<{ diff: DragDiff; context: DragContext }>,
    dragEndCalls: [] as DragContext[],
    constructor: { name },
    isDraggable: () => _isDraggable,
    setIsDraggable: (value: boolean) => {
      _isDraggable = value;
    },
    handleDragStart: (context: DragContext) => {
      component.dragStartCalls.push(context);
    },
    handleDrag: (diff: DragDiff, context: DragContext) => {
      component.dragCalls.push({ diff, context });
    },
    handleDragEnd: (context: DragContext) => {
      component.dragEndCalls.push(context);
    },
  };
  return component;
}

// Factory for creating mock non-draggable components
function createMockNonDraggableComponent(): MockComponent {
  return {
    constructor: { name: "MockNonDraggableComponent" },
    isDraggable: () => false,
    handleDragStart: () => {},
    handleDrag: () => {},
    handleDragEnd: () => {},
  };
}

// Create minimal mock Graph
function createMockGraph() {
  const mousedownHandlers: Array<(event: unknown) => void> = [];
  const cameraChangeHandlers: Array<(event?: unknown) => void> = [];

  const mockCanvas = document.createElement("canvas");
  mockCanvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  const mockGraph = {
    on: jest.fn((eventName: string, handler: (event: unknown) => void, _options?: unknown) => {
      if (eventName === "mousedown") {
        mousedownHandlers.push(handler);
      } else if (eventName === "camera-change") {
        cameraChangeHandlers.push(handler);
      }
      return () => {
        if (eventName === "mousedown") {
          const idx = mousedownHandlers.indexOf(handler);
          if (idx >= 0) mousedownHandlers.splice(idx, 1);
        } else if (eventName === "camera-change") {
          const idx = cameraChangeHandlers.indexOf(handler);
          if (idx >= 0) cameraChangeHandlers.splice(idx, 1);
        }
      };
    }),
    off: jest.fn((eventName: string, handler: (event?: unknown) => void) => {
      if (eventName === "camera-change") {
        const idx = cameraChangeHandlers.indexOf(handler);
        if (idx >= 0) cameraChangeHandlers.splice(idx, 1);
      }
    }),
    getGraphCanvas: jest.fn(() => mockCanvas),
    cameraService: {
      enableAutoPanning: jest.fn(),
      disableAutoPanning: jest.fn(),
      applyToPoint: jest.fn((x: number, y: number) => [x, y] as [number, number]),
    },
    selectionService: {
      $selectedComponents: signal<GraphComponent[]>([]),
    },
    lockCursor: jest.fn(),
    unlockCursor: jest.fn(),
    // Helper methods for tests
    _emitMouseDown: (event: unknown) => {
      mousedownHandlers.forEach((h) => h(event));
    },
    _emitCameraChange: () => {
      cameraChangeHandlers.forEach((h) => h());
    },
    _mousedownHandlers: mousedownHandlers,
    _cameraChangeHandlers: cameraChangeHandlers,
  };

  return mockGraph;
}

// Create mock mouse event
function createMockMouseEvent(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
}

// Create mock GraphMouseEvent
function createMockGraphMouseEvent(target?: MockComponent) {
  let defaultPrevented = false;
  return {
    detail: {
      target,
    },
    preventDefault: jest.fn(() => {
      defaultPrevented = true;
    }),
    isDefaultPrevented: () => defaultPrevented,
  };
}

describe("DragService", () => {
  let service: DragService;
  let mockGraph: ReturnType<typeof createMockGraph>;

  beforeEach(() => {
    mockGraph = createMockGraph();
    service = new DragService(mockGraph as unknown as Graph);
  });

  afterEach(() => {
    service.destroy();
  });

  describe("initialization", () => {
    it("should initialize with idle state", () => {
      const state = service.$state.value;
      expect(state.isDragging).toBe(false);
      expect(state.components).toEqual([]);
      expect(state.componentTypes.size).toBe(0);
      expect(state.isMultiple).toBe(false);
      expect(state.isHomogeneous).toBe(true);
    });

    it("should subscribe to graph mousedown event", () => {
      expect(mockGraph.on).toHaveBeenCalledWith("mousedown", expect.any(Function), { capture: true });
    });
  });

  describe("destroy", () => {
    it("should unsubscribe from mousedown event", () => {
      expect(mockGraph._mousedownHandlers.length).toBe(1);
      service.destroy();
      expect(mockGraph._mousedownHandlers.length).toBe(0);
    });

    it("should reset state to idle on destroy", () => {
      // Simulate an active drag first
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // Simulate first move to start drag
      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isDragging).toBe(true);

      service.destroy();

      expect(service.$state.value.isDragging).toBe(false);
    });
  });

  describe("mousedown handling", () => {
    it("should ignore mousedown if target is not provided", () => {
      const event = createMockGraphMouseEvent(undefined);
      mockGraph._emitMouseDown(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(service.$state.value.isDragging).toBe(false);
    });

    it("should ignore mousedown if target is not draggable", () => {
      const component = createMockNonDraggableComponent();
      const event = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(service.$state.value.isDragging).toBe(false);
    });

    it("should prevent default for draggable target", () => {
      const component = createMockDraggableComponent();
      const event = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe("drag lifecycle", () => {
    let component: ReturnType<typeof createMockDraggableComponent>;

    beforeEach(() => {
      component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];
    });

    it("should start drag on first mousemove after mousedown", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      expect(service.$state.value.isDragging).toBe(false);

      // First mousemove initiates drag
      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isDragging).toBe(true);
      expect(component.dragStartCalls.length).toBe(1);
    });

    it("should call handleDrag on subsequent mousemove", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // First move - drag start (also triggers first handleDrag with delta=0)
      const moveEvent1 = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent1);

      // dragListener emits DRAG_UPDATE on first move too (with delta 0)
      const initialCallsCount = component.dragCalls.length;

      // Second move - drag update with actual movement
      const moveEvent2 = createMockMouseEvent("mousemove", 110, 120);
      document.dispatchEvent(moveEvent2);

      expect(component.dragCalls.length).toBe(initialCallsCount + 1);
      const lastCall = component.dragCalls[component.dragCalls.length - 1];
      expect(lastCall.diff.deltaX).toBe(10);
      expect(lastCall.diff.deltaY).toBe(20);
    });

    it("should call handleDragEnd on mouseup", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // First move - drag start
      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(component.dragEndCalls.length).toBe(0);

      // Mouse up - drag end
      const upEvent = createMockMouseEvent("mouseup", 150, 150);
      document.dispatchEvent(upEvent);

      expect(component.dragEndCalls.length).toBe(1);
      expect(service.$state.value.isDragging).toBe(false);
    });

    it("should enable autopanning on drag start", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(mockGraph.cameraService.enableAutoPanning).toHaveBeenCalled();
    });

    it("should lock cursor on drag start", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(mockGraph.lockCursor).toHaveBeenCalledWith("grabbing");
    });

    it("should disable autopanning on drag end", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      const upEvent = createMockMouseEvent("mouseup", 150, 150);
      document.dispatchEvent(upEvent);

      expect(mockGraph.cameraService.disableAutoPanning).toHaveBeenCalled();
    });

    it("should unlock cursor on drag end", () => {
      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      const upEvent = createMockMouseEvent("mouseup", 150, 150);
      document.dispatchEvent(upEvent);

      expect(mockGraph.unlockCursor).toHaveBeenCalled();
    });
  });

  describe("$state signal", () => {
    it("should update componentTypes based on component constructor names", () => {
      const component = createMockDraggableComponent("CustomBlock");
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.componentTypes.has("CustomBlock")).toBe(true);
    });

    it("should set isMultiple to true when dragging multiple components", () => {
      const component1 = createMockDraggableComponent();
      const component2 = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [
        component1 as unknown as GraphComponent,
        component2 as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isMultiple).toBe(true);
      expect(service.$state.value.components.length).toBe(2);
    });

    it("should set isHomogeneous to true when all components are same type", () => {
      const component1 = createMockDraggableComponent("Block");
      const component2 = createMockDraggableComponent("Block");
      mockGraph.selectionService.$selectedComponents.value = [
        component1 as unknown as GraphComponent,
        component2 as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isHomogeneous).toBe(true);
    });

    it("should set isHomogeneous to false when components are different types", () => {
      const component1 = createMockDraggableComponent("Block");
      const component2 = createMockDraggableComponent("Group");
      mockGraph.selectionService.$selectedComponents.value = [
        component1 as unknown as GraphComponent,
        component2 as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isHomogeneous).toBe(false);
      expect(service.$state.value.componentTypes.size).toBe(2);
      expect(service.$state.value.componentTypes.has("Block")).toBe(true);
      expect(service.$state.value.componentTypes.has("Group")).toBe(true);
    });
  });

  describe("component collection", () => {
    it("should drag only target if target is not in selection", () => {
      const selectedComponent = createMockDraggableComponent();
      const targetComponent = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [selectedComponent as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(targetComponent);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.components).toEqual([targetComponent]);
      expect(targetComponent.dragStartCalls.length).toBe(1);
      expect(selectedComponent.dragStartCalls.length).toBe(0);
    });

    it("should drag all selected draggable components if target is in selection", () => {
      const component1 = createMockDraggableComponent();
      const component2 = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [
        component1 as unknown as GraphComponent,
        component2 as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.components.length).toBe(2);
      expect(component1.dragStartCalls.length).toBe(1);
      expect(component2.dragStartCalls.length).toBe(1);
    });

    it("should filter out non-draggable components from selection", () => {
      const draggable = createMockDraggableComponent();
      const nonDraggable = createMockNonDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [
        draggable as unknown as GraphComponent,
        nonDraggable as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(draggable);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.components).toEqual([draggable]);
    });
  });

  describe("diff calculation", () => {
    it("should calculate correct diffX/diffY (absolute displacement from start)", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // Start at (100, 100)
      const moveEvent1 = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent1);

      // Move to (130, 150) - diff from start should be (30, 50)
      const moveEvent2 = createMockMouseEvent("mousemove", 130, 150);
      document.dispatchEvent(moveEvent2);

      const lastDrag = component.dragCalls[component.dragCalls.length - 1];
      expect(lastDrag.diff.diffX).toBe(30);
      expect(lastDrag.diff.diffY).toBe(50);
    });

    it("should calculate correct deltaX/deltaY (incremental change)", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // Start at (100, 100) - first move also triggers DRAG_UPDATE with delta 0
      const moveEvent1 = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent1);

      const callsAfterStart = component.dragCalls.length;

      // Move to (110, 115) - delta should be (10, 15)
      const moveEvent2 = createMockMouseEvent("mousemove", 110, 115);
      document.dispatchEvent(moveEvent2);

      // Move to (125, 130) - delta should be (15, 15)
      const moveEvent3 = createMockMouseEvent("mousemove", 125, 130);
      document.dispatchEvent(moveEvent3);

      // Check the last two drag calls (after initial start)
      expect(component.dragCalls[callsAfterStart].diff.deltaX).toBe(10);
      expect(component.dragCalls[callsAfterStart].diff.deltaY).toBe(15);
      expect(component.dragCalls[callsAfterStart + 1].diff.deltaX).toBe(15);
      expect(component.dragCalls[callsAfterStart + 1].diff.deltaY).toBe(15);
    });

    it("should provide startCoords in diff", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // Start at (100, 100)
      const moveEvent1 = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent1);

      // Move to (130, 150)
      const moveEvent2 = createMockMouseEvent("mousemove", 130, 150);
      document.dispatchEvent(moveEvent2);

      const lastDrag = component.dragCalls[component.dragCalls.length - 1];
      expect(lastDrag.diff.startCoords).toEqual([100, 100]);
    });
  });

  describe("camera change handling", () => {
    it("should re-emit drag update on camera change during drag", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      const callsAfterStart = component.dragCalls.length;

      // Emit camera change - should trigger additional drag update
      mockGraph._emitCameraChange();

      expect(component.dragCalls.length).toBe(callsAfterStart + 1);
    });

    it("should not emit drag update on camera change if not dragging", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      // No mousedown, just emit camera change
      mockGraph._emitCameraChange();

      expect(component.dragCalls.length).toBe(0);
    });
  });

  describe("abort on mouseup without move", () => {
    it("should not call handleDragStart if mouseup happens before mousemove", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      // Mouse up immediately without moving
      const upEvent = createMockMouseEvent("mouseup", 100, 100);
      document.dispatchEvent(upEvent);

      expect(component.dragStartCalls.length).toBe(0);
      expect(component.dragEndCalls.length).toBe(0);
      expect(service.$state.value.isDragging).toBe(false);
    });
  });

  describe("context passed to handlers", () => {
    it("should pass all participating components in context", () => {
      const component1 = createMockDraggableComponent();
      const component2 = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [
        component1 as unknown as GraphComponent,
        component2 as unknown as GraphComponent,
      ];

      const mousedownEvent = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(component1.dragStartCalls[0].components.length).toBe(2);
      expect(component2.dragStartCalls[0].components.length).toBe(2);
    });

    it("should pass sourceEvent in context", () => {
      const component = createMockDraggableComponent();
      mockGraph.selectionService.$selectedComponents.value = [component as unknown as GraphComponent];

      const mousedownEvent = createMockGraphMouseEvent(component);
      mockGraph._emitMouseDown(mousedownEvent);

      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(component.dragStartCalls[0].sourceEvent).toBe(moveEvent);
    });
  });

  describe("concurrent drag prevention", () => {
    it("should ignore second mousedown while drag is in progress", () => {
      const component1 = createMockDraggableComponent("Component1");
      const component2 = createMockDraggableComponent("Component2");
      mockGraph.selectionService.$selectedComponents.value = [component1 as unknown as GraphComponent];

      // Start first drag
      const mousedownEvent1 = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent1);

      // First move to initiate drag
      const moveEvent1 = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent1);

      expect(service.$state.value.isDragging).toBe(true);
      expect(component1.dragStartCalls.length).toBe(1);

      // Try to start second drag while first is in progress
      mockGraph.selectionService.$selectedComponents.value = [component2 as unknown as GraphComponent];
      const mousedownEvent2 = createMockGraphMouseEvent(component2);
      mockGraph._emitMouseDown(mousedownEvent2);

      // Second component should NOT have started dragging
      expect(component2.dragStartCalls.length).toBe(0);

      // Original drag should still be tracked
      expect(service.$state.value.components).toEqual([component1]);

      // End drag - should end for component1, not component2
      const upEvent = createMockMouseEvent("mouseup", 150, 150);
      document.dispatchEvent(upEvent);

      expect(component1.dragEndCalls.length).toBe(1);
      expect(component2.dragEndCalls.length).toBe(0);
    });

    it("should ignore second mousedown while waiting for first mousemove", () => {
      const component1 = createMockDraggableComponent("Component1");
      const component2 = createMockDraggableComponent("Component2");
      mockGraph.selectionService.$selectedComponents.value = [component1 as unknown as GraphComponent];

      // Start first drag (mousedown but no mousemove yet)
      const mousedownEvent1 = createMockGraphMouseEvent(component1);
      mockGraph._emitMouseDown(mousedownEvent1);

      // Drag has not started yet (waiting for first move)
      expect(service.$state.value.isDragging).toBe(false);

      // Try to start second drag before first mousemove
      mockGraph.selectionService.$selectedComponents.value = [component2 as unknown as GraphComponent];
      const mousedownEvent2 = createMockGraphMouseEvent(component2);
      mockGraph._emitMouseDown(mousedownEvent2);

      // Now trigger first move - should still be for component1
      const moveEvent = createMockMouseEvent("mousemove", 100, 100);
      document.dispatchEvent(moveEvent);

      expect(service.$state.value.isDragging).toBe(true);
      expect(component1.dragStartCalls.length).toBe(1);
      expect(component2.dragStartCalls.length).toBe(0);

      // Cleanup
      const upEvent = createMockMouseEvent("mouseup", 100, 100);
      document.dispatchEvent(upEvent);
    });
  });
});
