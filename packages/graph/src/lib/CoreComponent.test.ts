import { Component } from "./Component";
import { ChildDescriptor, CoreComponent } from "./CoreComponent";
import { globalScheduler } from "./Scheduler";

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
  // Flush deferred removals before counting the scheduler registry.
  globalScheduler.performUpdate();
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

describe("root scheduler lifecycle", () => {
  it("releases the root scheduler on unmount and does not rebuild the subtree", () => {
    const baseline = countRegistrations();
    const root = Component.mount(RenderingRoot);
    root.descriptors = [Child.create({ label: "child" }, { key: "child" })];
    root.refresh();
    globalScheduler.performUpdate();
    expect(root.childCount()).toBe(1);
    expect(countRegistrations()).toBe(baseline + 1);

    CoreComponent.unmount(root);
    root.rendered.mockClear();
    root.refresh();
    globalScheduler.performUpdate();

    expect(root.childCount()).toBe(0);
    expect(root.rendered).not.toHaveBeenCalled();
    expect(countRegistrations()).toBe(baseline);
  });

  it("keeps the shared scheduler running when a child unmounts", () => {
    const baseline = countRegistrations();
    const root = Component.mount(RenderingRoot);
    root.descriptors = [Child.create({ label: "child" }, { key: "child" })];
    root.refresh();
    globalScheduler.performUpdate();

    root.descriptors = [];
    root.refresh();
    globalScheduler.performUpdate();
    expect(root.childCount()).toBe(0);

    root.rendered.mockClear();
    root.refresh();
    globalScheduler.performUpdate();
    expect(root.rendered).toHaveBeenCalledTimes(1);
    expect(countRegistrations()).toBe(baseline + 1);
    CoreComponent.unmount(root);
    expect(countRegistrations()).toBe(baseline);
  });
});
