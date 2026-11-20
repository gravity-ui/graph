import { anchorEntityId, parseAnchorEntityId } from "../anchorEntityId";

describe("anchorEntityId", () => {
  it("is the JSON array of the block id and the anchor id", () => {
    expect(anchorEntityId("block-1", "out")).toBe('["block-1","out"]');
    expect(anchorEntityId(7, "out")).toBe('[7,"out"]');
  });

  it("names the block, so equal anchor ids of two blocks differ", () => {
    expect(anchorEntityId("a", "out")).not.toBe(anchorEntityId("b", "out"));
    // A number block id and its string are different blocks, as in the blocks map.
    expect(anchorEntityId(1, "out")).not.toBe(anchorEntityId("1", "out"));
  });

  it("round-trips numeric and string ids, including separators, quotes and control characters", () => {
    const pairs: [string | number, string | number][] = [
      [0, "out"],
      ["0", "out"],
      ["a", 0],
      ["a", "0"],
      ["a/b", "c"],
      ["a", "b/c"],
      ["a\u0000b", "c"],
      ["a", "b\u0000c"],
      ['a","b', "c"],
      ["a", '","c'],
      ["a\\", "b"],
      ["a", "\\b"],
    ];
    const ids = pairs.map(([blockId, anchorId]) => anchorEntityId(blockId, anchorId));
    expect(new Set(ids).size).toBe(pairs.length);
    pairs.forEach(([blockId, anchorId], index) => {
      expect(parseAnchorEntityId(ids[index])).toEqual({ blockId, anchorId });
    });
  });

  it("reads nothing from an id it did not build", () => {
    expect(parseAnchorEntityId("out")).toBeUndefined();
    expect(parseAnchorEntityId(5)).toBeUndefined();
    expect(parseAnchorEntityId("[")).toBeUndefined();
    expect(parseAnchorEntityId('["a"]')).toBeUndefined();
    expect(parseAnchorEntityId('["a","b","c"]')).toBeUndefined();
    expect(parseAnchorEntityId('["a",true]')).toBeUndefined();
    expect(parseAnchorEntityId('["a",null]')).toBeUndefined();
    expect(parseAnchorEntityId('[null,"b"]')).toBeUndefined();
    expect(parseAnchorEntityId('{"0":"a","1":"b"}')).toBeUndefined();
  });
});
