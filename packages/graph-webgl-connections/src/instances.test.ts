import { straightCubic } from "./geometry";
import { ConnectionInstances, TConnectionDraw } from "./instances";
import {
  FLAG_ARROW,
  FLAG_HIDDEN,
  FLAG_OVERLAY,
  INSTANCE_FLOATS,
  createArrowTemplate,
  createCurveTemplate,
} from "./shaders";

const line = (x1: number, y1: number, x2: number, y2: number) => straightCubic({ x: x1, y: y1 }, { x: x2, y: y2 });

const draw = (patch: Partial<TConnectionDraw> = {}): TConnectionDraw => ({
  segments: [line(0, 0, 100, 0)],
  style: 0,
  hidden: false,
  focus: false,
  overlay: false,
  arrow: true,
  ...patch,
});

const flagsOf = (instances: ConnectionInstances, index: number) => instances.data[index * INSTANCE_FLOATS + 9];

describe("ConnectionInstances", () => {
  it("packs one instance per segment and indexes visible segments", () => {
    const instances = new ConnectionInstances();
    instances.rebuild([
      ["a", draw()],
      ["b", draw({ segments: [line(0, 100, 50, 100), line(50, 100, 50, 200)] })],
      ["c", draw({ hidden: true })],
    ]);

    expect(instances.count).toBe(4);
    expect(flagsOf(instances, 0)).toBe(FLAG_ARROW);
    // multipoint connections have no arrow; the second segment continues the dash pattern
    expect(flagsOf(instances, 1)).toBe(0);
    expect(instances.data[2 * INSTANCE_FLOATS + 10]).toBeCloseTo(50);
    expect(flagsOf(instances, 3)).toBe(FLAG_HIDDEN + FLAG_ARROW);

    expect(instances.search(40, 150, 60, 160).map((entry) => entry.id)).toEqual(["b"]);
    expect(instances.search(0, -10, 10, 10).map((entry) => entry.id)).toEqual(["a"]);
    expect(instances.getBounds()).toEqual([0, 0, 100, 200]);
    expect(instances.takeDirtyRange()).toEqual([0, 4]);
    expect(instances.takeDirtyRange()).toBeUndefined();
  });

  it("updates a connection in place and re-indexes it", () => {
    const instances = new ConnectionInstances();
    instances.rebuild([
      ["a", draw()],
      ["b", draw({ segments: [line(0, 100, 100, 100)] })],
    ]);
    instances.takeDirtyRange();

    expect(instances.update("b", draw({ segments: [line(500, 500, 600, 500)] }))).toBe(true);
    expect(instances.takeDirtyRange()).toEqual([1, 2]);
    expect(instances.search(0, 90, 100, 110)).toEqual([]);
    expect(instances.search(550, 490, 560, 510).map((entry) => entry.id)).toEqual(["b"]);
    expect(instances.getBounds()).toEqual([0, 0, 600, 500]);
  });

  it("asks for a rebuild when the segment count changes", () => {
    const instances = new ConnectionInstances();
    instances.rebuild([["a", draw()]]);
    expect(instances.update("a", draw({ segments: [line(0, 0, 1, 1), line(1, 1, 2, 2)] }))).toBe(false);
    expect(instances.update("missing", draw())).toBe(false);
  });

  it("copies overlay connections into the overlay buffer only when it changes", () => {
    const instances = new ConnectionInstances();
    instances.rebuild([
      ["a", draw()],
      ["b", draw({ segments: [line(0, 100, 100, 100)] })],
    ]);
    expect(instances.takeOverlay()).toEqual({ data: expect.any(Float32Array), count: 0 });
    expect(instances.takeOverlay()).toBeUndefined();

    instances.update("b", draw({ segments: [line(0, 100, 100, 100)], overlay: true, focus: true }));
    const overlay = instances.takeOverlay();
    expect(overlay?.count).toBe(1);
    expect(overlay?.data[1]).toBe(100);
    expect(overlay?.data[9]).toBe(FLAG_OVERLAY + 2 + FLAG_ARROW);
    expect(instances.isOverlay("b")).toBe(true);
    expect(instances.isFocused(1)).toBe(true);
    expect(instances.isFocused(0)).toBe(false);
  });
});

describe("templates", () => {
  it("joins both curve parts into one strip with degenerate vertices", () => {
    const template = createCurveTemplate(4);
    // (segments + 1) * 2 vertices per part, two parts, two degenerate vertices, 3 floats each
    expect(template.length).toBe(((4 + 1) * 2 * 2 + 2) * 3);
    expect(Array.from(template.slice(30, 36))).toEqual([1, 1, 0, 0, -1, 1]);
  });

  it("builds two arrow arms", () => {
    expect(createArrowTemplate().length).toBe((4 * 2 + 2) * 3);
  });
});
