import { vectorDistance, vectorDistanceSquared } from "./vector";

describe("Vector utilities", () => {
  describe("vectorDistance", () => {
    it("should calculate distance between two points", () => {
      expect(vectorDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      expect(vectorDistance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
      expect(vectorDistance({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it("should handle negative coordinates", () => {
      expect(vectorDistance({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(5);
      expect(vectorDistance({ x: 0, y: 0 }, { x: -3, y: -4 })).toBe(5);
    });
  });

  describe("vectorDistanceSquared", () => {
    it("should calculate squared distance between two points", () => {
      expect(vectorDistanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
      expect(vectorDistanceSquared({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(25);
      expect(vectorDistanceSquared({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(0);
    });

    it("should handle negative coordinates", () => {
      expect(vectorDistanceSquared({ x: -3, y: -4 }, { x: 0, y: 0 })).toBe(25);
    });
  });
});
