import { Graph } from "../../../graph";
import { Component } from "../../../lib";

import { PortState, TPortId } from "./Port";
import { PortsStore } from "./PortList";

// Mock component for testing
class MockComponent extends Component {
  constructor() {
    super({}, null);
  }
}

// Simple mock that implements the interface needed by PortsStore
class MockGraphComponent {
  public id: string;

  constructor(id = Math.random().toString()) {
    this.id = id;
  }
}

describe("PortsStore", () => {
  let graph: Graph;
  let store: PortsStore;
  let mockComponent: MockComponent;

  beforeEach(() => {
    graph = new Graph({});
    store = new PortsStore(graph.rootStore, graph);
    mockComponent = new MockComponent();
  });

  describe("Port Creation", () => {
    it("should create a new port", () => {
      const portId: TPortId = "test-port-1";
      const port = store.createPort(portId, mockComponent);

      expect(port).toBeInstanceOf(PortState);
      expect(port.id).toBe(portId);
      expect(port.owner).toBe(mockComponent);
      expect(port.x).toBe(0);
      expect(port.y).toBe(0);
      expect(port.lookup).toBe(false);
    });

    it("should create port without component", () => {
      const portId: TPortId = "test-port-2";
      const port = store.createPort(portId, undefined);

      expect(port.id).toBe(portId);
      expect(port.owner).toBeUndefined();
      expect(port.lookup).toBe(true);
    });
  });

  describe("Port Retrieval", () => {
    it("should get existing port", () => {
      const portId: TPortId = "test-port-4";
      const retrievedPort = store.getOrCreatePort(portId);
      const createdPort = store.createPort(portId, mockComponent);

      expect(retrievedPort).toBe(createdPort);
    });

    it("should return undefined for non-existing port", () => {
      const port = store.getPort("non-existing-port");
      expect(port).toBeUndefined();
    });
  });

  describe("Port Updates", () => {
    it("should update port coordinates through port instance", () => {
      const portId: TPortId = "test-port-8";
      const port = store.createPort(portId, mockComponent);

      // Update coordinates through the port instance (how it's actually done by owners)
      port.setPoint(100, 200);

      expect(port.x).toBe(100);
      expect(port.y).toBe(200);
    });
  });

  describe("Port Deletion", () => {
    it("should delete existing port", () => {
      const portId: TPortId = "test-port-9";
      store.createPort(portId, mockComponent);

      const deleted = store.deletePort(portId);

      expect(deleted).toBe(true);
      expect(store.getPort(portId)).toBeUndefined();
    });
  });

  describe("Port Lifecycle - Main Test Cases", () => {
    it("should handle complete port lifecycle with all key phases", () => {
      const portId: TPortId = "main-lifecycle-port";
      const owner = new MockComponent();
      const observer1 = new MockGraphComponent();
      const observer2 = new MockGraphComponent();

      // === PHASE 1: Creating lookup port ===
      // Initially port doesn't exist
      expect(store.getPort(portId)).toBeUndefined();
      expect(store.$ports.value.length).toBe(0);

      // Create lookup port (without owner)
      const port = store.getOrCreatePort(portId);
      expect(port.id).toBe(portId);
      expect(port.owner).toBeUndefined();
      expect(port.lookup).toBe(true);
      expect(port.x).toBe(0);
      expect(port.y).toBe(0);
      expect(port.observers.size).toBe(0);
      expect(store.getPort(portId)).toBe(port);
      expect(store.$ports.value.length).toBe(1);

      // === PHASE 2: Adding observers ===
      port.addObserver(observer1);
      expect(port.observers.size).toBe(1);
      expect(port.observers.has(observer1)).toBe(true);
      expect(port.canBeDeleted()).toBe(false); // Has observers

      port.addObserver(observer2);
      expect(port.observers.size).toBe(2);
      expect(port.observers.has(observer2)).toBe(true);

      // === PHASE 3: Setting owner (own) ===
      port.setOwner(owner);
      expect(port.owner).toBe(owner);
      expect(port.lookup).toBe(false);
      expect(port.canBeDeleted()).toBe(false); // Has both owner and observers

      // === PHASE 4: Updating position ===
      // Owner updates port position (this is how it's actually done in real code)
      port.setPoint(150, 250);
      expect(port.x).toBe(150);
      expect(port.y).toBe(250);

      // Port should still be in the same state
      expect(port.owner).toBe(owner);
      expect(port.observers.size).toBe(2);
      expect(store.getPort(portId)).toBe(port);

      // === PHASE 5: Removing owner ===
      port.removeOwner();
      expect(port.owner).toBeUndefined();
      expect(port.lookup).toBe(true);
      expect(port.canBeDeleted()).toBe(false); // Still has observers

      // === PHASE 6: Removing observers ===
      // Remove first observer
      port.removeObserver(observer1);
      expect(port.observers.size).toBe(1);
      expect(port.observers.has(observer1)).toBe(false);
      expect(port.observers.has(observer2)).toBe(true);
      expect(port.canBeDeleted()).toBe(false); // Still has one observer

      // Remove second observer
      port.removeObserver(observer2);
      expect(port.observers.size).toBe(0);
      expect(port.canBeDeleted()).toBe(true); // No owner, no observers

      // === PHASE 7: Port deletion from store ===
      // Port should be completely deletable now
      expect(store.getPort(portId)).toBe(port); // Still exists in store

      // Manually trigger cleanup (simulating what ConnectionsList.checkAndDeletePort does)
      if (port.canBeDeleted()) {
        store.deletePort(portId);
      }

      // Port should be completely removed from store
      expect(store.getPort(portId)).toBeUndefined();
      expect(store.$ports.value.length).toBe(0);
      expect(store.$portsMap.value.has(portId)).toBe(false);
    });

    it("should handle basic port operations", () => {
      // Test basic CRUD operations
      const portId: TPortId = "basic-port";
      const owner = new MockComponent();

      // Create port with owner
      const port = store.createPort(portId, owner);
      expect(port.owner).toBe(owner);
      expect(store.$ports.value.length).toBe(1);

      // Update coordinates through owner (how it's actually done)
      port.setPoint(100, 200);
      expect(port.x).toBe(100);
      expect(port.y).toBe(200);

      // Delete port
      const deleted = store.deletePort(portId);
      expect(deleted).toBe(true);
      expect(store.getPort(portId)).toBeUndefined();
      expect(store.$ports.value.length).toBe(0);
    });

    it("should handle lazy creation with component assignment", () => {
      const portId: TPortId = "lazy-assignment-port";
      const component = new MockComponent();

      // First call without component - creates lookup port
      const port1 = store.getOrCreatePort(portId);
      expect(port1.owner).toBeUndefined();
      expect(port1.lookup).toBe(true);

      // Second call with component - assigns owner to existing port
      const port2 = store.getOrCreatePort(portId, component);
      expect(port1).toBe(port2); // Same instance
      expect(port2.owner).toBe(component);
      expect(port2.lookup).toBe(false);
      expect(store.$ports.value.length).toBe(1); // Still only one port
    });
  });
});
