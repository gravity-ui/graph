import type { Graph } from "../../../graph";
import type { GraphEventContext, GraphEventMap, GraphEventOptions, GraphHoverEvents } from "../../../graphEvents";
import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import {
  clearGraphListeners,
  deliverGraphEvent,
  hasGraphListener,
  listenGraphEvent,
  removeGraphEvent,
  withGraphEventTarget,
} from "../../../lib/graphEventDispatch";
import type { EventObserver } from "../../../lib/graphEventDispatch";
import type { GestureName, GraphClickEvent } from "../../../services/input/press";

/** Fields shared by physical and scene-driven hover transitions. */
export type TGraphHoverDetail = {
  target: EventedComponent;
  relatedTarget: EventedComponent | undefined;
  cause: "pointer" | "scene";
  sourceEvent?: PointerEvent;
  pointerPressed: boolean;
};

type HoverEvent = GraphHoverEvents[keyof GraphHoverEvents];

/** The component under the pointer after this transition, or undefined outside the graph. */
export function pointerTargetAfter(event: HoverEvent): EventedComponent | undefined {
  return event.type === "pointerenter" || event.type === "pointerover" ? event.target : event.relatedTarget;
}

/** Whether `target` is `ancestor` or one of its descendants (the CSS-like hover of `Block`). */
export function isWithinComponent(ancestor: CoreComponent, target: CoreComponent | undefined): boolean {
  for (let node: CoreComponent | undefined = target; node; node = node.getParent()) {
    if (node === ancestor) return true;
  }
  return false;
}

type LifecycleName = "graph-component-change" | "graph-component-unmounted";
type LifecycleEvents = { [K in LifecycleName]: GraphEventContext<K, EventedComponent> };
export interface EventedComponentEvents extends GraphHoverEvents, Pick<GraphEventMap, GestureName>, LifecycleEvents {}
type DispatchName = keyof GraphHoverEvents | LifecycleName;
/** Events passed through the component's overridable dispatch and hover hooks. */
export type ComponentDispatchEvent = EventedComponentEvents[DispatchName];
type ComponentListener<K extends keyof EventedComponentEvents> = EventObserver<EventedComponentEvents[K]>;

export type TEventedComponentProps = TComponentProps & { interactive?: boolean };

export class EventedComponent<
  Props extends TEventedComponentProps = TEventedComponentProps,
  State extends TComponentState = TComponentState,
  Context extends TComponentContext = TComponentContext,
> extends Component<Props, State, Context> {
  public readonly evented: boolean = true;

  public cursor?: string;

  private boundListener?: (event: ComponentDispatchEvent) => void;

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

  protected unmount() {
    clearGraphListeners(this);
    super.unmount();
  }

  protected handleEvent(_event: ComponentDispatchEvent) {
    // A component can listen to its own or another component's notifications.
  }

  public on<K extends keyof EventedComponentEvents>(
    type: K,
    listener: ComponentListener<NoInfer<K>>,
    options?: GraphEventOptions & { capture?: false }
  ): () => void {
    if (typeof options === "boolean" ? options : options?.capture)
      throw new TypeError("Only graph.on supports capture");
    return listenGraphEvent(this, type, listener, options);
  }

  /** Handles the first applicable component default after click listeners have run. */
  public applyClickDefault(_event: GraphClickEvent): boolean {
    return false;
  }

  /** Called before this component's listeners, even when its pointer interaction is disabled. */
  protected onDispatchedEvent(_event: ComponentDispatchEvent): void {
    // A hook for subclasses.
  }

  /** @internal A listener here, or a listener or dispatch hook on the path above this component. */
  protected hasDispatchObserver(type: DispatchName): boolean {
    if (hasGraphListener(this, type)) return true;
    for (let parent = this.getParent(); parent; parent = parent.getParent()) {
      if (
        parent instanceof EventedComponent &&
        (parent.onDispatchedEvent !== EventedComponent.prototype.onDispatchedEvent || hasGraphListener(parent, type))
      ) {
        return true;
      }
    }
    return false;
  }

  private get receiver() {
    return (this.boundListener ??= this.handleEvent.bind(this));
  }

  public listenEvents<K extends DispatchName>(events: K[], listener: ComponentListener<NoInfer<K>>): Array<() => void>;
  public listenEvents(events: DispatchName[], listener?: EventedComponent): Array<() => void>;
  public listenEvents<K extends DispatchName>(
    events: K[],
    listener: ComponentListener<NoInfer<K>> | EventedComponent = this
  ): Array<() => void> {
    const observer = listener instanceof EventedComponent ? listener.receiver : listener;
    return events.map((type) => this.on(type, observer));
  }

  public addEventListener<K extends DispatchName>(type: K, listener: ComponentListener<NoInfer<K>>): () => void;
  public addEventListener(type: DispatchName, listener: EventedComponent): () => void;
  public addEventListener<K extends DispatchName>(
    type: K,
    listener: ComponentListener<NoInfer<K>> | EventedComponent
  ): () => void {
    return this.on(type, listener instanceof EventedComponent ? listener.receiver : listener);
  }

  public removeEventListener<K extends DispatchName>(type: K, listener: ComponentListener<NoInfer<K>>): void;
  public removeEventListener(type: DispatchName, listener: EventedComponent): void;
  public removeEventListener<K extends DispatchName>(
    type: K,
    listener: ComponentListener<NoInfer<K>> | EventedComponent
  ) {
    removeGraphEvent(this, type, listener instanceof EventedComponent ? listener.receiver : listener);
  }

  protected _fireEvent(component: EventedComponent, event: ComponentDispatchEvent) {
    if (this._isMutedByInteractivity(component, event.type)) return;
    const graph = component.context.graph as Graph | undefined;
    const lifecycle = event.type === "graph-component-change" || event.type === "graph-component-unmounted";
    deliverGraphEvent(component, event, false, graph?.scene?.$level?.peek(), { rethrow: lifecycle });
  }

  /** Walks the component's parent chain until a hook or listener stops propagation. */
  public dispatchEvent(event: ComponentDispatchEvent): boolean {
    return this._dipping(this, event);
  }

  protected _dipping(startParent: Pick<CoreComponent, "getParent">, event: ComponentDispatchEvent) {
    for (let parent: typeof startParent | undefined = startParent; parent; parent = parent.getParent()) {
      if (!(parent instanceof EventedComponent)) continue;
      if (parent.onDispatchedEvent !== EventedComponent.prototype.onDispatchedEvent) {
        const component = parent;
        withGraphEventTarget(event, component, () => component.onDispatchedEvent(event));
        if (event.propagationStopped) return false;
      }
      if (this._hasListener(parent, event.type)) this._fireEvent(parent, event);
      if (event.propagationStopped) return false;
    }
    return true;
  }

  protected _isMutedByInteractivity(component: EventedComponent, type: string): boolean {
    return !component.isInteractive() && type !== "graph-component-unmounted";
  }

  protected _hasListener(component: EventedComponent, type: DispatchName): boolean {
    return hasGraphListener(component, type);
  }
}
