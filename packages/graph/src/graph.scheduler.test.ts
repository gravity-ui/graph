import { Graph } from "./graph";
import { globalScheduler } from "./lib/Scheduler";

// A separate file gets its own module registry, so no graph from another test retains the loop.
describe("Graphs sharing the frame loop", () => {
  it("keeps a started graph rendering when another graph stops or unmounts", () => {
    const first = new Graph({}, document.createElement("div"));
    const second = new Graph({}, document.createElement("div"));
    first.start();
    second.start();

    first.stop();
    expect(globalScheduler.isRunning()).toBe(true);
    first.unmount();
    expect(globalScheduler.isRunning()).toBe(true);

    second.unmount();
    expect(globalScheduler.isRunning()).toBe(false);
  });

  it("does not register layers of a graph that was never attached", () => {
    const before = globalScheduler.getSchedulers().flat().length;
    const graph = new Graph({});
    expect(globalScheduler.getSchedulers().flat()).toHaveLength(before);
    graph.unmount();
  });
});
