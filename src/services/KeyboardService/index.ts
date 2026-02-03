import { signal } from "@preact/signals-core";

import { Graph, GraphState } from "../../graph";

/**
 * KeyboardService
 * This is an internal service that manages keyboard state for the graph.
 *
 * It is used to detect keyboard state changes and to provide a reactive signal with the current keyboard state.
 *
 * @example
 * ```typescript
 * const keyboardService = new KeyboardService(graph);
 * keyboardService.$keyboardState.subscribe((state) => {
 *   console.log("is shift key pressed", state.shiftKey);
 *   console.log("is meta key pressed", state.metaKey);
 *   console.log("is ctrl key pressed", state.ctrlKey);
 *   console.log("is alt key pressed", state.altKey);
 * });
 * ```
 * @internal
 */
export class KeyboardService {
  protected $keyboardState = signal<{
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
  }>({
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  });

  protected lastEvent: KeyboardEvent | null = null;

  protected unsubscribes: (() => void)[] = [];

  constructor(private graph: Graph) {
    this.graph.on("state-change", (event) => {
      if (event.detail.state === GraphState.READY) {
        this.startListening();
      } else if (event.detail.state === GraphState.INIT) {
        this.stopListening();
      }
    });
  }

  public isShiftPressed(): boolean {
    return this.$keyboardState.value.shiftKey;
  }

  public isMetaPressed(): boolean {
    return this.$keyboardState.value.metaKey;
  }

  public isCtrlPressed(): boolean {
    return this.$keyboardState.value.ctrlKey;
  }

  public isAltPressed(): boolean {
    return this.$keyboardState.value.altKey;
  }

  protected startListening(): void {
    this.graph.layers.$root?.ownerDocument?.addEventListener("keydown", this.handleKeyDown, {
      capture: true,
    });
    this.graph.layers.$root?.ownerDocument?.addEventListener("keyup", this.handleKeyDown, {
      capture: true,
    });
    this.unsubscribes.push(() => {
      this.graph.layers.$root?.ownerDocument?.removeEventListener("keydown", this.handleKeyDown, {
        capture: true,
      });
      this.graph.layers.$root?.ownerDocument?.removeEventListener("keyup", this.handleKeyDown, {
        capture: true,
      });
    });
  }

  protected stopListening(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes = [];
    this.lastEvent = null;
    this.$keyboardState.value = {
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    };
  }

  protected hasChanged(event: KeyboardEvent): boolean {
    return (
      this.lastEvent?.key !== event.key ||
      this.lastEvent?.shiftKey !== event.shiftKey ||
      this.lastEvent?.metaKey !== event.metaKey ||
      this.lastEvent?.ctrlKey !== event.ctrlKey ||
      this.lastEvent?.altKey !== event.altKey
    );
  }

  protected handleKeyDown = (event: KeyboardEvent): void => {
    if (this.hasChanged(event)) {
      this.lastEvent = event;
      this.$keyboardState.value = {
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      };
    }
  };

  protected cleanup(): void {
    this.stopListening();
  }
}
