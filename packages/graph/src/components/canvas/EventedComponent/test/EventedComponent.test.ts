import { Component } from "../../../../lib/Component";
import { EventedComponent } from "../EventedComponent";

class TestComponent extends EventedComponent {
  public clearInteractive() {
    this.props.interactive = undefined;
  }
  public readonly handled = jest.fn();
  protected handleEvent(event: Event) {
    this.handled(event);
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

test("a graph hover event reaches its listener, and none after unmount", () => {
  const parent = new Component({});
  const child = new TestComponent({}, parent);
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

test("events walk the parent chain; onDispatchedEvent sees them before listeners; stopping ends the walk", () => {
  const seen: string[] = [];
  class Hooked extends TestComponent {
    public name = "";

    protected override onDispatchedEvent(event: Event): void {
      seen.push(`${this.name}:hook:${event.type}`);
    }
  }
  const root = new Component({});
  const parent = new Hooked({}, root);
  const child = new Hooked({}, parent);
  parent.name = "parent";
  child.name = "child";
  parent.addEventListener("mouseenter", () => seen.push("parent:listener:mouseenter"));
  child.addEventListener("mouseleave", (event: Event) => event.stopPropagation());
  child.dispatchEvent(new CustomEvent("mouseenter", { bubbles: false }));
  child.dispatchEvent(new CustomEvent("mouseleave", { bubbles: false }));
  expect(seen).toEqual([
    "child:hook:mouseenter",
    "parent:hook:mouseenter",
    "parent:listener:mouseenter",
    "child:hook:mouseleave",
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
