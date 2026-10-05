import intersects from "intersects";

import { GraphMouseEvent } from "../../../graphEvents";
import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { CoreComponent } from "../../../lib/CoreComponent";
import { HitBoxData } from "../../../services/HitTest";
import { TypedEventListener, toDOMListener } from "../../../utils/eventListener";
import { TRect } from "../../../utils/types/shapes";

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

function createSyntheticHoverEvent(type: "mouseenter" | "mouseleave"): MouseEvent {
  return new MouseEvent(type, {
    bubbles: false,
    cancelable: false,
    clientX: 0,
    clientY: 0,
  });
}

export type TEventedAreaState = {
  hovered: boolean;
};

export type TEventedAreaParams = {
  key: string;
  onHitBox?: (data: HitBoxData) => boolean;
  [eventName: string]: ((...args: never[]) => unknown) | string | undefined;
} & {
  [K in keyof EventedComponentEvents]?: (
    event: K extends "mouseenter" | "mouseleave" ? MouseEvent : EventedComponentEvents[K]
  ) => void;
};

type TEventedArea = {
  rect: TRect;
  params: TEventedAreaParams;
};

export type TEventedComponentProps = TComponentProps & { interactive?: boolean };

export class EventedComponent<
  Props extends TEventedComponentProps = TEventedComponentProps,
  State extends TComponentState = TComponentState,
  Context extends TComponentContext = TComponentContext,
> extends Component<Props, State, Context> {
  public readonly evented: boolean = true;

  public cursor?: string;

  protected _eventedAreas: Map<string, TEventedArea> = new Map();

  protected _lastHitBoxData: HitBoxData | undefined;

  protected _hoveredEventedAreaKey: string | undefined;

  private _prevHoveredAreaLeaveHandler: ((event: MouseEvent) => void) | undefined;

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

  protected willRender() {
    if (this._hoveredEventedAreaKey !== undefined) {
      const area = this._eventedAreas.get(this._hoveredEventedAreaKey);
      if (area) {
        const handler = area.params.mouseleave;
        this._prevHoveredAreaLeaveHandler = typeof handler === "function" ? handler : undefined;
      }
    }
    this._eventedAreas.clear();
    super.willRender();
  }

  protected didRender() {
    super.didRender();
    if (this._hoveredEventedAreaKey !== undefined && !this._eventedAreas.has(this._hoveredEventedAreaKey)) {
      this._prevHoveredAreaLeaveHandler?.(createSyntheticHoverEvent("mouseleave"));
      this._hoveredEventedAreaKey = undefined;
    }
    this._prevHoveredAreaLeaveHandler = undefined;
  }

  private _areaHitTest(area: TEventedArea, hitBoxData: HitBoxData): boolean {
    const onHitBox = area.params.onHitBox;
    if (onHitBox) return onHitBox(hitBoxData);

    const { x, y, width, height } = area.rect;
    return intersects.boxBox(
      x,
      y,
      width,
      height,
      hitBoxData.minX,
      hitBoxData.minY,
      hitBoxData.maxX - hitBoxData.minX,
      hitBoxData.maxY - hitBoxData.minY
    );
  }

  public _trackAreaHover(): void {
    if (this._eventedAreas.size === 0 || !this._lastHitBoxData) {
      this._clearAreaHover(true);
      return;
    }

    const hitBoxData = this._lastHitBoxData;
    let newHoveredKey: string | undefined;

    for (const [key, area] of this._eventedAreas) {
      if (this._areaHitTest(area, hitBoxData)) {
        newHoveredKey = key;
        break;
      }
    }

    if (newHoveredKey === this._hoveredEventedAreaKey) return;

    const prevArea =
      this._hoveredEventedAreaKey !== undefined ? this._eventedAreas.get(this._hoveredEventedAreaKey) : undefined;
    if (prevArea) {
      const leaveHandler = prevArea.params.mouseleave;
      if (typeof leaveHandler === "function") {
        leaveHandler(createSyntheticHoverEvent("mouseleave"));
      }
    }

    this._hoveredEventedAreaKey = newHoveredKey;

    if (newHoveredKey !== undefined) {
      const nextArea = this._eventedAreas.get(newHoveredKey);
      if (nextArea) {
        const enterHandler = nextArea.params.mouseenter;
        if (typeof enterHandler === "function") {
          enterHandler(createSyntheticHoverEvent("mouseenter"));
        }
      }
    }

    this.performRender();
  }

  public _clearAreaHover(scheduleRender = false): void {
    if (this._hoveredEventedAreaKey !== undefined) {
      const area = this._eventedAreas.get(this._hoveredEventedAreaKey);
      if (area) {
        const leaveHandler = area.params.mouseleave;
        if (typeof leaveHandler === "function") {
          leaveHandler(createSyntheticHoverEvent("mouseleave"));
        }
      }
      this._hoveredEventedAreaKey = undefined;
      if (scheduleRender) {
        this.performRender();
      }
    }
  }

  protected eventedArea(fn: (state: TEventedAreaState) => TRect, params: TEventedAreaParams): TRect {
    const state: TEventedAreaState = {
      hovered: this._hoveredEventedAreaKey === params.key,
    };
    const rect = fn(state);
    this._eventedAreas.set(params.key, { rect, params });
    return rect;
  }

  protected handleEvent(_: Event) {
    // noop
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
    if (cmp instanceof EventedComponent && !cmp.isInteractive?.()) {
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

    if (cmp instanceof EventedComponent && cmp._eventedAreas.size > 0 && cmp._lastHitBoxData) {
      if (
        event.type === "mouseenter" ||
        event.type === "mouseleave" ||
        event.type === "key" ||
        event.type === "onHitBox"
      )
        return;

      const hitBoxData = cmp._lastHitBoxData;
      for (const area of cmp._eventedAreas.values()) {
        const handler = area.params[event.type];
        if (typeof handler !== "function") continue;

        if (cmp._areaHitTest(area, hitBoxData)) {
          const listener = toDOMListener(handler);
          if (typeof listener === "function") listener(event);
        }
      }
    }
  }

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
      if ((parent instanceof EventedComponent && !parent.isInteractive?.()) || !this._hasListener(parent, event.type)) {
        parent = parent.getParent();
        continue;
      }
      this._fireEvent(parent, event);
      if (stopPropagation) {
        return false;
      }
      parent = parent.getParent();
    }

    return true;
  }

  protected _hasListener(comp: object, type: string) {
    if (listeners.get(comp)?.has?.(type)) return true;
    if (comp instanceof EventedComponent && comp._eventedAreas.size > 0) {
      for (const area of comp._eventedAreas.values()) {
        if (typeof area.params[type] === "function") return true;
      }
    }
    return false;
  }
}

function eraseListener<K extends string>(listener: TEventedComponentListener<K>): StoredListener {
  return listener instanceof EventedComponent ? listener : toDOMListener(listener);
}
