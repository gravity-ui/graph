import { parseClassNames } from "./classNames";

describe("parseClassNames", () => {
  it("should parse multiple classes correctly", () => {
    const result = parseClassNames("class1 class2  class3");
    expect(result).toEqual(["class1", "class2", "class3"]);
  });

  it("should handle empty string", () => {
    const result = parseClassNames("");
    expect(result).toEqual([]);
  });

  it("should handle whitespace-only string", () => {
    const result = parseClassNames("   ");
    expect(result).toEqual([]);
  });

  it("should handle single class", () => {
    const result = parseClassNames("single-class");
    expect(result).toEqual(["single-class"]);
  });

  it("should handle multiple spaces between classes", () => {
    const result = parseClassNames("class1    class2     class3");
    expect(result).toEqual(["class1", "class2", "class3"]);
  });

  it("should handle leading and trailing spaces", () => {
    const result = parseClassNames("   class1 class2   ");
    expect(result).toEqual(["class1", "class2"]);
  });

  it("should handle tabs and newlines", () => {
    const result = parseClassNames("class1\tclass2\nclass3");
    expect(result).toEqual(["class1", "class2", "class3"]);
  });

  it("should handle mixed whitespace characters", () => {
    const result = parseClassNames("  class1 \t class2 \n  class3  ");
    expect(result).toEqual(["class1", "class2", "class3"]);
  });

  it("should handle classes with hyphens and underscores", () => {
    const result = parseClassNames("my-class my_class another-class_name");
    expect(result).toEqual(["my-class", "my_class", "another-class_name"]);
  });

  it("should handle BEM notation", () => {
    const result = parseClassNames("block__element block__element--modifier");
    expect(result).toEqual(["block__element", "block__element--modifier"]);
  });
});
