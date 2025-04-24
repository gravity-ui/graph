import { computed, signal } from "@preact/signals-core";

import { TConnectionColors } from "../../graphConfig";
import { ISelectionBucket } from "../../services/selection/types";
import { TBlockId } from "../block/Block";

import { ConnectionsStore } from "./ConnectionList";

export const IS_CONNECTION_TYPE = "Connection" as const;

export type TConnectionId = string | number | symbol;

export type TConnection = {
  id?: TConnectionId;
  sourceBlockId: TBlockId;
  targetBlockId: TBlockId;
  sourceAnchorId?: string;
  targetAnchorId?: string;
  label?: string;
  styles?: Partial<TConnectionColors> & {
    dashes?: number[];
  };
  dashed?: boolean;
  selected?: boolean;
};

export class ConnectionState<T extends TConnection = TConnection> {
  public $state = signal<T>(undefined);

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

  public readonly $sourceBlock = computed(() => {
    return this.store.getBlock(this.$state.value.sourceBlockId);
  });

  public readonly $targetBlock = computed(() => {
    return this.store.getBlock(this.$state.value.targetBlockId);
  });

  public $geometry = computed(() => {
    return [this.$sourceBlock.value?.$geometry.value, this.$targetBlock.value?.$geometry.value];
  });

  /**
   * Computed signal that reactively determines if this connection is selected
   * by checking if its ID exists in the selection bucket
   */
  public readonly $selected = computed(() => {
    const id = this.id;
    // Only string and number IDs can be in the selection bucket
    return typeof id === "string" || typeof id === "number"
      ? this.connectionSelectionBucket.$selectedIds.value.has(id)
      : false;
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
    connectionState: T,
    private readonly connectionSelectionBucket: ISelectionBucket<string | number>
  ) {
    const id = ConnectionState.getConnectionId(connectionState);
    this.$state.value = { ...connectionState, id };
  }

  public asTConnection(): TConnection {
    return this.$state.value;
  }

  public updateConnection(connection: Partial<TConnection>): void {
    const { styles, ...newProps } = connection;

    const newStyles = Object.assign({}, this.$state.value.styles, styles);

    this.$state.value = Object.assign({}, this.$state.value, newProps, { styles: newStyles });
  }
}
