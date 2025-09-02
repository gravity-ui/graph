import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { Block } from "../../components/canvas/blocks/Block";
import { TConnectionColors } from "../../graphConfig";
import { ESelectionStrategy } from "../../utils/types/types";
import { TBlockId } from "../block/Block";

import { ConnectionsStore } from "./ConnectionList";
import { TPortId } from "./port/Port";
import { createAnchorPortId, createBlockPointPortId } from "./port/utils";

export const IS_CONNECTION_TYPE = "Connection" as const;

export type TConnectionId = string | number | symbol;

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
  public $state = signal<T>(undefined);

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

  public $sourcePortId = computed(() => {
    if (this.$state.value.sourcePortId) {
      return this.$state.value.sourcePortId;
    }
    if (this.$state.value.sourceAnchorId) {
      return createAnchorPortId(this.$state.value.sourceBlockId, this.$state.value.sourceAnchorId);
    }
    return createBlockPointPortId(this.$state.value.sourceBlockId, false);
  });

  public $targetPortId = computed(() => {
    if (this.$state.value.targetPortId) {
      return this.$state.value.targetPortId;
    }
    if (this.$state.value.targetAnchorId) {
      return createAnchorPortId(this.$state.value.targetBlockId, this.$state.value.targetAnchorId);
    }
    return createBlockPointPortId(this.$state.value.targetBlockId, true);
  });

  public readonly $sourcePortState = computed(() => {
    const portId = this.$sourcePortId.value;
    let port = this.store.getPort(portId);
    if (!port) {
      port = this.store.observePort(portId, this);
    } else if (!port.observers.has(this)) {
      port.addObserver(this);
    }
    return port;
  });

  public readonly $targetPortState = computed(() => {
    const portId = this.$targetPortId.value;
    let port = this.store.getPort(portId);
    if (!port) {
      port = this.store.observePort(portId, this);
    } else if (!port.observers.has(this)) {
      port.addObserver(this);
    }
    return port;
  });

  public readonly $sourcePort = computed(() => {
    return this.$sourcePortState.value.$state.value;
  });

  public readonly $targetPort = computed(() => {
    return this.$targetPortState.value.$state.value;
  });

  /* @deprecated use $sourcePortState instead */
  public readonly $sourceBlock = computed(() => {
    if (this.$sourcePortState.value.component && this.$sourcePortState.value.component instanceof Block) {
      return this.$sourcePortState.value.component;
    }
    return undefined;
  });

  /* @deprecated use $targetPortState instead */
  public readonly $targetBlock = computed(() => {
    if (this.$targetPortState.value.component && this.$targetPortState.value.component instanceof Block) {
      return this.$targetPortState.value.component;
    }
    return undefined;
  });

  public $geometry = computed(() => {
    if (!this.$sourcePort.value.lookup && !this.$targetPort.value.lookup) {
      return [this.$sourcePort.value, this.$targetPort.value];
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

  constructor(
    public store: ConnectionsStore,
    connectionState: T
  ) {
    const id = ConnectionState.getConnectionId(connectionState);
    this.$state.value = { ...connectionState, id };
  }

  public isSelected() {
    return this.$state.value.selected;
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.setConnectionsSelection([this.id], selected, strategy);
  }

  public asTConnection(): TConnection {
    return cloneDeep(this.$state.toJSON());
  }

  public updateConnection(connection: Partial<TConnection>): void {
    const { styles, ...newProps } = connection;

    const newStyles = Object.assign({}, this.$state.value.styles, styles);

    this.$state.value = Object.assign({}, this.$state.value, newProps, { styles: newStyles });
  }

  /**
   * Clean up port observers when connection is destroyed
   */
  public destroy(): void {
    // Stop observing source port
    if (this.$sourcePortId.value) {
      this.store.unobservePort(this.$sourcePortId.value, this);
    }

    // Stop observing target port
    if (this.$targetPortId.value) {
      this.store.unobservePort(this.$targetPortId.value, this);
    }
  }
}
