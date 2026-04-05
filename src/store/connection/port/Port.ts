import { computed, signal } from "@preact/signals-core";

import { Component } from "../../../lib";
import { TPoint } from "../../../utils/types/shapes";

export const IS_PORT_TYPE = "Port" as const;

export type TPortId = string | number | symbol;

/**
 * Port data structure
 * Represents a connection point that can be attached to blocks, anchors, or custom components
 */
export type TPort<T = unknown> = {
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
  /** Arbitrary metadata (port doesn't know what's inside) */
  meta?: T;
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
export class PortState<T = unknown> {
  public $state = signal<TPort<T>>(undefined);

  public owner?: Component;

  private $delegate = signal<PortState | undefined>(undefined);

  private savedPoint: TPoint | undefined;

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
   * Get the port's effective X coordinate (respects delegation)
   *
   * @returns {number} The X coordinate
   */
  public get x(): number {
    return this.$point.value.x;
  }

  /**
   * Get the port's effective Y coordinate (respects delegation)
   *
   * @returns {number} The Y coordinate
   */
  public get y(): number {
    return this.$point.value.y;
  }

  /**
   * Get the component that owns this port
   *
   * @returns {Component | undefined} The owning component, if any
   */
  public get component(): Component | undefined {
    return this.owner || this.$state.value.component;
  }

  public $point = computed(() => {
    const delegate = this.$delegate.value;
    if (delegate) {
      return delegate.$point.value;
    }
    return { x: this.$state.value.x, y: this.$state.value.y };
  });

  /**
   * Get whether the port is in lookup state (waiting for coordinates)
   *
   * @returns {boolean | undefined} True if waiting for coordinates, false if resolved
   */
  public get lookup(): boolean | undefined {
    return this.$state.value.lookup;
  }

  /**
   * Get the port's metadata
   *
   * @returns {T | undefined} The metadata attached to this port
   */
  public get meta(): T | undefined {
    return this.$state.value.meta;
  }

  constructor(port: TPort<T>) {
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
   * Update the port's position coordinates.
   * When delegated, the position is saved but does not affect getPoint() —
   * the effective position comes from the delegate port.
   * @param x New X coordinate
   * @param y New Y coordinate
   */
  public setPoint(x: number, y: number): void {
    if (this.$delegate.value) {
      this.savedPoint = { x, y };
      return;
    }
    this.updatePort({ x, y });
  }

  public getPoint(): TPoint {
    return this.$point.value;
  }

  /**
   * Delegate this port to mirror another port's position.
   * While delegated, getPoint() returns the target port's position.
   * Any setPoint() calls are saved and restored on undelegate().
   * @param target The port to mirror
   */
  public delegate(target: PortState): void {
    this.savedPoint = { x: this.$state.value.x, y: this.$state.value.y };
    this.$delegate.value = target;
  }

  /**
   * Remove delegation and restore the last saved position.
   * If setPoint() was called during delegation, the last value is used.
   * Otherwise, the position from before delegation is restored.
   */
  public undelegate(): void {
    this.$delegate.value = undefined;
    if (this.savedPoint) {
      this.updatePort({ x: this.savedPoint.x, y: this.savedPoint.y });
      this.savedPoint = undefined;
    }
  }

  /**
   * Whether this port is currently delegated to another port
   */
  public get isDelegated(): boolean {
    return this.$delegate.value !== undefined;
  }

  /**
   * Update port state with partial data
   * @param port Partial port data to merge with current state
   */
  public updatePort(port: Partial<TPort<T>>): void {
    this.$state.value = {
      ...this.$state.value,
      ...port,
      meta: {
        ...this.$state.value.meta,
        ...port.meta,
      },
    };
  }

  /**
   * Check if this port can be safely deleted
   * @returns true if port has no owner and no observers
   */
  public canBeDeleted(): boolean {
    return !this.owner && this.observers.size === 0;
  }
}
