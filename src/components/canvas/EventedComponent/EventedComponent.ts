import intersects from "intersects";

import { Component, TComponentContext, TComponentProps, TComponentState } from "../../../lib/Component";
import { HitBoxData } from "../../../services/HitTest";
import { TRect } from "../../../utils/types/shapes";

type TEventedComponentListener = Component | ((e: Event) => void);

const listeners = new WeakMap<Component, Map<string, Set<TEventedComponentListener>>>();

export type TEventedAreaState = {
  hovered: boolean;
};

export type TEventedAreaParams = {
  key: string;
  onHitBox?: (data: HitBoxData) => boolean;
  [eventName: string]: ((event: Event) => void) | ((data: HitBoxData) => boolean) | string | undefined;
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

  private _prevHoveredAreaLeaveHandler: ((event: Event) => void) | undefined;

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
    if (!listeners.has(this)) {
      listeners.set(this, new Map());
    }
    return listeners.get(this);
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
        this._prevHoveredAreaLeaveHandler =
          typeof handler === "function" ? (handler as (event: Event) => void) : undefined;
      }
    }
    this._eventedAreas.clear();
    super.willRender();
  }

  protected didRender() {
    super.didRender();
    if (this._hoveredEventedAreaKey !== undefined && !this._eventedAreas.has(this._hoveredEventedAreaKey)) {
      this._prevHoveredAreaLeaveHandler?.(new Event("mouseleave"));
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
        (leaveHandler as (event: Event) => void)(new Event("mouseleave"));
      }
    }

    this._hoveredEventedAreaKey = newHoveredKey;

    if (newHoveredKey !== undefined) {
      const enterHandler = this._eventedAreas.get(newHoveredKey)!.params.mouseenter;
      if (typeof enterHandler === "function") {
        (enterHandler as (event: Event) => void)(new Event("mouseenter"));
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
          (leaveHandler as (event: Event) => void)(new Event("mouseleave"));
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

    if (cmp instanceof EventedComponent && cmp._eventedAreas.size > 0 && cmp._lastHitBoxData) {
      if (event.type === "mouseenter" || event.type === "mouseleave") return;

      const hitBoxData = cmp._lastHitBoxData;
      for (const area of cmp._eventedAreas.values()) {
        const handler = area.params[event.type];
        if (typeof handler !== "function") continue;

        if (cmp._areaHitTest(area, hitBoxData)) {
          (handler as (event: Event) => void)(event);
        }
      }
    }
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
    if (listeners.get(comp)?.has?.(type)) return true;
    if (comp._eventedAreas?.size > 0) {
      for (const area of comp._eventedAreas.values()) {
        if (typeof area.params[type] === "function") return true;
      }
    }
    return false;
  }
}
