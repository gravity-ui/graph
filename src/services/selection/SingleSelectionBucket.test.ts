import { SingleSelectionBucket } from "./SingleSelectionBucket";
import { ESelectionStrategy } from "./types";

describe("SingleSelectionBucket", () => {
  let bucket: SingleSelectionBucket<string>;
  let lastPayload: any = null;
  beforeEach(() => {
    lastPayload = null;
    bucket = new SingleSelectionBucket<string>("block", (payload, defaultAction) => {
      lastPayload = payload;
      defaultAction();
      return true;
    });
  });

  it("selects only one entity (REPLACE)", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toEqual(new Set(["a"]));
    expect(lastPayload).toEqual({
      list: ["a"],
      changes: { add: ["a"], removed: [] },
    });
    bucket.updateSelection(["b"], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toEqual(new Set(["b"]));
    expect(lastPayload).toEqual({
      list: ["b"],
      changes: { add: ["b"], removed: ["a"] },
    });
  });

  it("re-selecting the same entity does nothing", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    const prev = bucket.$selected.value;
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toBe(prev); // ссылка не меняется
  });

  it("toggle acts as REPLACE for single selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["b"], true, ESelectionStrategy.TOGGLE);
    expect(lastPayload).toEqual({
      list: ["b"],
      changes: { add: ["b"], removed: ["a"] },
    });
  });

  it("APPEND acts as REPLACE for single selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["b"], true, ESelectionStrategy.APPEND);
    expect(lastPayload).toEqual({
      list: ["b"],
      changes: { add: ["b"], removed: ["a"] },
    });
  });

  it("SUBTRACT removes selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["a"], false, ESelectionStrategy.SUBTRACT);
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toEqual({
      list: [],
      changes: { add: [], removed: ["a"] },
    });
  });

  it("reset clears selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.reset();
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toEqual({
      list: [],
      changes: { add: [], removed: ["a"] },
    });
  });

  it("isSelected returns correct state", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(bucket.isSelected("a")).toBe(true);
    expect(bucket.isSelected("b")).toBe(false);
  });

  it("ignores extra ids in single selection", () => {
    bucket.updateSelection(["a", "b", "c"], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value).toEqual(new Set(["a"]));
    expect(lastPayload).toEqual({
      list: ["a"],
      changes: { add: ["a"], removed: [] },
    });
  });

  it("does nothing if ids is empty", () => {
    bucket.updateSelection([], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  it("SUBTRACT does nothing if id is not selected", () => {
    bucket.updateSelection(["a"], false, ESelectionStrategy.SUBTRACT);
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  it("select=false with APPEND/REPLACE/TOGGLE clears selection if id is selected", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["a"], false, ESelectionStrategy.APPEND);
    expect(bucket.$selected.value.size).toBe(0);
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["a"], false, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value.size).toBe(0);
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection(["a"], false, ESelectionStrategy.TOGGLE);
    expect(bucket.$selected.value.size).toBe(0);
  });

  it("does not update selection if onSelectionChange returns false", () => {
    const bucket2 = new SingleSelectionBucket<string>("block", () => false);
    bucket2.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    expect(bucket2.$selected.value.size).toBe(0);
  });

  it("treats '1' and 1 as different ids", () => {
    bucket.updateSelection(["1"], true, ESelectionStrategy.REPLACE);
    // @ts-expect-error: for test purposes
    bucket.updateSelection([1], true, ESelectionStrategy.REPLACE);
    // В single selection всегда только последний id
    expect(bucket.$selected.value).toEqual(new Set([1]));
  });

  it("reset does nothing if selection is already empty", () => {
    bucket.reset();
    expect(bucket.$selected.value.size).toBe(0);
    expect(lastPayload).toBeNull();
  });

  it("REPLACE with empty ids clears selection", () => {
    bucket.updateSelection(["a"], true, ESelectionStrategy.REPLACE);
    bucket.updateSelection([], true, ESelectionStrategy.REPLACE);
    expect(bucket.$selected.value.size).toBe(0);
  });
});
