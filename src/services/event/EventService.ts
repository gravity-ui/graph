import { EventManager, Pan, Pinch, Tap } from "mjolnir.js";
import type { MjolnirEvent, RecognizerTuple } from "mjolnir.js";

import { GraphComponent } from "../../components/canvas/GraphComponent";
import { Graph } from "../../graph";
import { IPoint } from "../../utils/types/shapes";

export interface GraphEventDetails {
  globalCoordinate?: IPoint;
  sourceEvent: MjolnirEvent["srcEvent"];
  target: InstanceType<Constructor<GraphComponent>>;
}

export type GraphEvent = CustomEvent<GraphEventDetails>;

function isEventStep(eventType: string, step: string): boolean {
  return eventType.length > step.length && eventType.endsWith(step);
}

const eventMangerSettings: {
  recognizers: RecognizerTuple[];
  events: string[];
} = {
  recognizers: [[Tap], [Pan, { event: "drag" }], [Pinch]],
  events: [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointerover",
    "pointerout",
    "pointerleave",
    "wheel",
    // "contextmenu",
    "tap",
    "drag",
    "dragstart",
    "dragmove",
    "dragend",
    "dragcancel",
    "pinch",
    "pinchstart",
    "pinchmove",
    "pinchend",
    "pinchcancel",
    "pinchin",
    "pinchout",
  ],
} as const;

export class EventService {
  private eventManager?: EventManager;
  private startTarget?: InstanceType<Constructor<GraphComponent>>;

  constructor(private graph: Graph) {}

  protected onEvent(event: GraphEvent) {
    this.graph.eventEmitter.dispatchEvent(event);

    if (!event.defaultPrevented) {
      if (event.detail.target) {
        event.detail.target.dispatchEvent(event);
      } else {
        this.graph.getGraphLayer().$.camera.dispatchEvent(event);
      }
    }
  }

  protected getInitEvent() {
    return Object.fromEntries(
      eventMangerSettings.events.map((eventName: string) => {
        return [
          eventName,
          (event: MjolnirEvent) => {
            const globalCoordinate =
              event.srcEvent instanceof PointerEvent || event.srcEvent instanceof MouseEvent
                ? this.graph.getPointInCameraSpace(event.srcEvent)
                : undefined;
            const target = this.graph.getElementOverPoint(globalCoordinate);

            if (isEventStep(event.type, "start")) {
              this.startTarget = target;
            }

            const gestureEvent = new CustomEvent<GraphEventDetails>(eventName, {
              cancelable: true,
              bubbles: false,
              detail: {
                globalCoordinate,
                sourceEvent: event.srcEvent,
                target: this.startTarget ? this.startTarget : target,
              },
            });
            this.onEvent(gestureEvent);

            if (isEventStep(event.type, "end")) {
              this.startTarget = undefined;
            }
          },
        ];
      })
    );
  }

  public attach(rootEl: HTMLElement) {
    this.eventManager = new EventManager(rootEl, {
      recognizers: eventMangerSettings.recognizers,
      events: this.getInitEvent(),
    });
  }

  public detach() {
    this.eventManager.destroy();
  }
}
