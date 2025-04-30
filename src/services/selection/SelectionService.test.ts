import { BaseSelectionBucket } from "./BaseSelectionBucket";
import { MultipleSelectionBucket } from "./MultipleSelectionBucket";
import { SelectionService } from "./SelectionService";
import { ESelectionStrategy } from "./types";

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
  let bucket: MultipleSelectionBucket<any>;
  const entityType = "block";

  beforeEach(() => {
    service = new SelectionService();
    bucket = new MultipleSelectionBucket<any>(entityType);
    service.registerBucket(bucket);
  });

  it("does nothing if entityType is not registered", () => {
    expect(() => service.select("unknown", ["a"], ESelectionStrategy.REPLACE)).not.toThrow();
    expect(() => service.deselect("unknown", ["a"])).not.toThrow();
    expect(() => service.resetSelection("unknown")).not.toThrow();
    expect(service.isSelected("unknown", "a")).toBe(false);
  });

  it("REPLACE with already selected ids resets other buckets", () => {
    const bucket2 = new MultipleSelectionBucket<any>("other");
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
