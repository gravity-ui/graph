import { Graph } from "../../../graph";
import { globalScheduler } from "../../../lib/Scheduler";

import { Block, TBlock, TBlockProps } from "./Block";

const received: string[][] = [];

class RecordingBlock extends Block {
  constructor(props: TBlockProps, parent: ConstructorParameters<typeof Block>[1]) {
    super(props, parent);
    received.push(Object.keys(props).sort());
  }
}

const block: TBlock = {
  is: "Recording",
  id: "a",
  name: "a",
  selected: false,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  anchors: [],
};

describe("Blocks", () => {
  it("constructs registered block components with id, initialIndex and font only", () => {
    const root = document.createElement("div");
    Object.defineProperty(root, "clientWidth", { value: 1000 });
    Object.defineProperty(root, "clientHeight", { value: 800 });
    document.body.appendChild(root);
    const graph = new Graph({ blocks: [block], settings: { blockComponents: { Recording: RecordingBlock } } }, root);
    graph.start();
    for (let i = 0; i < 5; i += 1) globalScheduler.performUpdate();

    expect(received).toEqual([["font", "id", "initialIndex"]]);
    graph.unmount();
    root.remove();
  });
});
