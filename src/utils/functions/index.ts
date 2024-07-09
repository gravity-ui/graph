import { EVENTS_DETAIL, SELECTION_EVENT_TYPES } from "../types/events";
import { Block } from "../../components/canvas/blocks/Block";
import { BlockState, TBlockId } from "../../store/block/Block";
import { ECanChangeBlockGeometry } from "../../store/settings";
import { Rect, TRect } from "../types/shapes";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function noop(...args: any[]): any {
  // noop
}

export function getXY(root: HTMLElement, event: Event | WheelEvent | MouseEvent): [number, number] {
  if (!("pageX" in event)) return [-1, -1];
  const rect = root.getBoundingClientRect();
  return [event.pageX - rect.left - window.scrollX, event.pageY - rect.top - window.scrollY];
}

export function getCoord(event: TouchEvent & MouseEvent, coord: string) {
  const name = `page${coord.toUpperCase()}`;

  if (event.touches !== undefined && event.touches.length) {
    return event.touches[0][name];
  } else {
    return event[name];
  }
}

export function getEventDelta(e1, e2) {
  return Math.abs(getCoord(e1, "x") - getCoord(e2, "x")) + Math.abs(getCoord(e1, "y") - getCoord(e2, "y"));
}

export function isMetaKeyEvent(event: MouseEvent | KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

export function isShiftKeyEvent(event: MouseEvent | KeyboardEvent): boolean {
  return event.shiftKey;
}

export function isAltKeyEvent(event: MouseEvent | KeyboardEvent): boolean {
  return event.altKey;
}

export function getEventSelectionAction(event: MouseEvent) {
  if (isMetaKeyEvent(event)) return SELECTION_EVENT_TYPES.TOGGLE;
  return SELECTION_EVENT_TYPES.DELETE;
}

export function isBlock(component: unknown): component is Block {
  return (component as Block)?.isBlock;
}

export function createCustomDragEvent(eventType: string, e): CustomEvent {
  return new CustomEvent(eventType, {
    detail: {
      ...EVENTS_DETAIL[eventType](e.pageX, e.pageY),
      sourceEvent: e,
    },
  });
}

export function createObject(simpleObject: object, forDefineProperties: PropertyDescriptorMap): object {
  const defaultProperties = {
    configurable: true,
    enumerable: true,
  };

  const keys = Object.keys(forDefineProperties);

  for (let i = 0; i < keys.length; i += 1) {
    forDefineProperties[keys[i]] = { ...defaultProperties, ...forDefineProperties[keys[i]] };
  }

  Object.defineProperties(simpleObject, forDefineProperties);

  return simpleObject;
}

export function dispatchEvents(comps, e) {
  for (let i = 0; i < comps.length; i += 1) {
    if (comps[i] !== (this as any) && comps[i].dispatchEvent) {
      comps[i].dispatchEvent(e);
    }
  }
}

export function addEventListeners(
  instance: EventTarget,
  mapEventsToFn?: Record<string, (event: CustomEvent | MouseEvent) => void>
): () => void {
  if (mapEventsToFn === undefined) return noop;

  const subs = [];
  const events = Object.keys(mapEventsToFn);

  for (let i = 0; i < events.length; i += 1) {
    instance.addEventListener(events[i], mapEventsToFn[events[i]].bind(instance));
    subs.push(instance.removeEventListener.bind(instance, events[i], mapEventsToFn[events[i]]));
  }

  return () => subs.forEach((f) => f());
}

export function isAllowChangeBlockGeometry(globalCanChangeGeometry: ECanChangeBlockGeometry, blockSelected: boolean) {
  if (globalCanChangeGeometry === ECanChangeBlockGeometry.ALL) return true;

  return globalCanChangeGeometry === ECanChangeBlockGeometry.ONLY_SELECTED && blockSelected;
}

export function getUsableRectByBlockIds(blocks: BlockState[], blockIds?: TBlockId[]): TRect {
  const filteredBlocks = blocks.filter((block) => {
    return !block.$state.value.settings?.phantom && (blockIds ? blockIds.includes(block.id) : true);
  });
  const geometry = filteredBlocks.reduce(
    (acc, item) => {
      acc.minX = Math.min(acc.minX, item.x);
      acc.minY = Math.min(acc.minY, item.y);
      acc.maxX = Math.max(acc.maxX, item.x + item.width);
      acc.maxY = Math.max(acc.maxY, item.y + item.height);
      return acc;
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
  return new Rect(geometry.minX, geometry.minY, geometry.maxX - geometry.minX, geometry.maxY - geometry.minY);
}

export function isGeometryHaveInfinity(geometry: TRect): boolean {
  let infinityHave = false;

  Object.entries(geometry).forEach((entry) => {
    if (!isFinite(entry[1])) infinityHave = true;
  });

  return infinityHave;
}

export function startAnimation(duration: number, draw: (progress: number) => void) {
  const start = performance.now();

  requestAnimationFrame(function animate(time) {
    let progress = (time - start) / duration;
    if (progress > 1) progress = 1;

    draw(progress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  });
}

export function isWindows() {
  return navigator.appVersion.indexOf("Win") !== -1;
}

export function isTrackpadWheelEvent(e: WheelEvent) {
  // deltaY in the mouse scroll even, usually is a float number.
  // It's a bit of a hack, but it's the easiest way to detect a trackpad.
  if (e.deltaY && !Number.isInteger(e.deltaY)) {
    return false;
  }
  return true;
}

export function computeCssVariable(name: string) {
  if (!name.startsWith("var(")) return name;

  const body = globalThis.document.body;
  if (!body) return name;

  const computedStyle = window.getComputedStyle(body);
  if (!computedStyle) return name;

  name = name.substring(4);
  name = name.substring(0, name.length - 1);

  return computedStyle.getPropertyValue(name).trim();
}
