import { Component } from "../Component";
import { ChildDescriptor, CoreComponent } from "../CoreComponent";
import { globalScheduler } from "../Scheduler";

class Child extends Component<{ label: string }> {
  public readonly removed = jest.fn();
  protected unmount() {
    this.removed();
    super.unmount();
  }
}
class AlternateChild extends Child {}
class Parent extends Component {
  public descriptors: ChildDescriptor[] = [];
  protected updateChildren() {
    return this.descriptors;
  }
  public childOrder() {
    return Array.from(this.__comp.treeNode.children, (node) => node.data);
  }
  public syncChildren() {
    this.__updateChildren();
  }
}

test("keyed children mount, reuse, reorder and remove with current props and refs", () => {
  const parent = new Parent({});
  const firstRef = jest.fn<void, [Child]>();
  parent.descriptors = [
    Child.create({ label: "first" }, { key: "first", ref: firstRef }),
    Child.create({ label: "second" }, { key: "second", ref: "second" }),
  ];
  parent.syncChildren();
  const first = firstRef.mock.calls[0][0];
  const second = parent.$.second;
  expect(first).toBeInstanceOf(Child);
  expect(second).toBeInstanceOf(Child);
  parent.descriptors = [
    Child.create({ label: "changed" }, { key: "second", ref: "second" }),
    Child.create({ label: "first" }, { key: "first", ref: firstRef }),
  ];
  parent.syncChildren();
  second?.iterate();
  expect(parent.$.second).toBe(second);
  expect(second?.props.label).toBe("changed");
  expect(firstRef).toHaveBeenCalledTimes(1);
  expect(parent.childOrder()).toEqual([second, first]);
  parent.descriptors = [];
  parent.syncChildren();
  expect(parent.$.second).toBeUndefined();
  expect(first.removed).toHaveBeenCalledTimes(1);
  CoreComponent.unmount(parent);
});

test("reusing the descriptor array does not lose children and their unmount callbacks", () => {
  const parent = new Parent({});
  const ref = jest.fn<void, [Child]>();
  parent.descriptors = [Child.create({ label: "child" }, { key: "child", ref })];
  parent.syncChildren();
  parent.syncChildren();
  const child = ref.mock.calls[0][0];
  parent.descriptors = [];
  parent.syncChildren();
  expect(child.removed).toHaveBeenCalledTimes(1);
  CoreComponent.unmount(parent);
});

test("constructor replacement removes the previous child and refreshes its string ref", () => {
  const parent = new Parent({});
  const ref = jest.fn<void, [Child]>();
  parent.descriptors = [Child.create({ label: "child" }, { key: "child", ref })];
  parent.syncChildren();
  const previous = ref.mock.calls[0][0];
  parent.descriptors = [AlternateChild.create({ label: "replacement" }, { key: "child", ref: "active" })];
  parent.syncChildren();
  expect(previous.removed).toHaveBeenCalledTimes(1);
  expect(parent.$.active).toBeInstanceOf(AlternateChild);
  CoreComponent.unmount(parent);
  expect(parent.$.active).toBeUndefined();
});

test("special keys and refs do not collide with object prototype members", () => {
  const parent = new Parent({});
  parent.setContext({ custom: "before" });
  const specialKey = "__proto__";
  parent.descriptors = [Child.create({ label: "child" }, { key: specialKey, ref: specialKey })];
  parent.syncChildren();
  const child = parent.$[specialKey];
  expect(child).toBeInstanceOf(Child);
  expect(child?.getParent()).toBe(parent);
  expect(child?.context.custom).toBe("before");
  parent.setContext({ custom: "after" });
  expect(child?.context.custom).toBe("after");
  CoreComponent.unmount(parent);
  expect(parent.$[specialKey]).toBeUndefined();
});

class NoProps extends Component {
  constructor() {
    super({});
  }
}
class DefaultProps extends Component<{ label: string }> {
  constructor(props = { label: "default" }, parent?: CoreComponent) {
    super(props, parent);
  }
}
test("zero-argument and optional-props constructors keep their defaults through factories", () => {
  const root = Component.mount(NoProps);
  expect(root.props).toEqual({});
  CoreComponent.unmount(root);
  const withDefaults = Component.mount(DefaultProps);
  expect(withDefaults.props.label).toBe("default");
  CoreComponent.unmount(withDefaults);
  const parent = new Parent({});
  parent.descriptors = [NoProps.create(), DefaultProps.create(undefined, { ref: "defaults" })];
  parent.syncChildren();
  expect(parent.$.defaults?.props.label).toBe("default");
  CoreComponent.unmount(parent);
});

function countRegistrations(): number {
  return globalScheduler.getSchedulers().reduce((total, list) => total + list.length, 0);
}

class RenderingRoot extends Parent {
  public readonly rendered = jest.fn();
  public childCount(): number {
    return this.__comp.children.size;
  }
  public refresh(): void {
    this.shouldUpdateChildren = true;
    this.performRender();
  }
  protected render(): void {
    this.rendered();
  }
}

describe("root update lifecycle", () => {
  it("registers nothing in the global scheduler; the owner drives the root", () => {
    const baseline = countRegistrations();
    const root = Component.mount(RenderingRoot);
    expect(countRegistrations()).toBe(baseline);

    root.descriptors = [Child.create({ label: "child" }, { key: "child" })];
    root.refresh();
    globalScheduler.performUpdate();
    expect(root.childCount()).toBe(0);

    Component.update(root);
    expect(root.childCount()).toBe(1);
    CoreComponent.unmount(root);
  });

  it("does not rebuild the subtree of an unmounted root", () => {
    const root = Component.mount(RenderingRoot);
    root.descriptors = [Child.create({ label: "child" }, { key: "child" })];
    root.refresh();
    Component.update(root);
    expect(root.childCount()).toBe(1);

    CoreComponent.unmount(root);
    root.rendered.mockClear();
    Component.update(root);

    expect(root.childCount()).toBe(0);
    expect(root.rendered).not.toHaveBeenCalled();
  });

  it("keeps updating the root when a child unmounts", () => {
    const root = Component.mount(RenderingRoot);
    root.descriptors = [Child.create({ label: "child" }, { key: "child" })];
    root.refresh();
    Component.update(root);

    root.descriptors = [];
    root.refresh();
    Component.update(root);
    expect(root.childCount()).toBe(0);

    root.rendered.mockClear();
    root.refresh();
    Component.update(root);
    expect(root.rendered).toHaveBeenCalledTimes(1);
    CoreComponent.unmount(root);
  });
});

describe("a child whose constructor throws", () => {
  /** The instances alive between construction and unmount(). */
  const registry = new Set<CoreComponent>();
  const log: string[] = [];

  /** Registers itself and queues its first state from its constructor, as an anchor binds its anchor state. */
  class Registered extends Component<{ label: string }, { label: string }> {
    public static override readonly mode = "retained";

    constructor(props: { label: string }, parent: CoreComponent) {
      super(props, parent);
      registry.add(this);
      this.setState({ label: props.label });
      if (props.label.startsWith("broken")) throw new Error(`${props.label} failed`);
    }

    protected willMount(): void {
      log.push(`mount:${this.props.label}`);
    }

    protected unmount(): void {
      registry.delete(this);
      log.push(`unmount:${this.props.label}`);
      super.unmount();
    }
  }

  afterEach(() => {
    registry.clear();
    log.length = 0;
  });

  it("records the children mounted before it, undoes it, and never applies it", () => {
    const root = Component.mount(RenderingRoot);
    root.descriptors = [Registered.create({ label: "first" }, { key: "first", ref: "first" })];
    root.refresh();
    Component.update(root);
    const first = root.$.first;
    root.descriptors = [
      Registered.create({ label: "first" }, { key: "first", ref: "first" }),
      Registered.create({ label: "second" }, { key: "second", ref: "second" }),
      Registered.create({ label: "broken" }, { key: "broken" }),
    ];
    expect(() => root.syncChildren()).toThrow("broken failed");
    const second = root.$.second;
    // The partly built child ran its unmount(): its constructor's registration is undone.
    expect([...registry]).toEqual([first, second]);
    expect(log).toEqual(["mount:first", "unmount:broken"]);

    // Its queued state never applies; the child mounted before it does, as a recorded child.
    Component.update(root);
    Component.update(root);
    expect(log).toEqual(["mount:first", "unmount:broken", "mount:second"]);
    expect(root.childCount()).toBe(2);

    // The same descriptor list reconciles again (it was not applied), and a list without them removes both.
    expect(() => root.syncChildren()).toThrow("broken failed");
    expect(root.$.first).toBe(first);
    expect(root.$.second).toBe(second);
    root.descriptors = [];
    root.syncChildren();
    expect(registry.size).toBe(0);
    expect(root.childCount()).toBe(0);
    expect(log.slice(-3)).toEqual(["unmount:broken", "unmount:first", "unmount:second"]);
    CoreComponent.unmount(root);
  });
});
