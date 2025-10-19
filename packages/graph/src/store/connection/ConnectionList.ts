import { computed, signal } from "@preact/signals-core";

import { BaseConnection } from "../../components/canvas/connections";
import { Graph } from "../../graph";
import { Component } from "../../lib";
import { MultipleSelectionBucket } from "../../services/selection/MultipleSelectionBucket";
import { ESelectionStrategy } from "../../services/selection/types";
import { RootStore } from "../index";

import { ConnectionState, TConnection, TConnectionId } from "./ConnectionState";
import { PortState, TPortId } from "./port/Port";
import { PortsStore } from "./port/PortList";

declare module "../../graphEvents" {
  interface GraphEventsDefinitions {
    "connection-selection-change": (event: SelectionEvent<TConnection["id"]>) => void;
  }
}

export class ConnectionsStore {
  public $connections = computed(() => {
    return Array.from(this.$connectionsMap.value.values());
  });

  public $connectionsMap = signal<Map<TConnectionId, ConnectionState>>(new Map());

  /**
   * Bucket for managing connection selection state
   */
  public readonly connectionSelectionBucket = new MultipleSelectionBucket<string | number>(
    "connection",
    (payload, defaultAction) => {
      return this.graph.executеDefaultEventAction("connection-selection-change", payload, defaultAction);
    }
  );

  public $selectedConnections = computed(() => {
    const items = this.connectionSelectionBucket.$selected.value;
    return Array.from(items)
      .map((id) => this.getConnectionState(id))
      .filter(Boolean);
  });

  protected ports: PortsStore;

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {
    this.ports = new PortsStore(this.rootStore, this.graph);
    // Create and register a selection bucket for connections
    this.connectionSelectionBucket = new MultipleSelectionBucket<string | number>(
      "connection",
      (payload, defaultAction) => {
        return this.graph.executеDefaultEventAction("connection-selection-change", payload, defaultAction);
      },
      (element) => element instanceof BaseConnection
    );

    this.connectionSelectionBucket.attachToManager(this.rootStore.selectionService);
  }

  /**
   * Claim ownership of a port (for Blocks, Anchors)
   * @param id Port identifier
   * @param owner Component that will own this port
   * @returns The port state
   */
  public claimPort(id: TPortId, owner: Component): PortState {
    const port = this.ports.getOrCreatePort(id);
    port.setOwner(owner);
    return port;
  }

  /**
   * Release ownership of a port (when Block/Anchor is destroyed)
   * @param id Port identifier
   * @param owner Component that currently owns this port
   */
  public releasePort(id: TPortId, owner: Component): void {
    const port = this.ports.getPort(id);
    if (port?.owner === owner) {
      port.removeOwner();
      this.checkAndDeletePort(id);
    }
  }

  /**
   * Start observing a port (for Connections)
   * @param id Port identifier
   * @param observer The object that will observe this port
   * @returns The port state
   */
  public observePort(id: TPortId, observer: unknown): PortState {
    const port = this.ports.getOrCreatePort(id);
    port.addObserver(observer);
    return port;
  }

  /**
   * Stop observing a port (when Connection is destroyed)
   * @param id Port identifier
   * @param observer The object that was observing this port
   */
  public unobservePort(id: TPortId, observer: unknown): void {
    const port = this.ports.getPort(id);
    if (port) {
      port.removeObserver(observer);
      this.checkAndDeletePort(id);
    }
  }

  /**
   * Get a port by its ID
   * @param id Port identifier
   * @returns The port state if it exists
   */
  public getPort(id: TPortId): PortState | undefined {
    return this.ports.getPort(id);
  }

  /**
   * Check if a port exists
   * @param id Port identifier
   * @returns true if port exists
   */
  public hasPort(id: TPortId): boolean {
    return this.ports.getPort(id) !== undefined;
  }

  /**
   * Check if a port can be deleted and delete it if possible
   * @param id Port identifier
   */
  private checkAndDeletePort(id: TPortId): void {
    const port = this.ports.getPort(id);
    if (port && port.canBeDeleted()) {
      this.ports.deletePort(id);
    }
  }

  public deletePorts(ports: TPortId[]) {
    this.ports.deletePorts(ports);
  }

  protected setSelection(
    connection: ConnectionState | TConnectionId,
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
      c.destroy(); // Clean up port observers
      this.$connectionsMap.value.delete(c.id);
    });
    this.notifyConnectionMapChanged();
  }

  public deleteSelectedConnections() {
    this.$connections.value.forEach((c) => {
      if (c.$state.value.selected) {
        c.destroy(); // Clean up port observers
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
    if (selected) {
      this.connectionSelectionBucket.select(ids, strategy);
    } else {
      this.connectionSelectionBucket.deselect(ids);
    }
  }

  /**
   * Resets the selection for connections
   *
   * @returns {void}
   */
  public resetSelection() {
    this.connectionSelectionBucket.reset();
  }

  public getConnections(ids?: TConnectionId[]) {
    if (!ids || !ids.length) {
      return this.$connections.value;
    }
    const map = this.$connectionsMap.value;
    return ids.map((id) => map.get(id)).filter(Boolean);
  }

  public getConnectionState(id: TConnectionId) {
    return this.$connectionsMap.value.get(id);
  }

  public getConnection(id: TConnectionId): TConnection | undefined {
    return this.getConnectionState(id)?.toJSON();
  }

  public getConnectionStates(ids: TConnectionId[]) {
    return ids.map((id) => this.getConnectionState(id)).filter(Boolean);
  }

  public toJSON() {
    return this.$connections.value.map((c) => c.toJSON());
  }

  public reset() {
    // Clean up all connections first
    this.$connections.value.forEach((c) => {
      c.destroy();
    });

    this.setConnections([]);
    this.ports.reset();
  }
}
