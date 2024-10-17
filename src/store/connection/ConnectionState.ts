import { signal, computed } from "@preact/signals-core";
import { TBlockId } from "../block/Block";
import { TConnectionColors } from "../../graphConfig";
import { ConnectionsStore } from "./ConnectionList";
import { ESelectionStrategy } from "../../utils/types/types";

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

export class ConnectionState {
  public $state = signal<TConnection>(undefined);

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

  public $sourceBlock = computed(() => {
    return this.store.getBlock(this.sourceBlockId);
  });

  public $targetBlock = computed(() => {
    return this.store.getBlock(this.targetBlockId);
  });

  public static getConnectionId(connection: TConnection) {
    if (connection.id) return connection.id;
    if (connection.sourceAnchorId && connection.targetAnchorId) {
      return [connection.sourceAnchorId, connection.targetAnchorId].join(":");
    }
    return [connection.sourceBlockId, connection.targetBlockId].join(":");
  }

  public constructor(
    public store: ConnectionsStore,
    connectionState: TConnection
  ) {
    const id = ConnectionState.getConnectionId(connectionState);
    this.$state.value = {...connectionState, id};
  }

  public isSelected() {
    return this.$state.value.selected;
  }

  public setSelection(selected: boolean, strategy: ESelectionStrategy = ESelectionStrategy.REPLACE) {
    this.store.setConnectionsSelection([this.id], selected, strategy);
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
