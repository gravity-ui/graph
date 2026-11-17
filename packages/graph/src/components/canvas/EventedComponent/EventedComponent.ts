import { GraphMouseEvent } from "../../../graphEvents";
import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import { TypedEventListener, toDOMListener } from "../../../utils/eventListener";

/** The detail of the hover events GraphLayer dispatches (`mouseenter`, `mouseleave`, `mouseover`, `mouseout`; D5). */
export type TGraphHoverDetail = {
  /** The hit target: the old one on `mouseleave`/`mouseout`, the new one on `mouseenter`/`mouseover`. */
  target: EventedComponent | undefined;
  /** The other side of the target change: none for the camera or outside the graph. */
  relatedTarget: EventedComponent | undefined;
  sourceEvent: MouseEvent;
  pointerPressed: boolean;
};

/**
 * The pointer's target after a hover event: the target of a `mouseenter`/`mouseover`, the related target of a
 * `mouseleave`/`mouseout` (none for the camera or outside the graph).
 */
export function pointerTargetAfter(event: Event): EventedComponent | undefined {
  const detail = (event as CustomEvent<Partial<TGraphHoverDetail> | undefined>).detail;
  if (typeof detail !== "object" || detail === null) return undefined;
  return event.type === "mouseenter" || event.type === "mouseover" ? detail.target : detail.relatedTarget;
}

/** Whether `target` is `ancestor` or one of its descendants (the CSS-like hover of `Block`). */
export function isWithinComponent(ancestor: CoreComponent, target: CoreComponent | undefined): boolean {
  for (let node: CoreComponent | undefined = target; node; node = node.getParent()) {
    if (node === ancestor) return true;
  }
  return false;
}

export interface EventedComponentEvents
  extends Omit<HTMLElementEventMap, "mouseenter" | "mouseleave" | "mouseover" | "mouseout"> {
  mouseenter: MouseEvent | GraphMouseEvent;
  mouseleave: MouseEvent | GraphMouseEvent;
  mouseover: MouseEvent | GraphMouseEvent;
  mouseout: MouseEvent | GraphMouseEvent;
  "graph-component-change": Event;
  "graph-component-unmounted": Event;
}

type ComponentEvent<K extends string> = K extends keyof EventedComponentEvents ? EventedComponentEvents[K] : Event;
type TEventedComponentListener<K extends string> = EventedComponent | TypedEventListener<ComponentEvent<K>, undefined>;
type StoredListener = EventedComponent | EventListenerOrEventListenerObject;
const listeners = new WeakMap<object, Map<string, Set<StoredListener>>>();
// Lifecycle notifications must reach their listeners even when pointer interaction is disabled.
const INTERACTIVITY_INDEPENDENT_EVENTS: ReadonlySet<string> = new Set(["graph-component-unmounted"]);

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
    return this.props.interactive ?? true;
  }

  public setInteractive(interactive: boolean) {
    this.setProps({ interactive });
  }

  private get events() {
    let events = listeners.get(this);
    if (!events) {
      events = new Map();
      listeners.set(this, events);
    }
    return events;
  }

  protected unmount() {
    listeners.delete(this);
    super.unmount();
  }

  protected handleEvent(_: Event) {
    // noop
  }

  /**
   * Called for each event that walks through this component (its own and its descendants' bubbling up), before its
   * listeners and whatever its interactivity, unless an earlier component stopped the event. A class overrides it to
   * follow events without listeners of its own per instance (`Block`'s hover, D5). It does nothing here.
   */
  protected onDispatchedEvent(_event: Event): void {
    // A hook for subclasses.
  }

  /** @internal A listener here, or a listener or dispatch hook on the path above this component. */
  protected hasDispatchObserver(type: string): boolean {
    if (listeners.get(this)?.get(type)?.size) return true;
    for (let parent = this.getParent(); parent; parent = parent.getParent()) {
      if (
        parent instanceof EventedComponent &&
        (parent.onDispatchedEvent !== EventedComponent.prototype.onDispatchedEvent ||
          listeners.get(parent)?.get(type)?.size)
      ) {
        return true;
      }
    }
    return false;
  }

  public listenEvents<K extends string>(
    events: K[],
    listener: TypedEventListener<ComponentEvent<NoInfer<K>>, undefined>
  ): Array<() => void>;
  public listenEvents(events: string[], listener?: EventedComponent): Array<() => void>;
  public listenEvents<K extends string>(events: K[], listener: TEventedComponentListener<NoInfer<K>> = this) {
    const stored = eraseListener(listener);
    return events.map((type) => this.addStoredListener(type, stored));
  }

  private addStoredListener(type: string, listener: StoredListener): () => void {
    const cbs = this.events.get(type) || new Set<StoredListener>();
    cbs.add(listener);
    this.events.set(type, cbs);
    return () => {
      listeners.get(this)?.get(type)?.delete(listener);
    };
  }

  public addEventListener<K extends string>(
    type: K,
    cbOrObject: TypedEventListener<ComponentEvent<NoInfer<K>>, undefined>
  ): () => void;
  public addEventListener(type: string, cbOrObject: EventedComponent): () => void;
  public addEventListener<K extends string>(type: K, cbOrObject: TEventedComponentListener<NoInfer<K>>) {
    return this.addStoredListener(type, eraseListener(cbOrObject));
  }

  public removeEventListener<K extends string>(
    type: K,
    cbOrObject: TypedEventListener<ComponentEvent<NoInfer<K>>, undefined>
  ): void;
  public removeEventListener(type: string, cbOrObject: EventedComponent): void;
  public removeEventListener<K extends string>(type: K, cbOrObject: TEventedComponentListener<NoInfer<K>>) {
    const cbs = this.events.get(type);
    if (cbs) {
      cbs.delete(eraseListener(cbOrObject));
    }
  }

  protected _fireEvent(cmp: object, event: Event) {
    if (this._isMutedByInteractivity(cmp, event.type)) {
      return;
    }
    const handlers = listeners.get(cmp)?.get?.(event.type);

    handlers?.forEach((cb) => {
      if (typeof cb === "function") {
        return cb(event);
      } else if (cb instanceof EventedComponent) {
        return cb.handleEvent(event);
      }
      return cb.handleEvent(event);
    });
  }

  /**
   * Dispatches `event` at this component: it walks the parent chain from here (D5), `bubbles: false` or not, through
   * each component's `onDispatchedEvent` and listeners, until a listener calls `stopPropagation()`. Returns false when
   * the walk was stopped.
   *
   * GraphLayer dispatches the pointer events it passes on to components at their hit target, as the native events,
   * unchanged (an emulated click is a copy of the browser's). Hover events (`mouseenter`, `mouseleave`, `mouseover`,
   * `mouseout`) carry `detail.target` and `detail.relatedTarget` (`TGraphHoverDetail`); every pointer event's hit
   * target is `getEventTarget(event)`, the same in each handler of the walk, so a parent can tell an event on itself
   * from one that bubbled up from a child.
   */
  public dispatchEvent(event: Event): boolean {
    return this._dipping(this, event);
  }

  protected _dipping(startParent: { getParent(): CoreComponent | undefined }, event: Event) {
    let stopPropagation = false;
    let parent: { getParent(): CoreComponent | undefined } | undefined = startParent;
    event.stopPropagation = () => {
      stopPropagation = true;
    };

    while (parent) {
      if (parent instanceof EventedComponent) parent.onDispatchedEvent(event);
      if (stopPropagation) return false;
      if (!this._isMutedByInteractivity(parent, event.type) && this._hasListener(parent, event.type)) {
        this._fireEvent(parent, event);
        if (stopPropagation) return false;
      }
      parent = parent.getParent();
    }

    return true;
  }

  protected _isMutedByInteractivity(cmp: object, type: string): boolean {
    return cmp instanceof EventedComponent && !cmp.isInteractive?.() && !INTERACTIVITY_INDEPENDENT_EVENTS.has(type);
  }

  protected _hasListener(comp: object, type: string): boolean {
    return listeners.get(comp)?.has?.(type) ?? false;
  }
}

function eraseListener<K extends string>(listener: TEventedComponentListener<K>): StoredListener {
  return listener instanceof EventedComponent ? listener : toDOMListener(listener);
}
