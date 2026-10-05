import { Component } from "../../../lib/Component";

import { EventedComponent, TEventedAreaParams } from "./EventedComponent";

class TestComponent extends EventedComponent {
  public readonly handled = jest.fn();
  protected handleEvent(event: Event) {
    this.handled(event);
  }
  public registerArea(params: TEventedAreaParams) {
    this.eventedArea(() => ({ x: 0, y: 0, width: 10, height: 10 }), params);
    this._lastHitBoxData = { minX: 1, minY: 1, maxX: 2, maxY: 2, x: 1, y: 1 };
  }
}

test("component listeners preserve identity, bubbling, objects and cleanup", () => {
  const root = new Component({});
  const parent = new TestComponent({}, root);
  const child = new TestComponent({}, parent);
  const listener = jest.fn();
  const object = { handleEvent: jest.fn() };
  const remove = child.addEventListener("click", listener);
  child.addEventListener("click", listener);
  child.addEventListener("click", object);
  parent.addEventListener("click", parent);
  const event = new MouseEvent("click", { clientX: 12 });
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(object.handleEvent).toHaveBeenCalledWith(event);
  expect(parent.handled).toHaveBeenCalledWith(event);
  remove();
  child.removeEventListener("click", object);
  parent.removeEventListener("click", parent);
  child.dispatchEvent(new MouseEvent("click"));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(object.handleEvent).toHaveBeenCalledTimes(1);
  Component.unmount(child);
  Component.unmount(parent);
  Component.unmount(root);
});

test("component area hover uses native synthetic events and bubbling preserves graph hover events", () => {
  const parent = new Component({});
  const child = new TestComponent({}, parent);
  const enter = jest.fn();
  const leave = jest.fn();
  child.registerArea({ key: "area", mouseenter: enter, mouseleave: leave });
  child._trackAreaHover();
  expect(enter.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
  child._clearAreaHover();
  expect(leave.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
  const listener = jest.fn();
  child.addEventListener("mouseenter", listener);
  const event = new CustomEvent("mouseenter", { detail: { sourceEvent: new MouseEvent("mousemove") } });
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledWith(event);
  Component.unmount(child);
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(1);
  Component.unmount(parent);
});
