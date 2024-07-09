import { Component } from "ya-nirvana-renderer";

export function withEvent<T extends Constructor<Component>>(Base: T): T & Constructor<IWithEvent> {
  return class WithEvent extends Base implements IWithEvent {
    private _listenEvents: object = {};

    public unmount() {
      super.unmount();
      this._listenEvents = {};
    }

    public hasEventListener(type: string) {
      return Object.prototype.hasOwnProperty.call(this._listenEvents, type);
    }

    public addEventListener(type: string, cbOrObject: any) {
      if (Array.isArray(this._listenEvents[type])) {
        this._listenEvents[type].push(cbOrObject);
      } else {
        this._listenEvents[type] = [cbOrObject];
      }
    }

    public removeEventListener(type: string, cbOrObject: any) {
      if (Array.isArray(this._listenEvents[type])) {
        const i = this._listenEvents[type].indexOf(cbOrObject);

        if (i !== -1) {
          this._listenEvents[type].splice(i, 1);
        }
      }
    }

    public _fireEvent(cmp: any, event: Event) {
      if (!this._hasListener(cmp, event.type)) {
        return;
      }

      const fnsOrObjects = cmp._listenEvents[event.type];

      for (let i = 0; i < fnsOrObjects.length; i += 1) {
        if (typeof fnsOrObjects[i] === "function") {
          fnsOrObjects[i](event);
        } else if (typeof fnsOrObjects[i] === "object" && typeof fnsOrObjects[i].handleEvent === "function") {
          fnsOrObjects[i].handleEvent(event);
        }
      }
    }

    public dispatchEvent(event: Event): boolean {
      const bubbles = event.bubbles || false;

      if (bubbles) {
        return this._dipping(this, event);
      } else if (this._hasListener(this, event.type)) {
        this._fireEvent(this, event);
        return false;
      }
      return false;
    }

    public _dipping(startParent: Component, event: Event) {
      let stopPropagation = false;
      let parent: Component | undefined = startParent;
      event.stopPropagation = () => {
        stopPropagation = true;
      };

      do {
        this._fireEvent(parent, event);
        if (stopPropagation) {
          return false;
        }
        parent = parent.getParent() as Component;
      } while (parent);

      return true;
    }

    public _hasListener(comp: any, type: string) {
      return comp._listenEvents !== undefined && comp._listenEvents[type] !== undefined;
    }
  };
}

export class EventedComponent extends withEvent(Component) {}
