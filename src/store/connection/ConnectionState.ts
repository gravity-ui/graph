import { batch, computed, effect, signal, untracked } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { Anchor } from "../../components/canvas/anchors";
import { Block } from "../../components/canvas/blocks/Block";
import { BaseConnection, TBaseConnectionProps, TBaseConnectionState } from "../../components/canvas/connections";
import type { TLabel, TMultipointConnection } from "../../components/canvas/connections/types";
import { TGraphLayerContext } from "../../components/canvas/layers/graphLayer/GraphLayer";
import { TConnectionColors } from "../../graphConfig";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
import { TBlockId } from "../block/Block";

import { ConnectionsStore } from "./ConnectionList";
import type { PortState, TPortId } from "./port/Port";
import { createAnchorPortId, createBlockPointPortId } from "./port/utils";

export const IS_CONNECTION_TYPE = "Connection" as const;
export type { TLabel, TMultipointConnection };

export type TConnectionId = string | number;

export type TConnectionBlockPoint = {};

export type TConnectionPortPoint = {};

export type TConnection = {
  id?: TConnectionId;
  sourceBlockId?: TBlockId;
  targetBlockId?: TBlockId;
  sourceAnchorId?: string;
  targetAnchorId?: string;

  sourcePortId?: TPortId;
  targetPortId?: TPortId;

  label?: string;
  styles?: Partial<TConnectionColors> & {
    dashes?: number[];
  };
  dashed?: boolean;
  selected?: boolean;
} & (TConnectionBlockPoint | TConnectionPortPoint);

export class ConnectionState<T extends TConnection = TConnection> {
  protected $rawState = signal<T>(undefined);

  /**
   * Computed signal that reactively determines if this connection is selected
   * by checking if its ID exists in the selection bucket
   */
  public readonly $selected = computed(() => {
    return this.connectionSelectionBucket.$selected.value.has(this.$rawState.value.id);
  });

  /**
   * Connection state signal.
   * Derives `selected` from the selection bucket, consistent with BlockState pattern.
   */
  public $state = computed(() => ({
    ...this.$rawState.value,
    selected: this.$selected.value,
  }));

  private isDestroyed = false;

  public get id() {
    return this.$state.value.id;
  }

  public get sourceBlockId() {
    return this.$state.value.sourceBlockId;
  }

  public get sourceAnchorId() {
    return this.$state.value.sourceAnchorId;
  }

  public get targetBlockId() {
    return this.$state.value.targetBlockId;
  }

  public get targetAnchorId() {
    return this.$state.value.targetAnchorId;
  }

  // Port ids are derived from the raw data: selection does not affect them.
  public $sourcePortId = computed(() => {
    const state = this.$rawState.value;
    if (state.sourcePortId) {
      return state.sourcePortId;
    }
    if (state.sourceAnchorId) {
      return createAnchorPortId(state.sourceBlockId, state.sourceAnchorId);
    }
    return createBlockPointPortId(state.sourceBlockId, false);
  });

  public $targetPortId = computed(() => {
    const state = this.$rawState.value;
    if (state.targetPortId) {
      return state.targetPortId;
    }
    if (state.targetAnchorId) {
      return createAnchorPortId(state.targetBlockId, state.targetAnchorId);
    }
    return createBlockPointPortId(state.targetBlockId, true);
  });

  private readonly sourcePort = signal<PortState | undefined>(undefined);

  private readonly targetPort = signal<PortState | undefined>(undefined);

  /** Ports this connection observes and is listed in (`PortState.$connections`). */
  private attachedPorts: ReadonlySet<PortState> = new Set();

  private disposePortsSync: (() => void) | undefined;

  /**
   * Source port of the connection.
   * Resolved when the connection is created and every time its source changes.
   * After `destroy()` it keeps the last resolved port.
   */
  public readonly $sourcePortState = computed((): PortState => this.sourcePort.value);

  /**
   * Target port of the connection.
   * Resolved when the connection is created and every time its target changes.
   * After `destroy()` it keeps the last resolved port.
   */
  public readonly $targetPortState = computed((): PortState => this.targetPort.value);

  public readonly $sourcePort = computed(() => {
    return this.$sourcePortState.value.$state.value;
  });

  public readonly $targetPort = computed(() => {
    return this.$targetPortState.value.$state.value;
  });

  /* @deprecated use $sourcePortState instead */
  public readonly $sourceBlock = computed(() => {
    const component = this.$sourcePortState.value.component;

    if (!component) {
      return undefined;
    }

    if (component instanceof Block) {
      return component.connectedState;
    }
    if (component instanceof Anchor) {
      return component.connectedState.block;
    }
    return undefined;
  });

  /* @deprecated use $targetPortState instead */
  public readonly $targetBlock = computed(() => {
    const component = this.$targetPortState.value.component;
    if (!component) {
      return undefined;
    }

    if (component instanceof Block) {
      return component.connectedState;
    }
    if (component instanceof Anchor) {
      return component.connectedState.block;
    }
    return undefined;
  });

  /**
   * True when both source and target blocks are hidden (e.g. both inside a
   * collapsed group). When true the connection should not be rendered.
   */
  public readonly $hidden = computed(() => {
    const getBlockHidden = (component: Block | Anchor | undefined): boolean => {
      if (component instanceof Block) return component.connectedState.$hidden.value;
      if (component instanceof Anchor) return component.connectedState.block.$hidden.value;
      return false;
    };
    return (
      getBlockHidden(this.$sourcePortState.value.component as Block | Anchor | undefined) &&
      getBlockHidden(this.$targetPortState.value.component as Block | Anchor | undefined)
    );
  });

  public $geometry = computed(() => {
    const sourcePort = this.$sourcePortState.value;
    const targetPort = this.$targetPortState.value;
    if (!sourcePort.lookup && !targetPort.lookup) {
      return [sourcePort.$point.value, targetPort.$point.value];
    }
    return undefined;
  });

  public static getConnectionId(connection: TConnection) {
    if (connection.id) return connection.id;
    if (connection.sourceAnchorId && connection.targetAnchorId) {
      return [connection.sourceAnchorId, connection.targetAnchorId].join(":");
    }
    return [connection.sourceBlockId, connection.targetBlockId].join(":");
  }

  private viewComponent: BaseConnection<TBaseConnectionProps, TBaseConnectionState, TGraphLayerContext, T>;

  constructor(
    public store: ConnectionsStore,
    connectionState: T,
    private readonly connectionSelectionBucket: ISelectionBucket<string | number>
  ) {
    const id = ConnectionState.getConnectionId(connectionState);
    this.$rawState.value = { ...connectionState, id } as T;

    // Resolve the ports right away and follow every retarget, so PortState.$connections
    // is correct even when no view has read the ports yet.
    this.disposePortsSync = effect(() => {
      const sourcePortId = this.$sourcePortId.value;
      const targetPortId = this.$targetPortId.value;
      untracked(() => this.syncPorts(sourcePortId, targetPortId));
    });
  }

  private syncPorts(sourcePortId: TPortId, targetPortId: TPortId): void {
    batch(() => {
      const sourcePort = this.resolvePort(this.sourcePort.peek(), sourcePortId);
      const targetPort = this.resolvePort(this.targetPort.peek(), targetPortId);
      const nextPorts = new Set([sourcePort, targetPort]);

      this.attachedPorts.forEach((port) => {
        if (!nextPorts.has(port)) {
          this.releasePort(port);
        }
      });
      nextPorts.forEach((port) => port.attachConnection(this));

      this.attachedPorts = nextPorts;
      this.sourcePort.value = sourcePort;
      this.targetPort.value = targetPort;
    });
  }

  /**
   * An endpoint keeps its resolved port while its id stays the same,
   * even if that port was removed from the store by force.
   */
  private resolvePort(current: PortState | undefined, portId: TPortId): PortState {
    if (current && current.id === portId) {
      return current;
    }
    return this.store.observePort(portId, this);
  }

  private releasePort(port: PortState): void {
    port.detachConnection(this);
    if (this.store.getPort(port.id) === port) {
      // Also deletes the port when nothing owns or observes it anymore
      this.store.unobservePort(port.id, this);
    } else {
      // The port was removed from the store by force: leave a port registered under the same id alone
      port.removeObserver(this);
    }
  }

  /**
   * Sets the view component for this connection state
   * @param viewComponent - The BaseConnection component instance
   * @returns {void}
   */
  public setViewComponent<P extends TBaseConnectionProps, S extends TBaseConnectionState, C extends TGraphLayerContext>(
    viewComponent: BaseConnection<P, S, C, T>
  ) {
    this.viewComponent = viewComponent;
  }

  /**
   * Gets the view component associated with this connection state.
   * @returns The BaseConnection view component or undefined if not set.
   */
  public getViewComponent() {
    return this.viewComponent;
  }

  /**
   * Checks if the connection is currently selected.
   * @returns True if the connection is selected, false otherwise.
   */
  public isSelected(): boolean {
    return this.$selected.value;
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.setConnectionsSelection([this.id], selected, strategy);
  }

  /**
   * @deprecated Use `toJSON` instead.
   * @returns {TConnection} A deep copy of the connection data
   */
  public asTConnection(): TConnection {
    return cloneDeep({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value,
    });
  }

  /**
   * Converts the connection state to a plain JSON object
   * @returns {TConnection} A deep copy of the connection data
   */
  public toJSON(): TConnection {
    return cloneDeep({
      ...this.$rawState.toJSON(),
      selected: this.$selected.value,
    });
  }

  /**
   * Updates the connection with new data
   * @param connection - Partial connection data to update
   * @returns {void}
   */
  public updateConnection(connection: Partial<TConnection>): void {
    const { styles, ...newProps } = connection;

    const newStyles = Object.assign({}, this.$rawState.value.styles, styles);

    this.setRawState(Object.assign({}, this.$rawState.value, newProps, { styles: newStyles }));
  }

  /**
   * Replaces the connection data entirely.
   * Unlike {@link ConnectionState.updateConnection}, fields that are not passed are dropped.
   * @param connection - New connection data; its id is ignored, the connection keeps its own id
   * @returns {void}
   */
  public replaceConnection(connection: T): void {
    this.setRawState({ ...connection, id: this.$rawState.peek().id });
  }

  private setRawState(state: T): void {
    this.$rawState.value = state;
    // Inside an outer batch the ports effect re-runs only when the batch ends.
    // Resolve the ports now, so the ports and PortState.$connections are current right away.
    if (!this.isDestroyed) {
      untracked(() => this.syncPorts(this.$sourcePortId.value, this.$targetPortId.value));
    }
  }

  /**
   * Detach the connection from its ports and stop observing them.
   * Safe to call more than once.
   * @returns {void}
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;

    this.disposePortsSync?.();
    this.disposePortsSync = undefined;

    batch(() => {
      this.attachedPorts.forEach((port) => this.releasePort(port));
    });
    this.attachedPorts = new Set();
  }
}
