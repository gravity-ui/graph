import { MultipleSelectionBucket } from "./MultipleSelectionBucket";
import { SingleSelectionBucket } from "./SingleSelectionBucket";
import { ESelectionStrategy } from "./types";

describe("Selection Resolver Integration", () => {
  describe("MultipleSelectionBucket with resolver", () => {
    type TestEntity = { id: string; name: string; value: number };

    const testEntities: TestEntity[] = [
      { id: "1", name: "Entity One", value: 100 },
      { id: "2", name: "Entity Two", value: 200 },
      { id: "3", name: "Entity Three", value: 300 },
    ];

    const resolver = (ids: string[]): TestEntity[] => {
      return ids.map((id) => testEntities.find((e) => e.id === id)).filter((e): e is TestEntity => e !== undefined);
    };

    it("should resolve selected IDs to entities", () => {
      const bucket = new MultipleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      bucket.select(["1", "2"], ESelectionStrategy.REPLACE);

      expect(bucket.$selectedEntities.value).toEqual([
        { id: "1", name: "Entity One", value: 100 },
        { id: "2", name: "Entity Two", value: 200 },
      ]);
    });

    it("should update resolved entities when selection changes", () => {
      const bucket = new MultipleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      // Initial selection
      bucket.select(["1"], ESelectionStrategy.REPLACE);
      expect(bucket.$selectedEntities.value).toEqual([{ id: "1", name: "Entity One", value: 100 }]);

      // Add to selection
      bucket.select(["2"], ESelectionStrategy.APPEND);
      expect(bucket.$selectedEntities.value).toEqual([
        { id: "1", name: "Entity One", value: 100 },
        { id: "2", name: "Entity Two", value: 200 },
      ]);

      // Remove from selection
      bucket.select(["1"], ESelectionStrategy.SUBTRACT);
      expect(bucket.$selectedEntities.value).toEqual([{ id: "2", name: "Entity Two", value: 200 }]);
    });

    it("should return empty array when no resolver is provided", () => {
      const bucket = new MultipleSelectionBucket<string, TestEntity>("test");

      bucket.select(["1", "2"], ESelectionStrategy.REPLACE);

      expect(bucket.$selectedEntities.value).toEqual([]);
      expect(Array.from(bucket.$selected.value)).toEqual(["1", "2"]);
    });

    it("should filter out non-existent IDs", () => {
      const bucket = new MultipleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      bucket.select(["1", "non-existent", "2"], ESelectionStrategy.REPLACE);

      expect(bucket.$selectedEntities.value).toEqual([
        { id: "1", name: "Entity One", value: 100 },
        { id: "2", name: "Entity Two", value: 200 },
      ]);
    });

    it("should work with reactive subscriptions", () => {
      const bucket = new MultipleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);
      const updates: TestEntity[][] = [];

      // Subscribe to changes
      const unsubscribe = bucket.$selectedEntities.subscribe((entities) => {
        updates.push([...entities]);
      });

      bucket.select(["1"], ESelectionStrategy.REPLACE);
      bucket.select(["2"], ESelectionStrategy.APPEND);
      bucket.select([], ESelectionStrategy.REPLACE);

      unsubscribe();

      // First update is the initial empty state, then 3 changes
      expect(updates).toHaveLength(4);
      expect(updates[0]).toEqual([]); // Initial state
      expect(updates[1]).toEqual([{ id: "1", name: "Entity One", value: 100 }]);
      expect(updates[2]).toEqual([
        { id: "1", name: "Entity One", value: 100 },
        { id: "2", name: "Entity Two", value: 200 },
      ]);
      expect(updates[3]).toEqual([]);
    });
  });

  describe("SingleSelectionBucket with resolver", () => {
    type TestEntity = { id: string; name: string };

    const testEntities: TestEntity[] = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ];

    const resolver = (ids: string[]): TestEntity[] => {
      return ids.map((id) => testEntities.find((e) => e.id === id)).filter((e): e is TestEntity => e !== undefined);
    };

    it("should resolve single selected ID to entity", () => {
      const bucket = new SingleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      bucket.select(["a"], ESelectionStrategy.REPLACE);

      expect(bucket.$selectedEntities.value).toEqual([{ id: "a", name: "Alpha" }]);
    });

    it("should replace selection when selecting new item", () => {
      const bucket = new SingleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      bucket.select(["a"], ESelectionStrategy.REPLACE);
      expect(bucket.$selectedEntities.value).toEqual([{ id: "a", name: "Alpha" }]);

      bucket.select(["b"], ESelectionStrategy.REPLACE);
      expect(bucket.$selectedEntities.value).toEqual([{ id: "b", name: "Beta" }]);
    });

    it("should return empty array when selection is cleared", () => {
      const bucket = new SingleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      bucket.select(["a"], ESelectionStrategy.REPLACE);
      expect(bucket.$selectedEntities.value).toEqual([{ id: "a", name: "Alpha" }]);

      bucket.reset();
      expect(bucket.$selectedEntities.value).toEqual([]);
    });

    it("should ignore multiple IDs in single selection", () => {
      const bucket = new SingleSelectionBucket<string, TestEntity>("test", undefined, undefined, resolver);

      // Single selection only takes first ID
      bucket.select(["a", "b", "c"], ESelectionStrategy.REPLACE);

      expect(bucket.$selectedEntities.value).toEqual([{ id: "a", name: "Alpha" }]);
    });
  });

  describe("Type safety", () => {
    it("should maintain type safety with TypeScript", () => {
      type BlockData = { id: string; x: number; y: number; width: number; height: number };

      const blocks: BlockData[] = [
        { id: "block1", x: 0, y: 0, width: 100, height: 50 },
        { id: "block2", x: 150, y: 0, width: 100, height: 50 },
      ];

      const resolver = (ids: string[]): BlockData[] => {
        return ids.map((id) => blocks.find((b) => b.id === id)).filter((b): b is BlockData => b !== undefined);
      };

      const bucket = new MultipleSelectionBucket<string, BlockData>("block", undefined, undefined, resolver);

      bucket.select(["block1"], ESelectionStrategy.REPLACE);

      const selectedBlocks = bucket.$selectedEntities.value;

      // TypeScript should know the type
      expect(selectedBlocks[0].x).toBe(0);
      expect(selectedBlocks[0].width).toBe(100);
    });
  });

  describe("Component resolution", () => {
    // Mock GraphComponent-like entity
    class MockComponent {
      constructor(
        public id: string,
        public name: string
      ) {}

      public getEntityId() {
        return this.id;
      }
    }

    // Mock State with getViewComponent
    class MockState {
      constructor(
        public id: string,
        private component: MockComponent
      ) {}

      public getViewComponent() {
        return this.component;
      }
    }

    it("should resolve entities to components via getViewComponent()", () => {
      const component1 = new MockComponent("comp1", "Component 1");
      const component2 = new MockComponent("comp2", "Component 2");

      const states = [new MockState("state1", component1), new MockState("state2", component2)];

      const resolver = (ids: string[]): MockState[] => {
        return ids.map((id) => states.find((s) => s.id === id)).filter((s): s is MockState => s !== undefined);
      };

      const bucket = new MultipleSelectionBucket<string, MockState>("test", undefined, undefined, resolver);

      bucket.select(["state1", "state2"], ESelectionStrategy.REPLACE);

      const components = bucket.$selectedComponents.value;

      expect(components).toHaveLength(2);
      expect((components[0] as unknown as MockComponent).name).toBe("Component 1");
      expect((components[1] as unknown as MockComponent).name).toBe("Component 2");
    });

    it("should resolve entities that are already components", () => {
      const component1 = new MockComponent("comp1", "Component 1");
      const component2 = new MockComponent("comp2", "Component 2");

      const components = [component1, component2];

      const resolver = (ids: string[]): MockComponent[] => {
        return ids.map((id) => components.find((c) => c.id === id)).filter((c): c is MockComponent => c !== undefined);
      };

      const bucket = new MultipleSelectionBucket<string, MockComponent>("test", undefined, undefined, resolver);

      bucket.select(["comp1"], ESelectionStrategy.REPLACE);

      const resolvedComponents = bucket.$selectedComponents.value;

      expect(resolvedComponents).toHaveLength(1);
      expect((resolvedComponents[0] as unknown as MockComponent).name).toBe("Component 1");
    });

    it("should return empty array for entities without components", () => {
      type SimpleEntity = { id: string; value: number };

      const entities: SimpleEntity[] = [
        { id: "e1", value: 100 },
        { id: "e2", value: 200 },
      ];

      const resolver = (ids: string[]): SimpleEntity[] => {
        return ids.map((id) => entities.find((e) => e.id === id)).filter((e): e is SimpleEntity => e !== undefined);
      };

      const bucket = new MultipleSelectionBucket<string, SimpleEntity>("test", undefined, undefined, resolver);

      bucket.select(["e1", "e2"], ESelectionStrategy.REPLACE);

      // Entities exist
      expect(bucket.$selectedEntities.value).toHaveLength(2);
      // But no components (entities don't have getViewComponent)
      expect(bucket.$selectedComponents.value).toHaveLength(0);
    });

    it("should reactively update components when selection changes", () => {
      const component1 = new MockComponent("comp1", "Component 1");
      const component2 = new MockComponent("comp2", "Component 2");

      const states = [new MockState("state1", component1), new MockState("state2", component2)];

      const resolver = (ids: string[]): MockState[] => {
        return ids.map((id) => states.find((s) => s.id === id)).filter((s): s is MockState => s !== undefined);
      };

      const bucket = new MultipleSelectionBucket<string, MockState>("test", undefined, undefined, resolver);
      const updates: MockComponent[][] = [];

      const unsubscribe = bucket.$selectedComponents.subscribe((components) => {
        updates.push([...(components as unknown as MockComponent[])]);
      });

      bucket.select(["state1"], ESelectionStrategy.REPLACE);
      bucket.select(["state2"], ESelectionStrategy.APPEND);
      bucket.select([], ESelectionStrategy.REPLACE);

      unsubscribe();

      expect(updates).toHaveLength(4); // Initial + 3 changes
      expect(updates[0]).toHaveLength(0); // Initial empty
      expect(updates[1]).toHaveLength(1);
      expect(updates[1][0].name).toBe("Component 1");
      expect(updates[2]).toHaveLength(2);
      expect(updates[3]).toHaveLength(0); // Cleared
    });
  });
});
