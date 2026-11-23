import { Component } from "../Component";
import { warnDetachedFrameHooks } from "../detachedWarning";

class Detached extends Component {
  public static override readonly mode = "retained";
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
    expect(warn.mock.calls[0][0]).toContain("Painting is retained");
    expect(warn.mock.calls[0][0]).toContain("render, didIterate");
    // A declaration that compiles under a retained base (a bare `static mode = "immediate"` is TS2417 and TS4114).
    expect(warn.mock.calls[0][0]).toContain('Declare `static override readonly mode = "immediate";` on it');
  });

  it("ignores update hooks and the bases above the class that declared it detached", () => {
    // Component and EventedComponent-like bases define per-frame hooks above `Detached`.
    warnDetachedFrameHooks(Quiet);
    expect(warn).not.toHaveBeenCalled();
  });
});
