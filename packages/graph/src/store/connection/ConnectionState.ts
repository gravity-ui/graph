import { computed, signal } from "@preact/signals-core";
import cloneDeep from "lodash/cloneDeep";

import { TConnectionColors } from "../../graphConfig";
import { ESelectionStrategy } from "../../utils/types/types";
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
}
