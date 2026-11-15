import { runLevelMethods, warnIfInLevelMethod } from "./purity";

describe("level method purity", () => {
  it("warns once per class and input, only inside level methods", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfInLevelMethod("the camera");
    runLevelMethods("Owner", () => {
      warnIfInLevelMethod("the camera");
      warnIfInLevelMethod("the camera");
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("Owner: a level method read the camera");
    warn.mockRestore();
  });

  it("returns the result and leaves the section after a throw", () => {
    expect(runLevelMethods("A", () => 3)).toBe(3);
    expect(() =>
      runLevelMethods("B", () => {
        throw new Error("x");
      })
    ).toThrow("x");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    warnIfInLevelMethod("the camera");
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
