import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";

type TEventedComponentListener = Component | ((e: Event) => void);

const listeners = new WeakMap<Component, Map<string, Set<TEventedComponentListener>>>();

export class EventedComponent<
  Props extends TComponentProps = TComponentProps,
  State extends TComponentState = TComponentState,
  Context extends TComponentContext = TComponentContext,
> extends Component<Props, State, Context> {
  public readonly evented: boolean = true;

  public readonly cursor?: string;

  private get events() {
    if (!listeners.has(this)) {
      listeners.set(this, new Map());
    }
    return listeners.get(this);
  }

  protected unmount() {
    listeners.delete(this);
    super.unmount();
  }

  protected handleEvent(_: Event) {
    // noop
  }

  public listenEvents(events: string[], cbOrObject: TEventedComponentListener = this) {
    const unsubs = events.map((eventName) => {
      return this.addEventListener(eventName, cbOrObject);
    });
    return unsubs;
  }

  public addEventListener(type: string, cbOrObject: TEventedComponentListener) {
    const cbs = this.events.get(type) || new Set();
    cbs.add(cbOrObject);
    this.events.set(type, cbs);
    return () => this.removeEventListener(type, cbOrObject);
  }

  public removeEventListener(type: string, cbOrObject: TEventedComponentListener) {
    const cbs = this.events.get(type);
    if (cbs) {
      cbs.delete(cbOrObject);
    }
  }

  public _fireEvent(cmp: Component, event: Event) {
    const handlers = listeners.get(cmp)?.get?.(event.type);

    handlers?.forEach((cb) => {
      if (typeof cb === "function") {
        cb(event);
      } else if (cb instanceof Component && "handleEvent" in cb && typeof cb.handleEvent === "function") {
        cb.handleEvent?.(event);
      }
    });
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
    let parent: Component = startParent;
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

  public _hasListener(comp: EventedComponent, type: string) {
    return listeners.get(comp)?.has?.(type);
  }
}
