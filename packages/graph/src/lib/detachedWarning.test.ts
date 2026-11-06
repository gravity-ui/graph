import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";
import { warnDetachedFrameHooks } from "./detachedWarning";

class Detached extends Component {
  public static override readonly detached = true;
}

class Painting extends Detached {
  protected override render(): void {
    // draws every frame
  }

  protected override didIterate(): void {
    // per-frame bookkeeping
  }
}

class Quiet extends Detached {
  protected override willIterate(): void {
    super.willIterate();
  }
}

function mountWith(Child: typeof Detached): CoreComponent {
  class Parent extends Component {
    protected override updateChildren() {
      return [Child.create({})];
    }
  }
  const root = CoreComponent.mount(Parent);
  CoreComponent.update(root);
  return root;
}

describe("warnDetachedFrameHooks", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it("warns once per class about per-frame hooks", () => {
    warnDetachedFrameHooks(Painting);
    warnDetachedFrameHooks(Painting);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Painting is detached");
    expect(warn.mock.calls[0][0]).toContain("render, didIterate");
    expect(warn.mock.calls[0][0]).toContain("static detached = false");
  });

  it("ignores update hooks and the bases above the class that declared it detached", () => {
    // Component and EventedComponent-like bases define per-frame hooks above `Detached`.
    warnDetachedFrameHooks(Quiet);
    expect(warn).not.toHaveBeenCalled();
  });

  it("runs when a detached component is constructed", () => {
    class Late extends Detached {
      protected override willRender(): void {
        // per-frame work
      }
    }
    const root = mountWith(Late);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Late is detached"));
    CoreComponent.unmount(root);
  });

  it("is skipped in production builds", () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      class Shipped extends Detached {
        protected override render(): void {
          // draws every frame
        }
      }
      const root = mountWith(Shipped);
      expect(warn).not.toHaveBeenCalled();
      CoreComponent.unmount(root);
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it("neither throws nor warns where `process` does not exist", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "process");
    class Bundled extends Detached {
      protected override render(): void {
        // draws every frame
      }
    }
    Object.defineProperty(globalThis, "process", { value: undefined, configurable: true, writable: true });
    try {
      // `process.env` now throws a TypeError, like the ReferenceError of an environment without `process`.
      expect(() => process.env).toThrow();
      let root: CoreComponent | undefined;
      expect(() => {
        root = mountWith(Bundled);
      }).not.toThrow();
      expect(warn).not.toHaveBeenCalled();
      if (root) CoreComponent.unmount(root);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "process", descriptor);
    }
  });
});
