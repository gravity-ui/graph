import { Component } from "../../../../lib/Component";
import { createGraphEvent } from "../../../../lib/graphEventDispatch";
import { hoverEvent } from "../../../../test/pointer";
import type { ComponentDispatchEvent } from "../EventedComponent";
import { EventedComponent } from "../EventedComponent";

class TestComponent extends EventedComponent {
  public clearInteractive() {
    this.props.interactive = undefined;
  }
  public readonly handled = jest.fn();
  protected handleEvent(event: ComponentDispatchEvent) {
    this.handled(event);
  }
}

test("component listeners preserve identity, bubbling, objects and cleanup", () => {
  const root = new Component({});
  const parent = new TestComponent({}, root);
  const child = new TestComponent({}, parent);
  const listener = jest.fn();
  const object = { handleEvent: jest.fn() };
  const remove = child.addEventListener("graph-component-change", listener);
  child.addEventListener("graph-component-change", listener);
  child.addEventListener("graph-component-change", object);
  parent.addEventListener("graph-component-change", parent);
  const event = createGraphEvent("graph-component-change", child, {}, false);
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(object.handleEvent).toHaveBeenCalledWith(event);
  expect(parent.handled).toHaveBeenCalledWith(event);
  remove();
  child.removeEventListener("graph-component-change", object);
  parent.removeEventListener("graph-component-change", parent);
  child.dispatchEvent(createGraphEvent("graph-component-change", child, {}, false));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(object.handleEvent).toHaveBeenCalledTimes(1);
  Component.unmount(child);
  Component.unmount(parent);
  Component.unmount(root);
});

test("a graph hover event reaches its listener, and none after unmount", () => {
  const parent = new Component({});
  const child = new TestComponent({}, parent);
  const listener = jest.fn();
  child.on("pointerenter", listener);
  const event = hoverEvent("pointerenter", child, new PointerEvent("pointermove"));
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledWith(event);
  Component.unmount(child);
  child.dispatchEvent(event);
  expect(listener).toHaveBeenCalledTimes(1);
  Component.unmount(parent);
});

test("events walk the parent chain; onDispatchedEvent sees them before listeners; stopping ends the walk", () => {
  const seen: string[] = [];
  class Hooked extends TestComponent {
    public name = "";

    protected override onDispatchedEvent(event: ComponentDispatchEvent): void {
      seen.push(`${this.name}:hook:${event.type}`);
    }
  }
  const root = new Component({});
  const parent = new Hooked({}, root);
  const child = new Hooked({}, parent);
  parent.name = "parent";
  child.name = "child";
  parent.addEventListener("pointerenter", () => seen.push("parent:listener:pointerenter"));
  child.addEventListener("pointerleave", (event: ComponentDispatchEvent) => event.stopPropagation());
  child.dispatchEvent(hoverEvent("pointerenter", child));
  child.dispatchEvent(hoverEvent("pointerleave", child));
  expect(seen).toEqual([
    "child:hook:pointerenter",
    "parent:hook:pointerenter",
    "parent:listener:pointerenter",
    "child:hook:pointerleave",
  ]);
  Component.unmount(child);
  Component.unmount(parent);
  Component.unmount(root);
});

test("interactive defaults to true when omitted or cleared, while false stays false", () => {
  const parent = new Component({});
  const component = new TestComponent({}, parent);
  expect(component.isInteractive()).toBe(true);
  component.clearInteractive();
  expect(component.isInteractive()).toBe(true);
  expect(new TestComponent({ interactive: false }, parent).isInteractive()).toBe(false);
});

test.each([true, { capture: true }] as const)("rejects graph-only capture on a component (%p)", (options) => {
  const root = new Component({});
  const component = new TestComponent({}, root);
  expect(() => {
    // @ts-expect-error JavaScript callers receive the same restriction at registration.
    component.on("pointerenter", () => {}, options);
  }).toThrow("capture");
  Component.unmount(component);
  Component.unmount(root);
});
