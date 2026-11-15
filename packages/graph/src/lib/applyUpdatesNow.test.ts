import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import type { ChildDescriptor } from "./CoreComponent";

/**
 * `CoreComponent.applyUpdatesNow` (Task 17g): applies a component's pending update and the queued updates of its
 * retained descendants now, parents first, without flushing the rest of the tree's queue.
 */

type TLog = string[];
type TProps = { log: TLog; name: string };
type TState = { value: number };

class Retained extends Component<TProps, TState> {
  public static override readonly mode = "retained";

  constructor(props: TProps, parent: CoreComponent) {
    super(props, parent);
    this.state = { value: 0 };
  }

  public change(value: number): void {
    this.setState({ value });
  }

  protected override stateChanged(next: TState): void {
    this.props.log.push(`${this.props.name}:state:${next.value}`);
  }
}

/** Queues its own first state while it mounts, as an anchor does with its selection. */
class Child extends Retained {
  protected override willMount(): void {
    this.props.log.push(`${this.props.name}:mount`);
    this.change(1);
  }
}

/** Mounts one retained child once asked to. */
class Group extends Retained {
  private withChild = false;

  public showChild(): void {
    this.withChild = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  public child(): CoreComponent | undefined {
    return this.$.child;
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.withChild ? [Child.create({ log: this.props.log, name: "child" }, { key: "c", ref: "child" })] : [];
  }
}

/** Once started, asks for another update in every update. */
class Echo extends Retained {
  public start(): void {
    this.change(1);
  }

  protected override willIterate(): void {
    super.willIterate();
    if (this.state.value > 0) this.change(this.state.value + 1);
  }
}

/** Once armed, applies its own update now from its stateChanged(): that update is on the stack. */
class SelfApplying extends Retained {
  public armed = false;

  protected override stateChanged(next: TState): void {
    super.stateChanged(next);
    if (!this.armed) return;
    this.armed = false;
    this.performRender();
    CoreComponent.applyUpdatesNow(this);
  }
}

/** Once armed, has its parent reconcile it now from its stateChanged(): the reconcile queues it again. */
class ReconcilingChild extends Retained {
  public armed = false;

  protected override stateChanged(next: TState): void {
    super.stateChanged(next);
    if (!this.armed) return;
    this.armed = false;
    const parent = this.getParent() as Partial<{ reconcileNow(): void }> | undefined;
    parent?.reconcileNow?.();
  }
}

/** Mounts one `ReconcilingChild` and reconciles it now on request. */
class Host extends Retained {
  public child(): ReconcilingChild | undefined {
    const child = this.$.child;
    return child instanceof ReconcilingChild ? child : undefined;
  }

  public reconcileNow(): void {
    this.shouldUpdateChildren = true;
    this.performRender();
    CoreComponent.applyUpdatesNow(this);
  }

  protected override updateChildren(): ChildDescriptor[] {
    return [ReconcilingChild.create({ log: this.props.log, name: "host.child" }, { key: "c", ref: "child" })];
  }
}

/** An immediate parent of a retained child, like a legacy block of its anchors. */
class Walked extends Component<TProps> {
  private withChild = false;

  public showChild(): void {
    this.withChild = true;
    this.shouldUpdateChildren = true;
    this.performRender();
  }

  protected override updateChildren(): ChildDescriptor[] {
    return this.withChild ? [Child.create({ log: this.props.log, name: "walked.child" }, { key: "c" })] : [];
  }
}

type TSetup = {
  root: CoreComponent;
  log: TLog;
  group: Group;
  other: Retained;
  echo: Echo;
  walked: Walked;
  self: SelfApplying;
  host: Host;
};

function setup(): TSetup {
  const log: TLog = [];
  const refs: Partial<Omit<TSetup, "root" | "log">> = {};
  class Root extends Component {
    protected override updateChildren(): ChildDescriptor[] {
      return [
        Group.create({ log, name: "group" }, { key: "g", ref: (group) => (refs.group = group) }),
        Retained.create({ log, name: "other" }, { key: "o", ref: (other) => (refs.other = other) }),
        Echo.create({ log, name: "echo" }, { key: "e", ref: (echo) => (refs.echo = echo) }),
        Walked.create({ log, name: "walked" }, { key: "w", ref: (walked) => (refs.walked = walked) }),
        SelfApplying.create({ log, name: "self" }, { key: "s", ref: (self) => (refs.self = self) }),
        Host.create({ log, name: "host" }, { key: "h", ref: (host) => (refs.host = host) }),
      ];
    }
  }
  const root = CoreComponent.mount(Root);
  CoreComponent.update(root);
  // A second frame: the components that applied in the first may apply again in a flush (no per-frame deferral).
  CoreComponent.update(root);
  const { group, other, echo, walked, self, host } = refs;
  if (!group || !other || !echo || !walked || !self || !host) throw new Error("not mounted");
  log.length = 0;
  return { root, log, group, other, echo, walked, self, host };
}

/** An immediate component that logs each preparation (`willIterate`). */
class Counting extends Component<TProps> {
  protected override willIterate(): void {
    super.willIterate();
    this.props.log.push(`${this.props.name}:prepare`);
  }
}

describe("CoreComponent.applyUpdatesNow", () => {
  const roots: CoreComponent[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => CoreComponent.unmount(root));
  });

  it("applies the parent, then the children it mounts and the state they queue, and nothing else", () => {
    const { root, log, group, other } = setup();
    roots.push(root);
    other.change(5);
    group.showChild();
    CoreComponent.applyUpdatesNow(group);
    expect(log).toEqual(["child:mount", "child:state:1"]);
    expect(group.child()).toBeInstanceOf(Child);
    // The rest of the queue applies in the tree's frame, as usual.
    CoreComponent.update(root);
    expect(log).toEqual(["child:mount", "child:state:1", "other:state:5"]);
  });

  it("prepares an immediate component and applies its retained children", () => {
    const { root, log, walked } = setup();
    roots.push(root);
    walked.showChild();
    CoreComponent.applyUpdatesNow(walked);
    expect(log).toEqual(["walked.child:mount", "walked.child:state:1"]);
  });

  it("stops after its passes and leaves the rest queued", () => {
    const { root, log, echo } = setup();
    roots.push(root);
    echo.start();
    // Each pass applies one value and queues the next.
    CoreComponent.applyUpdatesNow(echo, 2);
    expect(log).toEqual(["echo:state:1", "echo:state:2"]);
    CoreComponent.update(root);
    expect(log).toEqual(["echo:state:1", "echo:state:2", "echo:state:3"]);
  });

  it("never enters again an update that is on the stack: the component stays queued for its frame", () => {
    const { root, log, self } = setup();
    roots.push(root);
    self.armed = true;
    self.change(5);
    CoreComponent.update(root);
    // Its stateChanged() ran once for the change, though it asked for its update and applied it from there.
    expect(log).toEqual(["self:state:5"]);
    CoreComponent.update(root);
    CoreComponent.update(root);
    expect(log).toEqual(["self:state:5"]);
  });

  it("leaves a descendant whose update is on the stack queued", () => {
    const { root, log, host } = setup();
    roots.push(root);
    const child = host.child();
    if (!child) throw new Error("no child");
    child.armed = true;
    child.change(7);
    CoreComponent.update(root);
    // The host reconciled it from the child's own stateChanged(): that update ran once.
    expect(log).toEqual(["host.child:state:7"]);
    CoreComponent.update(root);
    expect(log).toEqual(["host.child:state:7"]);
  });

  it("does nothing for an unmounted component", () => {
    const { root, log, group } = setup();
    CoreComponent.unmount(root);
    group.showChild();
    CoreComponent.applyUpdatesNow(group);
    expect(log).toEqual([]);
    expect(group.child()).toBeUndefined();
  });

  it("keeps the prepared flag of an immediate component this frame already prepared", () => {
    const log: TLog = [];
    const refs: { counting?: Counting } = {};
    class Root extends Component {
      protected override updateChildren(): ChildDescriptor[] {
        return [Counting.create({ log, name: "counting" }, { key: "c", ref: (c) => (refs.counting = c) })];
      }
    }
    const root = CoreComponent.mount(Root);
    roots.push(root);
    CoreComponent.update(root);
    const counting = refs.counting;
    if (!counting) throw new Error("not mounted");
    counting.performRender();
    log.length = 0;
    // The frame prepared it; something then applies its updates now (an export called from a hook of this frame).
    counting.prepareUpdate();
    CoreComponent.applyUpdatesNow(counting);
    // The frame's second request for its preparation is still answered by the first.
    counting.prepareUpdate();
    expect(log).toEqual(["counting:prepare"]);
  });
});
