import { computed, signal } from "@preact/signals-core";

import { Graph } from "../../graph";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { ESelectionStrategy, ISelectionBucket } from "../../services/selection/types";
import { selectBlockById } from "../../store/block/selectors";
import { TBlockId } from "../block/Block";
import { RootStore } from "../index";

import { ConnectionState, TConnection, TConnectionId } from "./ConnectionState";

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    "connection-selection-change": (event: SelectionEvent<TConnection>) => void;
  }
}

export class ConnectionsStore {
  public $connections = computed(() => {
    return Array.from(this.$connectionsMap.value.values());
  });

  public $connectionsMap = signal<Map<ConnectionState["id"], ConnectionState>>(new Map());

  /**
   * Bucket for managing connection selection state
   */
  public readonly connectionSelectionBucket: ISelectionBucket<string | number>;

  public $selectedConnections = computed(() => {
    const selectedIds = this.connectionSelectionBucket.$selectedIds.value;
    return new Set(
      this.$connections.value.filter((connection) => {
        const id = connection.id;
        return typeof id === "string" || typeof id === "number" ? selectedIds.has(id) : false;
      })
    );
  });

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {
    // Create and register a selection bucket for connections
    this.connectionSelectionBucket = new MultipleSelectionBucket<string | number>(
      graph,
      "connection",
      "connection-selection-change"
    );

    this.rootStore.selectionService.registerBucket(this.connectionSelectionBucket);
  }

  public getBlock(id: TBlockId) {
    return selectBlockById(this.graph, id);
  }

  public updateConnections(connections: TConnection[]) {
    this.$connectionsMap.value = connections.reduce((acc, connection) => {
      const c = this.getOrCreateConnection(connection);
      acc.set(c.id, c);
      return acc;
    }, this.$connectionsMap.value);
  }

  public setConnections(connections: TConnection[]) {
    this.$connectionsMap.value = new Map(
      connections.map((connection) => {
        const c = this.getOrCreateConnection(connection);
        return [c.id, c];
      })
    );
  }

  protected getOrCreateConnection(connections: TConnection) {
    const id = ConnectionState.getConnectionId(connections);
    if (this.$connectionsMap.value.has(id)) {
      const c = this.$connectionsMap.value.get(id);
      c.updateConnection(connections);
      return c;
    }
    return new ConnectionState(this, connections, this.connectionSelectionBucket);
  }

  public addConnection(connection: TConnection): TConnectionId {
    const newConnection = new ConnectionState(this, connection, this.connectionSelectionBucket);
    this.$connectionsMap.value.set(newConnection.id, newConnection);
    this.notifyConnectionMapChanged();
    return newConnection.id;
  }

  protected notifyConnectionMapChanged() {
    this.$connectionsMap.value = new Map(this.$connectionsMap.value);
  }

  public deleteConnections(connections: ConnectionState[]) {
    connections.forEach((c) => {
      this.$connectionsMap.value.delete(c.id);
    });
    this.notifyConnectionMapChanged();
  }

  public deleteSelectedConnections() {
    this.$connections.value.forEach((c) => {
      if (c.$state.value.selected) {
        this.$connectionsMap.value.delete(c.id);
      }
    });
    this.notifyConnectionMapChanged();
  }

  /**
   * Updates connection selection using the SelectionService
   * @param ids Connection IDs to update selection for
   * @param selected Whether to select or deselect
   * @param strategy The selection strategy to apply
   */
  public setConnectionsSelection(
    ids: TConnectionId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    // Filter out non-string/number ids since SelectionService only supports string and number ids
    const validIds = ids.filter((id) => typeof id === "string" || typeof id === "number") as (string | number)[];

    if (selected) {
      this.rootStore.selectionService.select("connection", validIds, strategy);
    } else {
      this.rootStore.selectionService.deselect("connection", validIds);
    }
  }

  /**
   * Resets the selection for connections
   */
  public resetSelection() {
    this.rootStore.selectionService.resetSelection("connection");
  }
  public getConnections(ids?: ConnectionState["id"][]) {
    if (!ids || !ids.length) {
      return this.$connections.value;
    }
    const map = this.$connectionsMap.value;
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  public reset() {
    this.setConnections([]);
  }
}
