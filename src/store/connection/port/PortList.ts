import { computed, signal } from "@preact/signals-core";

import { GraphComponent } from "../../../components/canvas/GraphComponent";
import { Graph } from "../../../graph";
import { Component } from "../../../lib";
import { RootStore } from "../../index";

import { PortState, TPortId } from "./Port";

export class PortsStore {
  public $ports = computed(() => {
    return Array.from(this.$portsMap.value.values());
  });

  public $portsMap = signal<Map<PortState["id"], PortState>>(new Map());

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  public createPort(id: TPortId, component: Component): PortState {
    if (this.$portsMap.value.has(id)) {
      const existingPort = this.$portsMap.value.get(id);
      if (existingPort) {
        existingPort.setOwner(component);
        return existingPort;
      }
    }

    const newPort = new PortState({
      id,
      x: 0,
      y: 0,
      component,
      lookup: !component,
    });

    this.$portsMap.value.set(id, newPort);
    this.notifyPortMapChanged();
    return newPort;
  }

  public getPort(id: TPortId): PortState | undefined {
    return this.$portsMap.value.get(id);
  }

  public getOrCreatePort(id: TPortId, component?: Component): PortState {
    const existingPort = this.getPort(id);
    if (existingPort) {
      if (component && !existingPort.owner) {
        existingPort.setOwner(component);
      }
      return existingPort;
    }

    return this.createPort(id, component);
  }

  public deletePort(id: TPortId): boolean {
    const deleted = this.$portsMap.value.delete(id);
    if (deleted) {
      this.notifyPortMapChanged();
    }
    return deleted;
  }

  public deletePorts(ids: TPortId[]): void {
    let hasChanges = false;
    ids.forEach((id) => {
      if (this.$portsMap.value.delete(id)) {
        hasChanges = true;
      }
    });
    if (hasChanges) {
      this.notifyPortMapChanged();
    }
  }

  public clearPorts(): void {
    this.$portsMap.value.clear();
    this.notifyPortMapChanged();
  }

  protected notifyPortMapChanged(): void {
    this.$portsMap.value = new Map(this.$portsMap.value);
  }

  public getPortsByComponent(component: GraphComponent): PortState[] {
    return this.$ports.value.filter((port) => port.component === component);
  }

  public ownPort(port: PortState, component: GraphComponent): void {
    port.addObserver(component);
  }

  public unownPort(port: PortState, component: GraphComponent): void {
    port.removeObserver(component);
    if (port.observers.size === 0 && !port.component) {
      this.deletePort(port.id);
    }
  }

  public reset(): void {
    this.clearPorts();
  }
}
