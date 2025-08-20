import { computed, signal } from "@preact/signals-core";

import { GraphComponent } from "../../components/canvas/GraphComponent";
import { Graph } from "../../graph";
import { RootStore } from "../index";

import { PortState, TPort, TPortId } from "./Port";

export class PortsStore {
  public $ports = computed(() => {
    return Array.from(this.$portsMap.value.values());
  });

  public $portsMap = signal<Map<PortState["id"], PortState>>(new Map());

  constructor(
    public rootStore: RootStore,
    protected graph: Graph
  ) {}

  public createPort(id: TPortId, component: GraphComponent): PortState {
    if (this.$portsMap.value.has(id)) {
      const existingPort = this.$portsMap.value.get(id);
      if (existingPort) {
        existingPort.setComponent(component);
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
    return newPort;
  }

  public getPort(id: TPortId): PortState | undefined {
    return this.$portsMap.value.get(id);
  }

  public getOrCreatePort(id: TPortId, component?: GraphComponent): PortState {
    const existingPort = this.getPort(id);
    if (existingPort) {
      return existingPort;
    }

    return this.createPort(id, component);
  }

  public updatePort(id: TPortId, updates: Partial<TPort>): void {
    const port = this.getPort(id);
    if (port) {
      port.updatePort(updates);
    }
  }

  public deletePort(id: TPortId): boolean {
    const deleted = this.$portsMap.value.delete(id);
    return deleted;
  }

  public deletePorts(ids: TPortId[]): void {
    ids.forEach((id) => {
      this.$portsMap.value.delete(id);
    });
  }

  public clearPorts(): void {
    this.$portsMap.value.clear();
  }

  public getPortsByComponent(component: GraphComponent): PortState[] {
    return this.$ports.value.filter((port) => port.component === component);
  }

  public toJSON(): TPort[] {
    return this.$ports.value.map((port) => port.asTPort());
  }

  public ownPort(port: PortState, component: GraphComponent): void {
    port.own(component);
  }

  public unownPort(port: PortState, component: GraphComponent): void {
    port.unown(component);
    if (port.listeners.size === 0 && !port.component) {
      this.deletePort(port.id);
    }
  }

  public reset(): void {
    this.clearPorts();
  }
}
