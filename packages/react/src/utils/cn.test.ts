import { cn } from "./cn";

describe("cn utility function", () => {
  describe("string class names", () => {
    it("should handle single string class", () => {
      expect(cn("class1")).toBe("class1");
    });

    it("should handle multiple string classes", () => {
      expect(cn("class1", "class2", "class3")).toBe("class1 class2 class3");
    });

    it("should handle empty string", () => {
      expect(cn("")).toBe("");
    });
  });

  describe("conditional class names (objects)", () => {
    it("should include classes with truthy values", () => {
      expect(cn({ class1: true, class2: true })).toBe("class1 class2");
    });

    it("should exclude classes with falsy values", () => {
      expect(cn({ class1: true, class2: false, class3: true })).toBe("class1 class3");
    });

    it("should handle empty object", () => {
      expect(cn({})).toBe("");
    });

    it("should handle object with all falsy values", () => {
      expect(cn({ class1: false, class2: false })).toBe("");
    });

    it("should handle various falsy values", () => {
      expect(
        cn({
          class1: false,
          class2: 0,
          class3: "",
          class4: null,
          class5: undefined,
          class6: true,
        })
      ).toBe("class6");
    });
  });

  describe("undefined values", () => {
    it("should skip undefined values", () => {
      expect(cn("class1", undefined, "class2")).toBe("class1 class2");
    });

    it("should handle only undefined values", () => {
      expect(cn(undefined, undefined)).toBe("");
    });
  });

  describe("mixed types", () => {
    it("should handle combination of strings and objects", () => {
      expect(cn("base", { active: true, disabled: false }, "extra")).toBe("base active extra");
    });

    it("should handle combination with undefined", () => {
      expect(cn("base", undefined, { active: true }, undefined, "extra")).toBe("base active extra");
    });

    it("should handle complex mixed scenario", () => {
      expect(
        cn(
          "btn",
          {
            "btn-primary": true,
            "btn-large": false,
            "btn-active": true,
          },
          undefined,
          "custom-class",
          { "another-class": true }
        )
      ).toBe("btn btn-primary btn-active custom-class another-class");
    });
  });

  describe("edge cases", () => {
    it("should handle no arguments", () => {
      expect(cn()).toBe("");
    });

    it("should handle whitespace in class names", () => {
      expect(cn("  class1  ", "  class2  ")).toBe("  class1     class2  ");
    });

    it("should handle special characters in class names", () => {
      expect(cn("class-name", "class_name", "class.name", "class:name")).toBe(
        "class-name class_name class.name class:name"
      );
    });

    it("should handle numeric class names in objects", () => {
      expect(cn({ "123": true, "456": false, "789": true })).toBe("123 789");
    });
  });

  describe("performance and type safety", () => {
    it("should return string type", () => {
      const result = cn("test");
      expect(typeof result).toBe("string");
    });

    it("should handle large number of classes", () => {
      const classes = Array.from({ length: 100 }, (_, i) => `class${i}`);
      const result = cn(...classes);
      expect(result).toContain("class0");
      expect(result).toContain("class99");
      expect(result.split(" ").length).toBe(100);
    });

    it("should handle large object with many properties", () => {
      const classObj = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`class${i}`, i % 2 === 0]));
      const result = cn(classObj);
      const resultClasses = result.split(" ").filter(Boolean);
      expect(resultClasses.length).toBe(25); // Only even indices should be included
    });
  });
});
