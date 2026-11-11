import { SceneClock } from "./SceneClock";

describe("SceneClock", () => {
  let t = 0;
  const source = (): number => t;

  beforeEach(() => {
    t = 1000;
  });

  it("starts paused and advances only while running", () => {
    const clock = new SceneClock(source);
    t += 500;
    expect(clock.now()).toBe(0);
    clock.resume();
    t += 250;
    expect(clock.now()).toBeCloseTo(0.25);
    clock.pause();
    t += 1000;
    expect(clock.now()).toBeCloseTo(0.25);
    clock.resume();
    t += 250;
    expect(clock.now()).toBeCloseTo(0.5);
  });

  it("pauses while the document is hidden, independently of the graph pause", () => {
    const clock = new SceneClock(source);
    clock.resume();
    let hidden = false;
    const doc = document;
    Object.defineProperty(doc, "hidden", { configurable: true, get: () => hidden });
    const stop = clock.followVisibility(doc);
    hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    t += 1000;
    expect(clock.now()).toBe(0);
    clock.pause(); // graph stops while hidden
    hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    t += 1000;
    expect(clock.now()).toBe(0); // still paused by the graph
    clock.resume();
    t += 100;
    expect(clock.now()).toBeCloseTo(0.1);
    stop();
  });
});
