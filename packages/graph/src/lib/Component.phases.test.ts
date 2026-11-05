import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { Tree } from "./Tree";

// Sets the decision the tree would put on the node right before iterating it.
function iterateAs(component: Component, prepared: boolean, visible: boolean): boolean {
  const node = (component as unknown as { __comp: { treeNode: Tree } }).__comp.treeNode;
  node.framePrepared = prepared;
  node.frameVisible = visible;
  return component.iterate();
}

class Probe extends Component<{ value: number }, { value: number }> {
  public events: string[] = [];

  constructor() {
    super({ value: 0 });
    this.state = { value: 0 };
  }

  public change(value: number) {
    this.setState({ value });
  }

  protected willMount() {
    this.events.push("mount");
  }

  protected updateChildren() {
    this.events.push("children");
    return [];
  }

  protected willRender() {
    this.events.push("willRender");
  }

  protected render() {
    this.events.push(`render:${this.state.value}`);
  }

  protected didRender() {
    this.events.push("didRender");
  }

  protected didIterate() {
    this.events.push("complete");
  }
}

test("mounts and commits state outside the viewport without running render hooks", () => {
  const probe = new Probe();
  probe.change(1);
  iterateAs(probe, false, false);
  expect(probe.state.value).toBe(1);
  expect(probe.events).toEqual(["mount", "children", "complete"]);

  probe.change(2);
  iterateAs(probe, false, false);
  expect(probe.state.value).toBe(2);
  expect(probe.events).toEqual(["mount", "children", "complete", "complete"]);

  iterateAs(probe, false, true);
  expect(probe.events.slice(-4)).toEqual(["willRender", "render:2", "didRender", "complete"]);
  CoreComponent.unmount(probe);
});

test("prepares children and data before painting", () => {
  const probe = new Probe();
  probe.change(4);
  expect(probe.prepareUpdate()).toBe(true);
  expect(probe.state.value).toBe(4);
  expect(probe.events).toEqual(["mount", "children"]);

  iterateAs(probe, true, true);
  expect(probe.events).toEqual(["mount", "children", "willRender", "render:4", "didRender", "complete"]);
  CoreComponent.unmount(probe);
});

test("does not repeat an update that is prepared again before painting", () => {
  const probe = new Probe();
  probe.change(4);
  probe.prepareUpdate();
  probe.prepareUpdate();
  expect(probe.events).toEqual(["mount", "children"]);

  // An iteration without the tree's preparation reuses the explicit one.
  iterateAs(probe, false, true);
  expect(probe.events).toEqual(["mount", "children", "willRender", "render:4", "didRender", "complete"]);

  // Painting consumed it: the next preparation runs again.
  probe.change(5);
  probe.prepareUpdate();
  expect(probe.state.value).toBe(5);
  expect(probe.events.filter((event) => event === "mount")).toHaveLength(1);
  CoreComponent.unmount(probe);
});

test("mounts once when a component is prepared explicitly before the tree prepares it", () => {
  class Child extends Component<{ value: number }> {
    public mounts = 0;
    public painted: number[] = [];
    protected willMount() {
      this.mounts++;
    }
    protected render() {
      this.painted.push(this.props.value);
    }
  }
  class Parent extends Component {
    public child?: Child;
    constructor() {
      super({});
      this.setChildrenCulling({ tileSize: 64, getViewport: () => undefined });
    }
    protected updateChildren() {
      return [
        Child.create(
          { value: 1 },
          {
            ref: (child) => {
              this.child = child;
            },
          }
        ),
      ];
    }
  }
  const parent = CoreComponent.mount(Parent);
  // Reconciling creates the child; preparing it explicitly mounts it before the first frame.
  parent.prepareUpdate();
  const child = parent.child;
  if (!child) throw new Error("Missing mounted child");
  child.prepareUpdate();
  expect(child.mounts).toBe(1);

  CoreComponent.update(parent);
  expect(child.mounts).toBe(1);
  expect(child.painted).toEqual([1]);

  child.setProps({ value: 2 });
  CoreComponent.update(parent);
  expect(child.painted).toEqual([1, 2]);
  expect(child.mounts).toBe(1);
  CoreComponent.unmount(parent);
});

describe.each([
  ["with culling", true],
  ["without culling", false],
])("data changed after an explicit preparation, %s", (_label, culled) => {
  class Item extends Component<{ value: number }, { value: number }> {
    public painted: string[] = [];
    public mounts = 0;
    constructor(props: { value: number }, parent: CoreComponent) {
      super(props, parent);
      this.state = { value: 0 };
    }
    public change(value: number): void {
      this.setState({ value });
    }
    protected willMount(): void {
      this.mounts++;
    }
    protected render(): void {
      this.painted.push(`${this.props.value}/${this.state.value}`);
    }
  }
  function mount(): { root: Component; item: Item } {
    let item: Item | undefined;
    class Root extends Component {
      constructor() {
        super({});
        if (culled) this.setChildrenCulling({ tileSize: 64, getViewport: () => undefined });
      }
      protected updateChildren() {
        return [
          Item.create(
            { value: 1 },
            {
              ref: (child) => {
                item = child;
              },
            }
          ),
        ];
      }
    }
    const root = CoreComponent.mount(Root);
    // The scheduled path: a frame runs only when something requested it.
    CoreComponent.update(root);
    if (!item) throw new Error("Missing mounted item");
    return { root, item };
  }

  it("applies props set between the preparation and the next frame, and later props too", () => {
    const { root, item } = mount();
    item.prepareUpdate();
    item.setProps({ value: 2 });
    CoreComponent.update(root);
    expect(item.props.value).toBe(2);
    item.setProps({ value: 3 });
    CoreComponent.update(root);
    expect(item.props.value).toBe(3);
    expect(item.painted.slice(-2)).toEqual(["2/0", "3/0"]);
    expect(item.mounts).toBe(1);
    CoreComponent.unmount(root);
  });

  it("applies state set between the preparation and the next frame, and later state too", () => {
    const { root, item } = mount();
    item.prepareUpdate();
    item.change(7);
    CoreComponent.update(root);
    expect(item.state.value).toBe(7);
    item.change(8);
    CoreComponent.update(root);
    expect(item.state.value).toBe(8);
    expect(item.painted.slice(-2)).toEqual(["1/7", "1/8"]);
    expect(item.mounts).toBe(1);
    CoreComponent.unmount(root);
  });

  it("mounts once when new data arrives between an explicit preparation and the first frame", () => {
    let item: Item | undefined;
    class Root extends Component {
      constructor() {
        super({});
        if (culled) this.setChildrenCulling({ tileSize: 64, getViewport: () => undefined });
      }
      protected updateChildren() {
        return [
          Item.create(
            { value: 1 },
            {
              ref: (child) => {
                item = child;
              },
            }
          ),
        ];
      }
    }
    const root = CoreComponent.mount(Root);
    root.prepareUpdate();
    if (!item) throw new Error("Missing mounted item");
    item.prepareUpdate();
    item.change(5);
    CoreComponent.update(root);
    expect(item.mounts).toBe(1);
    expect(item.state.value).toBe(5);
    CoreComponent.unmount(root);
  });
});

test("does not repeat an explicit preparation when iterated directly", () => {
  const probe = new Probe();
  probe.change(1);
  probe.prepareUpdate();
  probe.iterate();
  expect(probe.state.value).toBe(1);
  expect(probe.events.filter((event) => event === "children")).toHaveLength(1);

  probe.change(2);
  probe.iterate();
  expect(probe.state.value).toBe(2);
  expect(probe.events.filter((event) => event === "complete")).toHaveLength(2);
  CoreComponent.unmount(probe);
});

test("applies a children veto set while painting from the next frame, then consumes later props", () => {
  class Child extends Component<{ value: number }> {
    public painted: number[] = [];
    public mounts = 0;
    public completions = 0;
    protected willMount() {
      this.mounts++;
    }
    protected didIterate() {
      this.completions++;
    }
    protected render() {
      this.painted.push(this.props.value);
    }
  }
  class Parent extends Component {
    public child?: Child;
    private suppressInPaint = true;
    constructor() {
      super({});
      this.setChildrenCulling({ tileSize: 64, getViewport: () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }) });
    }
    protected updateChildren() {
      return [
        Child.create(
          { value: 0 },
          {
            ref: (child) => {
              this.child = child;
            },
          }
        ),
      ];
    }
    protected render() {
      if (this.suppressInPaint) this.shouldRenderChildren = false;
    }
    public resume() {
      this.suppressInPaint = false;
      this.shouldRenderChildren = true;
      this.performRender();
    }
  }
  const parent = CoreComponent.mount(Parent);
  CoreComponent.update(parent);
  const child = parent.child;
  if (!child) throw new Error("Missing mounted child");
  // The veto is set while painting: this frame still paints the child.
  expect(child.painted).toEqual([0]);
  CoreComponent.update(parent);
  // The next frame prepares the parent again, and its preparation keeps the veto.
  expect(child.painted).toEqual([0]);
  expect(child.isIterated()).toBe(false);
  child.setProps({ value: 1 });
  parent.resume();
  CoreComponent.update(parent);
  expect(child.props.value).toBe(1);
  expect(child.isIterated()).toBe(true);
  expect(child.painted).toEqual([0, 1]);
  expect(child.mounts).toBe(1);
  CoreComponent.unmount(parent);
});

describe("children veto and frame requests in a culled tree", () => {
  class Item extends Component {
    public painted = 0;
    protected render() {
      this.painted++;
    }
  }
  const viewport = () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  const mountRoot = <T extends Component & { item?: Item }>(Root: new () => T) => {
    const root = CoreComponent.mount(Root);
    CoreComponent.update(root);
    return root;
  };
  const requestFrame = (root: Component): void =>
    (
      root as unknown as { __comp: { context: { scheduler: { scheduleUpdate(): void } } } }
    ).__comp.context.scheduler.scheduleUpdate();
  const item = (owner: { item?: Item }) =>
    Item.create(
      {},
      {
        ref: (child) => {
          owner.item = child;
        },
      }
    );

  it("does not request frames when a prepareUpdate() override suppresses children", () => {
    class Root extends Component {
      public item?: Item;
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: viewport });
      }
      public override prepareUpdate(): boolean {
        return super.prepareUpdate() && false;
      }
      protected updateChildren() {
        return [item(this)];
      }
    }
    const root = mountRoot(Root);
    const render = jest.spyOn(root as unknown as { performRender(): void }, "performRender");
    for (let i = 0; i < 10; i++) {
      requestFrame(root);
      CoreComponent.update(root);
    }
    expect(render).toHaveBeenCalledTimes(0);
    expect(root.item?.painted).toBe(0);
    CoreComponent.unmount(root);
  });

  it("requests at most one frame when preparation and painting disagree every frame", () => {
    class Root extends Component {
      public item?: Item;
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: viewport });
      }
      protected willIterate() {
        super.willIterate();
        this.shouldRenderChildren = true;
      }
      protected render() {
        this.shouldRenderChildren = false;
      }
      protected updateChildren() {
        return [item(this)];
      }
    }
    const root = mountRoot(Root);
    const render = jest.spyOn(root as unknown as { performRender(): void }, "performRender");
    for (let i = 0; i < 10; i++) {
      requestFrame(root);
      CoreComponent.update(root);
    }
    expect(render.mock.calls.length).toBeLessThanOrEqual(1);
    CoreComponent.unmount(root);
  });

  it("applies a veto that a non-owner sets while painting on the frame it requests, and resumes", () => {
    // Only the owner is prepared on every walk: a gate below it reaches its preparation through its own request.
    class Gate extends Component {
      public item?: Item;
      public suppress = false;
      protected render() {
        this.shouldRenderChildren = !this.suppress;
      }
      protected updateChildren() {
        return [item(this)];
      }
    }
    class Root extends Component {
      public gate?: Gate;
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: viewport });
      }
      protected updateChildren() {
        return [
          Gate.create(
            {},
            {
              ref: (gate) => {
                this.gate = gate;
              },
            }
          ),
        ];
      }
    }
    const root = mountRoot(Root);
    const gate = root.gate;
    const child = gate?.item;
    if (!gate || !child) throw new Error("Missing mounted components");
    const painted = child.painted;
    const render = jest.spyOn(gate as unknown as { performRender(): void }, "performRender");

    gate.suppress = true;
    requestFrame(root);
    CoreComponent.update(root);
    // The veto is set while painting: this frame still paints the item, and the gate requests one frame.
    expect(child.painted).toBe(painted + 1);
    expect(render).toHaveBeenCalledTimes(1);
    CoreComponent.update(root);
    // The requested frame prepares the gate, and its preparation applies the veto.
    expect(child.painted).toBe(painted + 1);
    expect(child.isIterated()).toBe(false);
    requestFrame(root);
    CoreComponent.update(root);
    expect(child.painted).toBe(painted + 1);
    expect(render).toHaveBeenCalledTimes(1);

    gate.suppress = false;
    gate.performRender();
    CoreComponent.update(root);
    // Resuming takes two frames: the requested frame prepares the gate first, and its preparation still returns the
    // veto set while painting; painting the gate lifts it and requests the frame that walks the item again.
    expect(child.painted).toBe(painted + 1);
    expect(render).toHaveBeenCalledTimes(3);
    CoreComponent.update(root);
    expect(child.painted).toBe(painted + 2);
    expect(child.isIterated()).toBe(true);
    CoreComponent.unmount(root);
  });

  it("requests one frame when painting changes shouldRenderChildren, and applies it there", () => {
    class Root extends Component {
      public item?: Item;
      public suppress = false;
      constructor() {
        super({});
        this.setChildrenCulling({ tileSize: 64, getViewport: viewport });
      }
      protected render() {
        if (this.suppress) this.shouldRenderChildren = false;
      }
      protected updateChildren() {
        return [item(this)];
      }
    }
    const root = mountRoot(Root);
    const painted = root.item?.painted ?? 0;
    root.suppress = true;
    const render = jest.spyOn(root as unknown as { performRender(): void }, "performRender");
    requestFrame(root);
    CoreComponent.update(root);
    expect(root.item?.painted).toBe(painted + 1);
    CoreComponent.update(root);
    expect(root.item?.painted).toBe(painted + 1);
    expect(render).toHaveBeenCalledTimes(1);
    CoreComponent.unmount(root);
  });
});
