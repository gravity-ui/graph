import { effect } from "@preact/signals-core";

import { PortState } from "../Port";

/** Reads a value so the surrounding effect tracks it. */
function track(value: unknown): unknown {
  return value;
}

describe("PortState.setPoint", () => {
  it("keeps the state and the point when the point does not change", () => {
    const port = new PortState({ id: "port", x: 10, y: 20 });
    const state = port.$state.value;
    const point = port.$point.value;
    let runs = 0;
    const dispose = effect(() => {
      track(port.$point.value);
      track(port.$state.value);
      runs++;
    });

    port.setPoint(10, 20);

    expect(port.$state.value).toBe(state);
    expect(port.$point.value).toBe(point);
    expect(runs).toBe(1);
    dispose();
  });

  it("writes a moved point", () => {
    const port = new PortState({ id: "port", x: 10, y: 20 });
    const seen: Array<{ x: number; y: number }> = [];
    const dispose = effect(() => {
      seen.push(port.$point.value);
    });

    port.setPoint(10, 21);
    port.setPoint(11, 21);

    expect(seen.map(({ x, y }) => [x, y])).toEqual([
      [10, 20],
      [10, 21],
      [11, 21],
    ]);
    expect(port.$state.value).toMatchObject({ id: "port", x: 11, y: 21 });
    dispose();
  });

  it("tells 0 from -0 and writes NaN again, as before", () => {
    const port = new PortState({ id: "port", x: 0, y: Number.NaN });
    const state = port.$state.value;

    port.setPoint(-0, Number.NaN);

    expect(port.$state.value).not.toBe(state);
    expect(Object.is(port.$state.value.x, -0)).toBe(true);
  });

  it("saves the point while delegated, also when it equals its own", () => {
    const port = new PortState({ id: "port", x: 10, y: 20 });
    const target = new PortState({ id: "target", x: 100, y: 200 });
    port.delegate(target);
    port.setPoint(30, 40);
    port.setPoint(10, 20);
    port.undelegate();

    expect(port.getPoint()).toEqual({ x: 10, y: 20 });
  });
});
