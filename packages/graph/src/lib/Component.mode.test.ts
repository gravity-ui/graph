import { BlockConnection } from "../components/canvas/connections/BlockConnection";

import { Component } from "./Component";
import { CoreComponent } from "./CoreComponent";

class Retained extends Component {
  public static override readonly mode = "retained";
}

describe("static mode", () => {
  it("is immediate by default and retained for connections", () => {
    expect(CoreComponent.mode).toBe("immediate");
    expect(BlockConnection.mode).toBe("retained");
  });

  it("rejects a retained root", () => {
    expect(() => new Retained({})).toThrow(/Retained is retained: mount it as a child/);
  });
});
