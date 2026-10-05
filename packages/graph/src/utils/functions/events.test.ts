import { Graph } from "../../graph";
import { KeyboardService } from "../../services/KeyboardService";

import { addEventListeners } from ".";

test("event subscriptions forward all event types and preserve unsubscribe and this", () => {
  const target = new EventTarget();
  const callback = jest.fn(function (this: EventTarget, _event: Event) {
    expect(this).toBe(target);
  });
  const unsubscribe = addEventListeners(target, { touchstart: callback, keydown: callback, focus: callback });
  const events = [new TouchEvent("touchstart"), new KeyboardEvent("keydown"), new FocusEvent("focus")];
  events.forEach((event) => target.dispatchEvent(event));
  expect(callback.mock.calls.map(([event]) => event)).toEqual(events);
  unsubscribe();
  events.forEach((event) => target.dispatchEvent(event));
  expect(callback).toHaveBeenCalledTimes(3);
});

class SyntheticKeyboardService extends KeyboardService {
  public dispatch(event: Event) {
    this.keybordEvents.dispatchEvent(event);
  }
}

test.each(["press", "release"])("keyboard %s subscriptions forward synthetic detail", (type) => {
  const service = new SyntheticKeyboardService(new Graph({}));
  const callback = jest.fn();
  const unsubscribe = type === "press" ? service.onPress("Escape", callback) : service.onRelease("Escape", callback);
  const event = new CustomEvent(`${type}-Escape`, { detail: { key: "Escape" } });
  service.dispatch(event);
  expect(callback).toHaveBeenCalledWith(event);
  unsubscribe();
  service.dispatch(event);
  expect(callback).toHaveBeenCalledTimes(1);
});

test("typed subscriptions support a heterogeneous event map", () => {
  const target = new EventTarget();
  const key = jest.fn((_event: KeyboardEvent) => {});
  const focus = jest.fn((_event: FocusEvent) => {});
  const custom = jest.fn((_event: CustomEvent<{ value: number }>) => {});
  const unsubscribe = addEventListeners(target, { keydown: key, focus, custom });
  target.dispatchEvent(new KeyboardEvent("keydown"));
  target.dispatchEvent(new FocusEvent("focus"));
  target.dispatchEvent(new CustomEvent("custom", { detail: { value: 1 } }));
  expect(key).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledTimes(1);
  expect(custom).toHaveBeenCalledTimes(1);
  unsubscribe();
});
