import { createUikitGraph, disposeUikitGraph, getConnectionView } from "../test-utils/graphFixture";

import { UikitConnection } from "./UikitConnection";

describe("UikitConnection", () => {
  it("is used for connections and reads hover colors from the kit palette", () => {
    const fixture = createUikitGraph();
    const view = getConnectionView(fixture.graph, "a:b");

    expect(view).toBeInstanceOf(UikitConnection);
    expect(view.getStrokeColor({ ...view.state, hovered: true })).toBe("rgba(0, 0, 0, 0.3)");

    disposeUikitGraph(fixture);
  });
});
