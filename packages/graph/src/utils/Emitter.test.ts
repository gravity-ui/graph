import { Emitter } from "./Emitter";

type Events = { value: (text: string, index: number) => void };

test("emitter preserves arguments and skips explicitly removed listeners", () => {
  const emitter = new Emitter<Events>();
  const listener = jest.fn();
  emitter.on("value", () => emitter.off("value", listener));
  emitter.on("value", listener);
  emitter.emit("value", "first", 1);
  expect(listener).not.toHaveBeenCalled();
  emitter.off("value");
  emitter.on("value", listener);
  emitter.emit("value", "second", 2);
  expect(listener).toHaveBeenCalledWith("second", 2);
  emitter.destroy();
  emitter.emit("value", "third", 3);
  expect(listener).toHaveBeenCalledTimes(1);
});

test("once listeners are removed before a recursive emission", () => {
  const emitter = new Emitter<Events>();
  const listener = jest.fn((text: string, index: number) => {
    if (index === 1) emitter.emit("value", text, 2);
  });
  emitter.once("value", listener);
  emitter.emit("value", "first", 1);
  emitter.emit("value", "second", 3);
  expect(listener).toHaveBeenCalledTimes(1);
});
