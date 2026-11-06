import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";

class Probe extends Component<{ value: number }, { value: number }> {
  public events: string[] = [];
  public inViewport = false;

  constructor() {
    super({ value: 0 });
    this.state = { value: 0 };
  }

  public isInViewport() {
    return this.inViewport;
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
  probe.iterate();
  expect(probe.state.value).toBe(1);
  expect(probe.events).toEqual(["mount", "children", "complete"]);

  probe.change(2);
  probe.iterate();
  expect(probe.state.value).toBe(2);
  expect(probe.events).toEqual(["mount", "children", "complete", "complete"]);

  probe.inViewport = true;
  probe.iterate();
  expect(probe.events.slice(-4)).toEqual(["willRender", "render:2", "didRender", "complete"]);
  CoreComponent.unmount(probe);
});

test("prepares children and data before painting, without repeating preparation", () => {
  const probe = new Probe();
  probe.inViewport = true;
  probe.change(4);
  expect(probe.prepareUpdate()).toBe(true);
  expect(probe.state.value).toBe(4);
  expect(probe.events).toEqual(["mount", "children"]);

  probe.prepareUpdate();
  probe.iterate();
  expect(probe.events).toEqual(["mount", "children", "willRender", "render:4", "didRender", "complete"]);
  CoreComponent.unmount(probe);
});

test("reuses explicit preparation and prepares a standalone iteration only once", () => {
  const probe = new Probe();
  const prepare = jest.spyOn(probe, "prepareUpdate");
  probe.change(1);
  probe.prepareUpdate();
  probe.iterate();
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(probe.state.value).toBe(1);

  probe.change(2);
  probe.iterate();
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(probe.state.value).toBe(2);
  expect(probe.events.filter((event) => event === "complete")).toHaveLength(2);
  CoreComponent.unmount(probe);
});

test("completes prepared children when parent paint suppresses them, then consumes later props", () => {
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
  expect(child.painted).toEqual([]);
  expect(child.completions).toBe(1);
  expect(child.isIterated()).toBe(false);
  child.setProps({ value: 1 });
  parent.resume();
  CoreComponent.update(parent);
  CoreComponent.update(parent);
  expect(child.props.value).toBe(1);
  expect(child.isIterated()).toBe(true);
  expect(child.painted).toEqual([1]);
  expect(child.mounts).toBe(1);
  CoreComponent.unmount(parent);
});
