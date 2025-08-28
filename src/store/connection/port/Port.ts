import { signal } from "@preact/signals-core";

import { Component } from "../../../lib";

export const IS_PORT_TYPE = "Port" as const;

export type TPortId = string | number | symbol;

/**
 * Port data structure
 * Represents a connection point that can be attached to blocks, anchors, or custom components
 */
export type TPort = {
  /** Unique identifier for the port */
  id: TPortId;
  /** X coordinate of the port */
  x: number;
  /** Y coordinate of the port */
  y: number;
  /** Component that owns this port (block, anchor, etc.) */
  component?: Component;
  /** Whether the port is waiting for position data from its component */
  lookup?: boolean;
};

/**
 * PortState - Reactive state container for a connection port
 *
 * Manages the lifecycle and state of a port, including position updates,
 * component ownership, and listener management for connections that use this port.
 *
 * ## Key Concepts:
 *
 * ### Lazy Creation
 * Ports are created on-demand when connections need them, even if the target
 * component doesn't exist yet. This solves initialization order problems.
 *
 * ### Lookup State
 * When `lookup: true`, the port is waiting for its component to provide coordinates.
 * When `lookup: false`, the port has valid coordinates and can be used for rendering.
 *
 * ### Listener Management
 * Tracks which components are listening to this port's changes. When no listeners
 * remain and no component owns the port, it can be safely garbage collected.
 */
export class PortState {
  public $state = signal<TPort>(undefined);

  public owner?: Component;

  /**
   * Set of references observing this port's changes
   *
   * Used for reference counting to determine when the port can be safely deleted.
   * Stores actual object references to ensure accurate counting and prevent duplicates.
   */
  public observers = new Set<unknown>();

  /**
   * Get the port's unique identifier
   *
   * @returns {TPortId} The port's ID
   */
  public get id(): TPortId {
    return this.$state.value.id;
  }

  /**
   * Get the port's X coordinate
   *
   * @returns {number} The X coordinate
   */
  public get x(): number {
    return this.$state.value.x;
  }

  /**
   * Get the port's Y coordinate
   *
   * @returns {number} The Y coordinate
   */
  public get y(): number {
    return this.$state.value.y;
  }

  /**
   * Get the component that owns this port
   *
   * @returns {Component | undefined} The owning component, if any
   */
  public get component(): Component | undefined {
    return this.owner || this.$state.value.component;
  }

  /**
   * Get whether the port is in lookup state (waiting for coordinates)
   *
   * @returns {boolean | undefined} True if waiting for coordinates, false if resolved
   */
  public get lookup(): boolean | undefined {
    return this.$state.value.lookup;
  }

  constructor(port: TPort) {
    this.$state.value = { ...port };
    // Initialize owner if component was provided in the constructor
    if (port.component) {
      this.owner = port.component;
    }
  }

  /**
   * Set the component that owns this port
   * @param owner Component that will own this port (block, anchor, etc.)
   * @returns void
   */
  public setOwner(owner: Component): void {
    this.owner = owner;
    this.updatePort({ component: owner, lookup: false });
  }

  /**
   * Remove the current owner from this port
   */
  public removeOwner(): void {
    this.owner = undefined;
    this.updatePort({ component: undefined, lookup: true });
  }

  /**
   * Add an observer reference to this port
   * Stores the actual reference for accurate counting
   * @param observer The object observing this port
   */
  public addObserver(observer: unknown): void {
    this.observers.add(observer);
  }

  /**
   * Remove an observer reference from this port
   * Removes the actual reference from the set
   * @param observer The object to stop observing this port
   */
  public removeObserver(observer: unknown): void {
    this.observers.delete(observer);
  }

  /**
   * Update the port's position coordinates
   * @param x New X coordinate
   * @param y New Y coordinate
   */
  public setPoint(x: number, y: number): void {
    this.updatePort({ x, y });
  }

  /**
   * Update port state with partial data
   * @param port Partial port data to merge with current state
   */
  public updatePort(port: Partial<TPort>): void {
    this.$state.value = { ...this.$state.value, ...port };
  }

  /**
   * Check if this port can be safely deleted
   * @returns true if port has no owner and no observers
   */
  public canBeDeleted(): boolean {
    return !this.owner && this.observers.size === 0;
  }
}
