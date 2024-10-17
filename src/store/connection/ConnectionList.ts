import { signal, computed, batch } from "@preact/signals-core";
import { ConnectionState, TConnection, TConnectionId } from "./ConnectionState";
import { RootStore } from "../index";
import { TBlockId } from "../block/Block";
import { Graph } from "../../graph";
import { selectBlockById } from "../../store/block/selectors";
import { ESelectionStrategy } from "../../utils/types/types";

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

  public selectedConnections = new Set<ConnectionState["id"]>();

  public $selectedConnections = computed(() => {
    return new Set(this.$connections.value.filter((connection) => connection.isSelected()));
  });

  public constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  public getBlock(id: TBlockId) {
    return selectBlockById(this.graph, id);
  }

  protected setSelection(
    connection: ConnectionState | ConnectionState["id"],
    selected: boolean,
    params?: { ignoreChange: boolean }
  ) {
    const state = connection instanceof ConnectionState ? connection : this.$connectionsMap.value.get(connection);
    if (state) {
      if (selected !== Boolean(state.$state.value.selected)) {
        if (!params?.ignoreChange) {
          state.updateConnection({
            selected,
          });
        }
        return true;
      }
    }
    return false;
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
    return new ConnectionState(this, connections);
  }

  public addConnection(connection: TConnection): TConnectionId {
    const newConnection = new ConnectionState(this, connection);
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

  protected computeSelectionChange(
    ids: TConnectionId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const list = new Set(this.$selectedConnections.value);
    let add: Set<ConnectionState>;
    let removed: Set<ConnectionState>;
    if (!selected) {
      removed = new Set(
        this.getConnections(ids).filter((connection) => {
          if (this.setSelection(connection, false, { ignoreChange: true })) {
            list.delete(connection);
            return true;
          }
          return false;
        })
      );
    } else {
      if (strategy === ESelectionStrategy.REPLACE) {
        removed = new Set(
          Array.from(this.$selectedConnections.value).filter((connection) => {
            return this.setSelection(connection, false, { ignoreChange: true });
          })
        );
        list.clear();
      }
      add = new Set(
        this.getConnections(ids).filter((connection) => {
          if (
            this.setSelection(connection.id, true, { ignoreChange: true }) ||
            strategy === ESelectionStrategy.REPLACE
          ) {
            removed?.delete(connection);
            list.add(connection);
            return true;
          }
          return false;
        })
      );
    }
    return { add: Array.from(add || []), removed: Array.from(removed || []), list: Array.from(list) };
  }

  public setConnectionsSelection(
    ids: TConnectionId[],
    selected: boolean,
    strategy: ESelectionStrategy = ESelectionStrategy.REPLACE
  ) {
    const { add, removed, list } = this.computeSelectionChange(ids, selected, strategy);
    if (add.length || removed.length) {
      this.graph.executеDefaultEventAction(
        "connection-selection-change",
        {
          list: list.map((c) => c.asTConnection()),
          changes: {
            add: add.map((c) => c.asTConnection()),
            removed: removed.map((c) => c.asTConnection()),
          },
        },
        () => {
          batch(() => {
            removed.forEach((c) => this.setSelection(c.id, false));
            add.forEach((c) => this.setSelection(c.id, true));
          });
        }
      );
    }
  }

  public resetSelection() {
    this.setConnectionsSelection([], false);
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
