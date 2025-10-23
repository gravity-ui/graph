import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";

export type TEventedComponentListener<E extends Event = Event> = Component | ((e: E) => void);

const listeners = new WeakMap<Component, Map<string, Set<TEventedComponentListener<Event>>>>();

export type TEventedComponentProps = TComponentProps & { interactive?: boolean };

export class EventedComponent<
  Props extends TEventedComponentProps = TEventedComponentProps,
  State extends TComponentState = TComponentState,
  Context extends TComponentContext = TComponentContext,
> extends Component<Props, State, Context> {
  public readonly evented: boolean = true;

  public cursor?: string;

  constructor(props: Props, parent: Component) {
    super(
      {
        ...props,
        interactive: props.interactive ?? true,
      },
      parent
    );
  }

  public isInteractive() {
    return this.props.interactive;
  }

  public setInteractive(interactive: boolean) {
    this.setProps({ interactive });
  }

  private get events() {
    let listenersMap = listeners.get(this);
    if (!listenersMap) {
      listenersMap = new Map();
      listeners.set(this, listenersMap);
    }
    return listenersMap;
  }

  protected unmount() {
    listeners.delete(this);
    super.unmount();
  }

  protected handleEvent(_: Event) {
    // noop
  }

  public listenEvents<E extends Event = Event>(events: string[], cbOrObject: TEventedComponentListener<E> = this) {
    const unsubs = events.map((eventName) => {
      return this.addEventListener(eventName, cbOrObject);
    });
    return unsubs;
  }

  public addEventListener<E extends Event = Event>(type: string, cbOrObject: TEventedComponentListener<E>) {
    const cbs = this.events.get(type) || new Set();
    cbs.add(cbOrObject as TEventedComponentListener<Event>);
    this.events.set(type, cbs);
    return () => this.removeEventListener(type, cbOrObject);
  }

  public removeEventListener<E extends Event = Event>(type: string, cbOrObject: TEventedComponentListener<E>) {
    const cbs = this.events.get(type);
    if (cbs) {
      cbs.delete(cbOrObject as TEventedComponentListener<Event>);
    }
  }

  protected _fireEvent(cmp: Component, event: Event) {
    if (cmp instanceof EventedComponent && !cmp.isInteractive?.()) {
      return;
    }
    const handlers = listeners.get(cmp)?.get?.(event.type);

    handlers?.forEach((cb) => {
      if (typeof cb === "function") {
        return cb(event);
      } else if (cb instanceof Component && "handleEvent" in cb && typeof cb.handleEvent === "function") {
        return cb.handleEvent?.(event);
      }
      return undefined;
    });
  }

  public dispatchEvent(event: Event): boolean {
    return this._dipping(this, event);
  }

  protected _dipping(startParent: Component, event: Event) {
    let stopPropagation = false;
    let parent: Component = startParent;
    event.stopPropagation = () => {
      stopPropagation = true;
    };

    do {
      if (
        (parent instanceof EventedComponent && !parent.isInteractive?.()) ||
        !this._hasListener(parent as EventedComponent, event.type)
      ) {
        parent = parent.getParent() as Component;
        continue;
      }
      this._fireEvent(parent, event);
      if (stopPropagation) {
        return false;
      }
      parent = parent.getParent() as Component;
    } while (parent);

    return true;
  }

  protected _hasListener(comp: EventedComponent, type: string) {
    return listeners.get(comp)?.has?.(type);
  }
}
