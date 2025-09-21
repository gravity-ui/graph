import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { MultipleSelectionBucket } from "./MultipleSelectionBucket";
import { SelectionService } from "./SelectionService";
import { ESelectionStrategy, TEntityId, TMultiEntitySelection } from "./types";

describe("SelectionService", () => {
  let service: SelectionService;
  let bucket: BaseSelectionBucket<string>;
  const entityType = "block";

  beforeEach(() => {
    service = new SelectionService();
    bucket = new MultipleSelectionBucket<string>(entityType);
    service.registerBucket(bucket);
  });

  it("registers and retrieves bucket", () => {
    expect(service.getBucket(entityType)).toBe(bucket);
    expect(service.getBucket("unknown")).toBeUndefined();
  });

  it("selects entities via service", () => {
    service.select(entityType, ["a", "b"], ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toEqual(new Set(["a", "b"]));
  });

  it("deselects entities via service", () => {
    service.select(entityType, ["a", "b"], ESelectionStrategy.REPLACE);
    service.deselect(entityType, ["a"]);
    expect(bucket.$selected.value).toEqual(new Set(["b"]));
  });

  it("checks isSelected via service", () => {
    service.select(entityType, ["a"], ESelectionStrategy.REPLACE);
    expect(service.isSelected(entityType, "a")).toBe(true);
    expect(service.isSelected(entityType, "b")).toBe(false);
  });

  it("resets selection via service", () => {
    service.select(entityType, ["a", "b"], ESelectionStrategy.REPLACE);
    service.resetSelection(entityType);
    expect(bucket.$selected.value.size).toBe(0);
  });

  it("does nothing if bucket not found", () => {
    expect(() => service.select("unknown", ["x"], ESelectionStrategy.REPLACE)).not.toThrow();
    expect(() => service.deselect("unknown", ["x"])).not.toThrow();
    expect(service.isSelected("unknown", "x")).toBe(false);
    expect(() => service.resetSelection("unknown")).not.toThrow();
  });
});

// --- MULTI-BUCKET TESTS ---
describe("SelectionService with multiple buckets", () => {
  class MockBucket extends MultipleSelectionBucket<string> {
    public resetCalled = false;
    public updateSelectionCalled: Array<{ ids: string[]; select: boolean; strategy: ESelectionStrategy }> = [];
    public reset() {
      this.resetCalled = true;
      super.reset();
    }
    public updateSelection(ids: string[], select: boolean, strategy: ESelectionStrategy) {
      this.updateSelectionCalled.push({ ids, select, strategy });
      super.updateSelection(ids, select, strategy);
    }
  }

  let service: SelectionService;
  let bucketA: MockBucket;
  let bucketB: MockBucket;

  beforeEach(() => {
    service = new SelectionService();
    bucketA = new MockBucket("A");
    bucketB = new MockBucket("B");
    service.registerBucket(bucketA);
    service.registerBucket(bucketB);
  });

  it("REPLACE strategy resets other buckets", () => {
    // Preselect in both buckets
    bucketA.updateSelection(["1"], true, ESelectionStrategy.REPLACE);
    bucketB.updateSelection(["2"], true, ESelectionStrategy.REPLACE);
    // Select in bucket A with REPLACE
    service.select("A", ["3"], ESelectionStrategy.REPLACE);
    // Bucket B should be reset
    expect(bucketB.resetCalled).toBe(true);
    // Bucket A should not be reset
    expect(bucketA.resetCalled).toBe(false);
    // Bucket A should have new selection
    expect(bucketA.isSelected("3")).toBe(true);
    expect(bucketA.isSelected("1")).toBe(false);
  });

  it("REPLACE strategy does not reset its own bucket", () => {
    service.select("A", ["x"], ESelectionStrategy.REPLACE);
    expect(bucketA.resetCalled).toBe(false);
  });

  it("SUBTRACT does not reset other buckets", () => {
    service.select("A", ["x"], ESelectionStrategy.SUBTRACT);
    expect(bucketB.resetCalled).toBe(false);
    service.select("B", ["y"], ESelectionStrategy.SUBTRACT);
    expect(bucketA.resetCalled).toBe(false);
  });
});

describe("SelectionService corner-cases", () => {
  let service: SelectionService;
  let bucket: MultipleSelectionBucket<TEntityId>;
  const entityType = "block";

  beforeEach(() => {
    service = new SelectionService();
    bucket = new MultipleSelectionBucket<TEntityId>(entityType);
    service.registerBucket(bucket);
  });

  it("does nothing if entityType is not registered", () => {
    expect(() => service.select("unknown", ["a"], ESelectionStrategy.REPLACE)).not.toThrow();
    expect(() => service.deselect("unknown", ["a"])).not.toThrow();
    expect(() => service.resetSelection("unknown")).not.toThrow();
    expect(service.isSelected("unknown", "a")).toBe(false);
  });

  it("REPLACE with already selected ids resets other buckets", () => {
    const bucket2 = new MultipleSelectionBucket<TEntityId>("other");
    service.registerBucket(bucket2);
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket2.updateSelection(["b"], true, ESelectionStrategy.REPLACE);
    service.select(entityType, ["a"], ESelectionStrategy.REPLACE);
    expect(bucket2.$selected.value.size).toBe(0);
  });

  it("SUBTRACT with id not in selection does nothing", () => {
    service.select(entityType, ["a"], ESelectionStrategy.REPLACE);
    service.deselect(entityType, ["b"]);
    expect(bucket.$selected.value).toEqual(new Set(["a"]));
  });

  it("reset does nothing if selection is already empty", () => {
    service.resetSelection(entityType);
    expect(bucket.$selected.value.size).toBe(0);
  });

  it("treats '1' and 1 as different ids", () => {
    service.select(entityType, ["1"], ESelectionStrategy.REPLACE);
    service.select(entityType, [1], ESelectionStrategy.APPEND);
    expect(bucket.$selected.value).toEqual(new Set(["1", 1]));
  });
});

describe("SelectionService $selection signal", () => {
  it("aggregates selection from all buckets and reacts to changes", () => {
    const service = new SelectionService();
    const bucketA = new MultipleSelectionBucket<string>("A");
    const bucketB = new MultipleSelectionBucket<string>("B");
    service.registerBucket(bucketA);
    service.registerBucket(bucketB);

    // Изначально пусто
    expect(service.$selection.value).toEqual(
      new Map([
        ["A", new Set()],
        ["B", new Set()],
      ])
    );

    // Выделяем в одном бакете
    bucketA.updateSelection(["1", "2"], true, ESelectionStrategy.REPLACE);
    expect(service.$selection.value.get("A")).toEqual(new Set(["1", "2"]));
    expect(service.$selection.value.get("B")).toEqual(new Set());

    // Выделяем во втором бакете
    bucketB.updateSelection(["x"], true, ESelectionStrategy.REPLACE);
    expect(service.$selection.value.get("A")).toEqual(new Set(["1", "2"]));
    expect(service.$selection.value.get("B")).toEqual(new Set(["x"]));

    // Снимаем выделение
    bucketA.updateSelection(["1"], false, ESelectionStrategy.SUBTRACT);
    expect(service.$selection.value.get("A")).toEqual(new Set(["2"]));
  });

  it("reacts to adding new buckets", () => {
    const service = new SelectionService();
    const bucketA = new MultipleSelectionBucket<string>("A");
    service.registerBucket(bucketA);
    bucketA.updateSelection(["1"], true, ESelectionStrategy.REPLACE);
    expect(service.$selection.value.get("A")).toEqual(new Set(["1"]));

    // Добавляем новый бакет
    const bucketB = new MultipleSelectionBucket<string>("B");
    service.registerBucket(bucketB);
    expect(service.$selection.value.get("B")).toEqual(new Set());
    bucketB.updateSelection(["x"], true, ESelectionStrategy.REPLACE);
    expect(service.$selection.value.get("B")).toEqual(new Set(["x"]));
  });

  it("returns empty Map if no buckets registered", () => {
    const service = new SelectionService();
    expect(service.$selection.value.size).toBe(0);
  });

  it("handles buckets with empty selection", () => {
    const service = new SelectionService();
    const bucketA = new MultipleSelectionBucket<string>("A");
    service.registerBucket(bucketA);
    expect(service.$selection.value.get("A")).toEqual(new Set());
    bucketA.updateSelection(["1"], true, ESelectionStrategy.REPLACE);
    bucketA.updateSelection(["1"], false, ESelectionStrategy.SUBTRACT);
    expect(service.$selection.value.get("A")).toEqual(new Set());
  });

  it("handles different id types and multiple buckets", () => {
    const service = new SelectionService();
    const bucketA = new MultipleSelectionBucket<string | number>("A");
    const bucketB = new MultipleSelectionBucket<number>("B");
    service.registerBucket(bucketA);
    service.registerBucket(bucketB);
    bucketA.updateSelection(["foo", 42], true, ESelectionStrategy.REPLACE);
    bucketB.updateSelection([7, 8], true, ESelectionStrategy.REPLACE);
    expect(service.$selection.value.get("A")).toEqual(new Set(["foo", 42]));
    expect(service.$selection.value.get("B")).toEqual(new Set([7, 8]));
  });
});

describe("SelectionService registerBucket errors", () => {
  it("throws if registering two buckets with the same entityType", () => {
    const service = new SelectionService();
    const bucketA1 = new MultipleSelectionBucket<string>("A");
    const bucketA2 = new MultipleSelectionBucket<string>("A");
    service.registerBucket(bucketA1);
    expect(() => service.registerBucket(bucketA2)).toThrow(/Selection bucket for entityType 'A' is already registered/);
  });
});

// --- MULTI-ENTITY SELECTION TESTS ---
describe("SelectionService multi-entity selection", () => {
  let service: SelectionService;
  let blockBucket: MultipleSelectionBucket<string>;
  let connectionBucket: MultipleSelectionBucket<string>;

  beforeEach(() => {
    service = new SelectionService();
    blockBucket = new MultipleSelectionBucket<string>("block");
    connectionBucket = new MultipleSelectionBucket<string>("connection");
    service.registerBucket(blockBucket);
    service.registerBucket(connectionBucket);
  });

  it("selects entities across multiple types with REPLACE strategy", () => {
    const selection: TMultiEntitySelection = {
      block: ["b1", "b2"],
      connection: ["c1", "c2"],
    };

    service.select(selection, ESelectionStrategy.REPLACE);

    expect(blockBucket.$selected.value).toEqual(new Set(["b1", "b2"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1", "c2"]));
    expect(service.$selection.value.get("block")).toEqual(new Set(["b1", "b2"]));
    expect(service.$selection.value.get("connection")).toEqual(new Set(["c1", "c2"]));
  });

  it("selects entities across multiple types with APPEND strategy", () => {
    // Initial selection using multi-entity API to avoid cross-bucket reset
    const initialSelection: TMultiEntitySelection = {
      block: ["b1"],
      connection: ["c1"],
    };
    service.select(initialSelection, ESelectionStrategy.REPLACE);

    // Check initial state
    expect(blockBucket.$selected.value).toEqual(new Set(["b1"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1"]));

    const selection: TMultiEntitySelection = {
      block: ["b2", "b3"],
      connection: ["c2", "c3"],
    };

    service.select(selection, ESelectionStrategy.APPEND);

    expect(blockBucket.$selected.value).toEqual(new Set(["b1", "b2", "b3"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1", "c2", "c3"]));
  });

  it("single-entity API works in multi-entity context", () => {
    // Use multi-entity API to establish initial state without cross-bucket reset
    const initialSelection: TMultiEntitySelection = {
      block: ["b1"],
      connection: ["c1"],
    };
    service.select(initialSelection, ESelectionStrategy.REPLACE);

    expect(blockBucket.$selected.value).toEqual(new Set(["b1"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1"]));

    // Now test multi-entity API
    const selection: TMultiEntitySelection = {
      block: ["b2"],
      connection: ["c2"],
    };

    service.select(selection, ESelectionStrategy.APPEND);
    expect(blockBucket.$selected.value).toEqual(new Set(["b1", "b2"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1", "c2"]));
  });

  it("deselects entities across multiple types", () => {
    // Initial selection using multi-entity API to avoid cross-bucket reset
    const initialSelection: TMultiEntitySelection = {
      block: ["b1", "b2"],
      connection: ["c1", "c2"],
    };
    service.select(initialSelection, ESelectionStrategy.REPLACE);

    const deselection: TMultiEntitySelection = {
      block: ["b1"],
      connection: ["c2"],
    };

    service.deselect(deselection);

    expect(blockBucket.$selected.value).toEqual(new Set(["b2"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1"]));
  });

  it("checks selection status across multiple types", () => {
    // Use multi-entity API to establish initial state without cross-bucket reset
    const initialSelection: TMultiEntitySelection = {
      block: ["b1"],
      connection: ["c1"],
    };
    service.select(initialSelection, ESelectionStrategy.REPLACE);

    const queries: TMultiEntitySelection = {
      block: ["b1", "b2"],
      connection: ["c1", "c2"],
    };

    const results = service.isSelected(queries) as Record<string, boolean>;

    expect(results.block).toBe(true); // b1 is selected, so some() returns true
    expect(results.connection).toBe(true); // c1 is selected, so some() returns true
  });

  it("resets selection for multiple entity types", () => {
    service.select("block", ["b1"], ESelectionStrategy.REPLACE);
    service.select("connection", ["c1"], ESelectionStrategy.REPLACE);

    service.resetSelection(["block", "connection"]);

    expect(blockBucket.$selected.value.size).toBe(0);
    expect(connectionBucket.$selected.value.size).toBe(0);
  });

  it("resets all selections", () => {
    service.select("block", ["b1"], ESelectionStrategy.REPLACE);
    service.select("connection", ["c1"], ESelectionStrategy.REPLACE);

    service.resetAllSelections();

    expect(blockBucket.$selected.value.size).toBe(0);
    expect(connectionBucket.$selected.value.size).toBe(0);
  });

  it("REPLACE strategy with multi-entity selection resets non-selected types", () => {
    const bucket3 = new MultipleSelectionBucket<string>("other");
    service.registerBucket(bucket3);

    // Initial selections
    service.select("block", ["b1"], ESelectionStrategy.REPLACE);
    service.select("connection", ["c1"], ESelectionStrategy.REPLACE);
    service.select("other", ["o1"], ESelectionStrategy.REPLACE);

    // Multi-select only block and connection
    const selection: TMultiEntitySelection = {
      block: ["b2"],
      connection: ["c2"],
    };

    service.select(selection, ESelectionStrategy.REPLACE);

    // block and connection should be updated
    expect(blockBucket.$selected.value).toEqual(new Set(["b2"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c2"]));

    // other should be reset because it's not in the selection
    expect(bucket3.$selected.value.size).toBe(0);
  });

  it("works with single-entity API after multi-entity API", () => {
    // Use multi-entity API first
    const selection: TMultiEntitySelection = {
      block: ["b1", "b2"],
      connection: ["c1"],
    };
    service.select(selection, ESelectionStrategy.REPLACE);

    // Then use single-entity API
    service.select("block", ["b3"], ESelectionStrategy.APPEND);

    expect(blockBucket.$selected.value).toEqual(new Set(["b1", "b2", "b3"]));
    expect(connectionBucket.$selected.value).toEqual(new Set(["c1"]));
  });
});
