import { computed, signal } from "@preact/signals-core";

import { GraphComponent } from "../../../components/canvas/GraphComponent";
import { Graph } from "../../../graph";
import { Component, ESchedulerPriority } from "@gravity-ui/graph-canvas-core";
import { vectorDistance } from "../../../utils/functions";
import { Point, TPoint } from "../../../utils/types/shapes";
import { debounce } from "../../../utils/utils/schedule";
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
    ids.forEach((id) => {
      this.$portsMap.value.delete(id);
    });
  }

  public clearPorts(): void {
    this.$portsMap.value.clear();
    this.notifyPortMapChanged();
  }

  protected notifyPortMapChanged = debounce(
    () => {
      this.$portsMap.value = new Map(this.$portsMap.value);
    },
    {
      priority: ESchedulerPriority.LOW,
      frameInterval: 1,
    }
  );

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

  /**
   * Find the nearest port at given world coordinates
   * First finds components under cursor, then checks their ports
   *
   * @param point World coordinates to search from
   * @param searchRadius Maximum search radius in pixels (default: 0 - exact match)
   * @param filter Optional filter function to validate ports
   * @returns Nearest port within radius, or undefined if none found
   *
   * @example
   * ```typescript
   * const port = portsStore.findPortAtPoint(
   *   { x: 100, y: 200 },
   *   30,
   *   (port) => !port.lookup && port.owner !== undefined
   * );
   * ```
   */
  public findPortAtPoint(
    point: TPoint,
    searchRadius = 0,
    filter?: (port: PortState) => boolean
  ): PortState | undefined {
    // Get all components under cursor (GraphComponent only)
    const pointObj = new Point(point.x, point.y);
    const component = this.graph.getElementOverPoint(pointObj, [GraphComponent]);
    if (!component) {
      return undefined;
    }
    return this.findPortAtPointByComponent(component, point, searchRadius, filter);
  }

  /**
   * Find the nearest port at given world coordinates for a specific component
   *
   * @param component Component to search in
   * @param point World coordinates to search from
   * @param searchRadius Maximum search radius in pixels (default: 0 - exact match)
   * @param filter Optional filter function to validate ports
   * @returns Nearest port within radius, or undefined if none found
   */
  public findPortAtPointByComponent(
    component: GraphComponent,
    point: TPoint,
    searchRadius = 0,
    filter?: (port: PortState) => boolean
  ): PortState | undefined {
    const ports = component.getPorts();

    for (const port of ports) {
      // Skip ports in lookup state (no valid coordinates)
      if (port.lookup) continue;

      // Calculate vector distance
      const distance = vectorDistance(point, port);

      // Check if within radius and closer than previous
      if (distance <= searchRadius) {
        // Apply optional filter
        if (filter && !filter(port)) continue;
        return port;
      }
    }

    return undefined;
  }
}
